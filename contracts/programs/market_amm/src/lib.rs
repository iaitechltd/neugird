//! Market AMM — TradeX spot settlement on-chain (T1 of docs/TRADING_ENGINE_AUDIT.md §5).
//!
//! One constant-product pool per market: REAL SPL vaults back the reserves the
//! platform previously kept as ledger numbers (audit F3). Launch seeds the
//! pool; every buy/sell settles against the vaults with the fee taken OUTSIDE
//! the curve in quote (USDC) into a separate fee vault, so k never decays and
//! the fee split (stakers/treasury) stays platform-routable and auditable.
//!
//! v1 custody posture (same as the other six rails): `authority` = the
//! platform's operational key executes swaps mirroring user trades; the
//! recipient token accounts are explicit, so per-user wallet-adapter signing
//! slots in later without changing the program. Alpha and Spot share this
//! program — the stage is platform metadata.
//!
//! Rounding: output is floored via ceil-division on the new reserve, so the
//! invariant k' >= k holds on every swap; the trader never receives dust the
//! pool doesn't have.
//!
//! T3: every pool carries a TwapState — a UniV2-style cumulative price
//! accumulator touched BEFORE each seed/swap moves the reserves (the price
//! that HELD since the last touch accrues × elapsed seconds). Consumers (the
//! perp_vault mark oracle) read two snapshots and divide: an on-chain TWAP no
//! platform report can falsify.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("7GduaGprJYDvhziiVLNzAWAsG95kECc942CsnodFX6VL");

const MAX_FEE_BPS: u16 = 1_000; // hard cap: 10%

#[program]
pub mod market_amm {
    use super::*;

    /// Open a pool for a market. `market_id` = the platform's stable u64 hash.
    pub fn create_pool(ctx: Context<CreatePool>, market_id: u64, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, AmmError::BadInput);
        require!(
            ctx.accounts.base_mint.key() != ctx.accounts.quote_mint.key(),
            AmmError::BadInput
        );
        let p = &mut ctx.accounts.pool;
        p.authority = ctx.accounts.authority.key();
        p.market_id = market_id;
        p.base_mint = ctx.accounts.base_mint.key();
        p.quote_mint = ctx.accounts.quote_mint.key();
        p.fee_bps = fee_bps;
        p.fees_accrued = 0;
        p.halted = false;
        p.bump = ctx.bumps.pool;
        let t = &mut ctx.accounts.twap_state;
        t.pool = p.key();
        t.price_cumulative = 0;
        t.last_price_micro = 0;
        t.last_ts = Clock::get()?.unix_timestamp;
        t.bump = ctx.bumps.twap_state;
        emit!(PoolCreated {
            pool: p.key(),
            market_id,
            base_mint: p.base_mint,
            quote_mint: p.quote_mint,
            fee_bps
        });
        Ok(())
    }

    /// Deposit launch liquidity (both sides) from the authority's accounts.
    /// Callable again for top-ups; reserves are always the vault balances.
    pub fn seed(ctx: Context<Seed>, base_amount: u64, quote_amount: u64) -> Result<()> {
        require!(base_amount > 0 && quote_amount > 0, AmmError::BadInput);
        require!(!ctx.accounts.pool.halted, AmmError::PoolHalted);
        touch_twap(
            &mut ctx.accounts.twap_state,
            ctx.accounts.base_vault.amount,
            ctx.accounts.quote_vault.amount,
            Clock::get()?.unix_timestamp,
        );
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.authority_base.to_account_info(),
                    to: ctx.accounts.base_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            base_amount,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.authority_quote.to_account_info(),
                    to: ctx.accounts.quote_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            quote_amount,
        )?;
        emit!(Seeded {
            pool: ctx.accounts.pool.key(),
            base_amount,
            quote_amount,
            base_reserve: ctx.accounts.base_vault.amount + base_amount,
            quote_reserve: ctx.accounts.quote_vault.amount + quote_amount,
        });
        Ok(())
    }

    /// Execute a swap against the pool. `direction`: 0 = buy (quote in, base
    /// out), 1 = sell (base in, quote out). Fee is charged in quote, outside
    /// the curve, into the fee vault. `min_out` = slippage guard on the net.
    pub fn swap(ctx: Context<Swap>, direction: u8, amount_in: u64, min_out: u64) -> Result<()> {
        require!(amount_in > 0, AmmError::BadInput);
        require!(direction <= 1, AmmError::BadInput);
        require!(!ctx.accounts.pool.halted, AmmError::PoolHalted);

        let base_r = ctx.accounts.base_vault.amount as u128;
        let quote_r = ctx.accounts.quote_vault.amount as u128;
        require!(base_r > 0 && quote_r > 0, AmmError::EmptyPool);
        touch_twap(
            &mut ctx.accounts.twap_state,
            ctx.accounts.base_vault.amount,
            ctx.accounts.quote_vault.amount,
            Clock::get()?.unix_timestamp,
        );
        let k = base_r.checked_mul(quote_r).ok_or(AmmError::Overflow)?;
        let fee_bps = ctx.accounts.pool.fee_bps as u128;

        let (fee, out) = if direction == 0 {
            // BUY — fee off the quote paid in, remainder moves the curve
            let fee = (amount_in as u128) * fee_bps / 10_000;
            let net_in = (amount_in as u128) - fee;
            require!(net_in > 0, AmmError::BadInput);
            let new_quote = quote_r.checked_add(net_in).ok_or(AmmError::Overflow)?;
            let new_base = k.div_ceil(new_quote); // ceil keeps k' >= k
            let out = base_r.saturating_sub(new_base);
            require!(out > 0, AmmError::Slippage);
            require!(out >= min_out as u128, AmmError::Slippage);
            require!(out < base_r, AmmError::EmptyPool);

            // quote in (net), fee to the fee vault — both signed by the trader-side signer
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.user_quote.to_account_info(),
                        to: ctx.accounts.quote_vault.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                net_in as u64,
            )?;
            if fee > 0 {
                token::transfer(
                    CpiContext::new(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.user_quote.to_account_info(),
                            to: ctx.accounts.fee_vault.to_account_info(),
                            authority: ctx.accounts.authority.to_account_info(),
                        },
                    ),
                    fee as u64,
                )?;
            }
            // base out, signed by the pool PDA
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
                        from: ctx.accounts.base_vault.to_account_info(),
                        to: ctx.accounts.user_base.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                out as u64,
            )?;
            (fee, out)
        } else {
            // SELL — base in moves the curve; fee off the gross quote proceeds
            let new_base = base_r.checked_add(amount_in as u128).ok_or(AmmError::Overflow)?;
            let new_quote_min = k.div_ceil(new_base);
            let gross = quote_r.saturating_sub(new_quote_min);
            let fee = gross * fee_bps / 10_000;
            let net = gross - fee;
            require!(net > 0, AmmError::Slippage);
            require!(net >= min_out as u128, AmmError::Slippage);

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.user_base.to_account_info(),
                        to: ctx.accounts.base_vault.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                amount_in,
            )?;
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
                        from: ctx.accounts.quote_vault.to_account_info(),
                        to: ctx.accounts.user_quote.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                net as u64,
            )?;
            if fee > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.quote_vault.to_account_info(),
                            to: ctx.accounts.fee_vault.to_account_info(),
                            authority: ctx.accounts.pool.to_account_info(),
                        },
                        &[seeds],
                    ),
                    fee as u64,
                )?;
            }
            (fee, net)
        };

        let p = &mut ctx.accounts.pool;
        p.fees_accrued = p.fees_accrued.saturating_add(fee as u64);
        emit!(Swapped {
            pool: p.key(),
            direction,
            amount_in,
            amount_out: out as u64,
            fee: fee as u64,
        });
        Ok(())
    }

    /// Move accrued quote fees out for distribution (stakers/treasury split is
    /// platform-routed). `amount` 0 = sweep everything.
    pub fn sweep_fees(ctx: Context<SweepFees>, amount: u64) -> Result<()> {
        let available = ctx.accounts.fee_vault.amount;
        let take = if amount == 0 { available } else { amount };
        require!(take > 0 && take <= available, AmmError::BadInput);
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
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.to_quote.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            take,
        )?;
        emit!(FeesSwept { pool: ctx.accounts.pool.key(), amount: take });
        Ok(())
    }

    /// Fraud halt mirror (Markets.flagFraud): blocks seed + swap, reversible.
    pub fn set_halt(ctx: Context<SetHalt>, halted: bool) -> Result<()> {
        ctx.accounts.pool.halted = halted;
        emit!(HaltSet { pool: ctx.accounts.pool.key(), halted });
        Ok(())
    }

    /// Authority escape hatch (migration / emergency). Loud by design — every
    /// withdrawal is an on-chain event anyone can audit.
    pub fn withdraw(ctx: Context<Withdraw>, base_amount: u64, quote_amount: u64) -> Result<()> {
        require!(base_amount > 0 || quote_amount > 0, AmmError::BadInput);
        let seeds: &[&[u8]] = &[
            b"pool",
            ctx.accounts.pool.authority.as_ref(),
            &ctx.accounts.pool.market_id.to_le_bytes(),
            &[ctx.accounts.pool.bump],
        ];
        if base_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.base_vault.to_account_info(),
                        to: ctx.accounts.to_base.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                base_amount,
            )?;
        }
        if quote_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.quote_vault.to_account_info(),
                        to: ctx.accounts.to_quote.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                quote_amount,
            )?;
        }
        emit!(Withdrawn { pool: ctx.accounts.pool.key(), base_amount, quote_amount });
        Ok(())
    }
}

/* --------------------------------- internals ---------------------------------- */

/// Accrue the price that HELD since the last touch (call BEFORE reserves move).
fn touch_twap(t: &mut Account<TwapState>, base_r: u64, quote_r: u64, now: i64) {
    if base_r > 0 {
        let price = (quote_r as u128).saturating_mul(1_000_000) / (base_r as u128);
        if t.last_ts > 0 && now > t.last_ts {
            t.price_cumulative = t
                .price_cumulative
                .saturating_add(price.saturating_mul((now - t.last_ts) as u128));
        }
        t.last_price_micro = price as u64;
    }
    t.last_ts = now;
}

/* ---------------------------------- state ------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct TwapState {
    pub pool: Pubkey,
    pub price_cumulative: u128, // Σ price_micro × elapsed_seconds
    pub last_price_micro: u64,  // the price holding since last_ts
    pub last_ts: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AmmPool {
    pub authority: Pubkey,
    pub market_id: u64,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub fee_bps: u16,
    pub fees_accrued: u64, // lifetime quote fees routed through the fee vault
    pub halted: bool,
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + AmmPool::INIT_SPACE,
        seeds = [b"pool", authority.key().as_ref(), &market_id.to_le_bytes()], bump
    )]
    pub pool: Account<'info, AmmPool>,
    pub base_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = authority, associated_token::mint = base_mint, associated_token::authority = pool)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = authority, associated_token::mint = quote_mint, associated_token::authority = pool)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = authority,
        token::mint = quote_mint, token::authority = pool,
        seeds = [b"fees", pool.key().as_ref()], bump
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = authority, space = 8 + TwapState::INIT_SPACE,
        seeds = [b"twap", pool.key().as_ref()], bump
    )]
    pub twap_state: Account<'info, TwapState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Seed<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ AmmError::NotAuthority
    )]
    pub pool: Account<'info, AmmPool>,
    #[account(mut, constraint = authority_base.mint == pool.base_mint @ AmmError::WrongMint)]
    pub authority_base: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = authority_quote.mint == pool.quote_mint @ AmmError::WrongMint)]
    pub authority_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.base_mint, associated_token::authority = pool)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.quote_mint, associated_token::authority = pool)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"twap", pool.key().as_ref()], bump = twap_state.bump)]
    pub twap_state: Account<'info, TwapState>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ AmmError::NotAuthority
    )]
    pub pool: Account<'info, AmmPool>,
    #[account(mut, associated_token::mint = pool.base_mint, associated_token::authority = pool)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.quote_mint, associated_token::authority = pool)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = pool.quote_mint, token::authority = pool, seeds = [b"fees", pool.key().as_ref()], bump)]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"twap", pool.key().as_ref()], bump = twap_state.bump)]
    pub twap_state: Account<'info, TwapState>,
    /// trader-side base account (out on buy, in on sell)
    #[account(mut, constraint = user_base.mint == pool.base_mint @ AmmError::WrongMint)]
    pub user_base: Box<Account<'info, TokenAccount>>,
    /// trader-side quote account (in on buy, out on sell)
    #[account(mut, constraint = user_quote.mint == pool.quote_mint @ AmmError::WrongMint)]
    pub user_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SweepFees<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ AmmError::NotAuthority
    )]
    pub pool: Account<'info, AmmPool>,
    #[account(mut, token::mint = pool.quote_mint, token::authority = pool, seeds = [b"fees", pool.key().as_ref()], bump)]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = to_quote.mint == pool.quote_mint @ AmmError::WrongMint)]
    pub to_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetHalt<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ AmmError::NotAuthority
    )]
    pub pool: Account<'info, AmmPool>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"pool", pool.authority.as_ref(), &pool.market_id.to_le_bytes()], bump = pool.bump,
        has_one = authority @ AmmError::NotAuthority
    )]
    pub pool: Account<'info, AmmPool>,
    #[account(mut, associated_token::mint = pool.base_mint, associated_token::authority = pool)]
    pub base_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = pool.quote_mint, associated_token::authority = pool)]
    pub quote_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = to_base.mint == pool.base_mint @ AmmError::WrongMint)]
    pub to_base: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = to_quote.mint == pool.quote_mint @ AmmError::WrongMint)]
    pub to_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub market_id: u64,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub fee_bps: u16,
}
#[event]
pub struct Seeded {
    pub pool: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub base_reserve: u64,
    pub quote_reserve: u64,
}
#[event]
pub struct Swapped {
    pub pool: Pubkey,
    pub direction: u8,
    pub amount_in: u64,
    pub amount_out: u64,
    pub fee: u64,
}
#[event]
pub struct FeesSwept {
    pub pool: Pubkey,
    pub amount: u64,
}
#[event]
pub struct HaltSet {
    pub pool: Pubkey,
    pub halted: bool,
}
#[event]
pub struct Withdrawn {
    pub pool: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
}

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum AmmError {
    #[msg("bad input")]
    BadInput,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("pool has no liquidity")]
    EmptyPool,
    #[msg("output below min_out")]
    Slippage,
    #[msg("pool is halted")]
    PoolHalted,
    #[msg("wrong token mint")]
    WrongMint,
    #[msg("only the pool authority may do this")]
    NotAuthority,
}
