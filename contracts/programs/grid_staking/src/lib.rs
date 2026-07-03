//! GRID Staking — stake-to-list on-chain (C3 on docs/ROADMAP.md).
//!
//! Mirrors the platform's listing-stake mechanics: stakers lock GRID behind a
//! market (a stake-weighted listing vote), earn a pro-rata share of the USDC
//! trade fees the platform deposits (MasterChef-style accumulator), unstake
//! after the lock matures — and on confirmed fraud the pool SLASHES: all locked
//! principal sweeps to the treasury (earned rewards stay claimable; the fraud
//! penalty hits the vouching capital, not the wages of honest attention).
//!
//! v1 authority = the platform's operational key (init/deposit_fees/slash);
//! stake/claim/unstake are per-staker. Two mints: GRID (staked) + USDC (rewards).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("3K6UCstVDp3yJazAs28b47Gftbqr28pZpPKX29G32d2m");

const ACC_SCALE: u128 = 1_000_000_000_000; // reward-per-share fixed-point scale

#[program]
pub mod grid_staking {
    use super::*;

    /// Platform opens a pool for a market. `lock_seconds` applies per-stake.
    pub fn init_pool(ctx: Context<InitPool>, market_id: u64, lock_seconds: i64) -> Result<()> {
        require!(lock_seconds >= 0, StakeError::BadInput);
        let p = &mut ctx.accounts.pool;
        p.authority = ctx.accounts.authority.key();
        p.market_id = market_id;
        p.grid_mint = ctx.accounts.grid_mint.key();
        p.usdc_mint = ctx.accounts.usdc_mint.key();
        p.lock_seconds = lock_seconds;
        p.total_staked = 0;
        p.acc_reward_per_share = 0;
        p.slashed = false;
        p.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Lock GRID behind the market. Harvests pending rewards first.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeError::BadInput);
        require!(!ctx.accounts.pool.slashed, StakeError::PoolSlashed);
        harvest(
            &ctx.accounts.pool,
            &mut ctx.accounts.stake_account,
            &ctx.accounts.reward_vault,
            &ctx.accounts.staker_usdc,
            &ctx.accounts.token_program,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.staker_grid.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            ),
            amount,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.pool;
        let s = &mut ctx.accounts.stake_account;
        if s.amount == 0 {
            s.pool = p.key();
            s.staker = ctx.accounts.staker.key();
            s.bump = ctx.bumps.stake_account;
        }
        s.amount = s.amount.checked_add(amount).ok_or(StakeError::Overflow)?;
        s.unlock_at = now.checked_add(p.lock_seconds).ok_or(StakeError::Overflow)?;
        p.total_staked = p.total_staked.checked_add(amount).ok_or(StakeError::Overflow)?;
        s.reward_debt = acc_owed(p, s.amount);
        emit!(Staked { pool: p.key(), staker: s.staker, amount, total: p.total_staked });
        Ok(())
    }

    /// Platform deposits the stakers' share of trade fees (USDC) into the pool.
    pub fn deposit_fees(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeError::BadInput);
        let p = &ctx.accounts.pool;
        require!(p.total_staked > 0, StakeError::NoStake);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.authority_usdc.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        let p = &mut ctx.accounts.pool;
        p.acc_reward_per_share = p
            .acc_reward_per_share
            .checked_add((amount as u128).checked_mul(ACC_SCALE).ok_or(StakeError::Overflow)? / (p.total_staked as u128))
            .ok_or(StakeError::Overflow)?;
        emit!(FeesDeposited { pool: p.key(), amount });
        Ok(())
    }

    /// Claim pending USDC rewards (allowed even after a slash — wages survive).
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        harvest(
            &ctx.accounts.pool,
            &mut ctx.accounts.stake_account,
            &ctx.accounts.reward_vault,
            &ctx.accounts.staker_usdc,
            &ctx.accounts.token_program,
        )?;
        let p = &ctx.accounts.pool;
        let s = &mut ctx.accounts.stake_account;
        s.reward_debt = acc_owed(p, s.amount);
        Ok(())
    }

    /// Return matured principal. Blocked while locked and forever after a slash.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let p = &ctx.accounts.pool;
            let s = &ctx.accounts.stake_account;
            require!(!p.slashed, StakeError::PoolSlashed);
            require!(amount > 0 && amount <= s.amount, StakeError::BadInput);
            require!(now >= s.unlock_at, StakeError::StillLocked);
        }
        harvest(
            &ctx.accounts.pool,
            &mut ctx.accounts.stake_account,
            &ctx.accounts.reward_vault,
            &ctx.accounts.staker_usdc,
            &ctx.accounts.token_program,
        )?;

        let pool_key = ctx.accounts.pool.key();
        let seeds: &[&[u8]] = &[
            b"pool",
            ctx.accounts.pool.authority.as_ref(),
            &ctx.accounts.pool.market_id.to_le_bytes(),
            &[ctx.accounts.pool.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.staker_grid.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        let p = &mut ctx.accounts.pool;
        let s = &mut ctx.accounts.stake_account;
        s.amount -= amount;
        p.total_staked -= amount;
        s.reward_debt = acc_owed(p, s.amount);
        emit!(Unstaked { pool: pool_key, staker: s.staker, amount });
        Ok(())
    }

    /// Confirmed fraud: ALL locked principal sweeps to the treasury. Terminal.
    pub fn slash(ctx: Context<Slash>) -> Result<()> {
        require!(!ctx.accounts.pool.slashed, StakeError::PoolSlashed);
        let swept = ctx.accounts.stake_vault.amount;
        if swept > 0 {
            let seeds: &[&[u8]] = &[
                b"pool",
                ctx.accounts.pool.authority.as_ref(),
                &ctx.accounts.pool.market_id.to_le_bytes(),
                &[ctx.accounts.pool.bump],
            ];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.stake_vault.to_account_info(),
                        to: ctx.accounts.treasury_grid.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                swept,
            )?;
        }
        let p = &mut ctx.accounts.pool;
        p.slashed = true;
        emit!(PoolSlashed { pool: p.key(), swept });
        Ok(())
    }
}

/* --------------------------------- internals --------------------------------- */

fn acc_owed(pool: &Account<StakePool>, amount: u64) -> u128 {
    (amount as u128) * pool.acc_reward_per_share / ACC_SCALE
}

/// Pay out any pending rewards for the CURRENT stake amount.
fn harvest<'info>(
    pool: &Account<'info, StakePool>,
    stake_account: &mut Account<'info, StakeAccount>,
    reward_vault: &Account<'info, TokenAccount>,
    staker_usdc: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    if stake_account.amount == 0 {
        return Ok(());
    }
    let owed = acc_owed(pool, stake_account.amount);
    let pending = owed.saturating_sub(stake_account.reward_debt) as u64;
    if pending == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes(), &[pool.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: reward_vault.to_account_info(),
                to: staker_usdc.to_account_info(),
                authority: pool.to_account_info(),
            },
            &[seeds],
        ),
        pending,
    )?;
    stake_account.reward_debt = owed;
    emit!(RewardsClaimed { pool: pool.key(), staker: stake_account.staker, amount: pending });
    Ok(())
}

/* ---------------------------------- state ------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct StakePool {
    pub authority: Pubkey,
    pub market_id: u64,
    pub grid_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub lock_seconds: i64,
    pub total_staked: u64,
    pub acc_reward_per_share: u128, // ×ACC_SCALE
    pub slashed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub pool: Pubkey,
    pub staker: Pubkey,
    pub amount: u64,
    pub reward_debt: u128, // ×ACC_SCALE-scaled amount already accounted
    pub unlock_at: i64,
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + StakePool::INIT_SPACE,
        seeds = [b"pool", authority.key().as_ref(), &market_id.to_le_bytes()], bump
    )]
    pub pool: Account<'info, StakePool>,
    pub grid_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = authority, associated_token::mint = grid_mint, associated_token::authority = pool)]
    pub stake_vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = authority, associated_token::mint = usdc_mint, associated_token::authority = pool)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    #[account(mut, seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump)]
    pub pool: Account<'info, StakePool>,
    #[account(
        init_if_needed, payer = staker, space = 8 + StakeAccount::INIT_SPACE,
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref()], bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(mut, constraint = staker_grid.mint == pool.grid_mint @ StakeError::WrongMint)]
    pub staker_grid: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = staker_usdc.mint == pool.usdc_mint @ StakeError::WrongMint, constraint = staker_usdc.owner == staker.key() @ StakeError::WrongOwner)]
    pub staker_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.grid_mint, associated_token::authority = pool)]
    pub stake_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.usdc_mint, associated_token::authority = pool)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositFees<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ StakeError::NotAuthority
    )]
    pub pool: Account<'info, StakePool>,
    #[account(mut, constraint = authority_usdc.mint == pool.usdc_mint @ StakeError::WrongMint)]
    pub authority_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.usdc_mint, associated_token::authority = pool)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    pub staker: Signer<'info>,
    #[account(mut, seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump)]
    pub pool: Account<'info, StakePool>,
    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref()], bump = stake_account.bump,
        has_one = staker @ StakeError::WrongOwner
    )]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(mut, associated_token::mint = pool.usdc_mint, associated_token::authority = pool)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = staker_usdc.mint == pool.usdc_mint @ StakeError::WrongMint, constraint = staker_usdc.owner == staker.key() @ StakeError::WrongOwner)]
    pub staker_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    pub staker: Signer<'info>,
    #[account(mut, seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump)]
    pub pool: Account<'info, StakePool>,
    #[account(
        mut,
        seeds = [b"stake", pool.key().as_ref(), staker.key().as_ref()], bump = stake_account.bump,
        has_one = staker @ StakeError::WrongOwner
    )]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(mut, constraint = staker_grid.mint == pool.grid_mint @ StakeError::WrongMint, constraint = staker_grid.owner == staker.key() @ StakeError::WrongOwner)]
    pub staker_grid: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = staker_usdc.mint == pool.usdc_mint @ StakeError::WrongMint, constraint = staker_usdc.owner == staker.key() @ StakeError::WrongOwner)]
    pub staker_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.grid_mint, associated_token::authority = pool)]
    pub stake_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.usdc_mint, associated_token::authority = pool)]
    pub reward_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Slash<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ StakeError::NotAuthority
    )]
    pub pool: Account<'info, StakePool>,
    #[account(mut, associated_token::mint = pool.grid_mint, associated_token::authority = pool)]
    pub stake_vault: Box<Account<'info, TokenAccount>>,
    /// the treasury's GRID account — the slash destination
    #[account(mut, constraint = treasury_grid.mint == pool.grid_mint @ StakeError::WrongMint)]
    pub treasury_grid: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct Staked { pub pool: Pubkey, pub staker: Pubkey, pub amount: u64, pub total: u64 }
#[event]
pub struct Unstaked { pub pool: Pubkey, pub staker: Pubkey, pub amount: u64 }
#[event]
pub struct FeesDeposited { pub pool: Pubkey, pub amount: u64 }
#[event]
pub struct RewardsClaimed { pub pool: Pubkey, pub staker: Pubkey, pub amount: u64 }
#[event]
pub struct PoolSlashed { pub pool: Pubkey, pub swept: u64 }

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum StakeError {
    #[msg("bad input")] BadInput,
    #[msg("arithmetic overflow")] Overflow,
    #[msg("nothing staked")] NoStake,
    #[msg("stake is still locked")] StillLocked,
    #[msg("pool was slashed")] PoolSlashed,
    #[msg("wrong token mint")] WrongMint,
    #[msg("wrong token account owner")] WrongOwner,
    #[msg("only the pool authority may do this")] NotAuthority,
}
