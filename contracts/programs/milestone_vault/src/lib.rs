//! Milestone Vault — NeuGrid's escrow primitive, on-chain (C1 on docs/ROADMAP.md).
//!
//! One program covers BOTH platform escrow lenses:
//!  - GenesisX raise: founder creates a vault with milestone tranches; backers fund
//!    USDC; tranches release only on backing-weighted backer votes; unfilled raises
//!    refund in full after the deadline; funded-but-stalled projects refund the
//!    unreleased remainder pro-rata via a backer-fired kill switch.
//!  - Job/hire escrow: a 1-milestone vault where the employer is the sole backer
//!    (their vote weight is 100%, so approve = release, reject + stall = refund).
//!
//! Deliberately conservative v1: classic SPL token (USDC), fixed max 8 milestones,
//! no vote changes, no partial votes. Weight = USDC backed (the platform's
//! reputation multiplier stays an off-chain signal — the chain enforces money math).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("DEnN1EEMFERLNmEkXnPMDPyj93SGEHXWuNjGWesALC4N");

pub const MAX_MILESTONES: usize = 8;

// vault status
pub const RAISING: u8 = 0;
pub const FUNDED: u8 = 1;
pub const FAILED: u8 = 2; // refunds claimable (raise expired or kill-switched)
pub const COMPLETED: u8 = 3;

// milestone status
pub const PENDING: u8 = 0;
pub const VOTING: u8 = 1;
pub const RELEASED: u8 = 2;
pub const REJECTED: u8 = 3;

#[program]
pub mod milestone_vault {
    use super::*;

    /// Founder opens a raise. `ask` is derived on-chain as the tranche sum.
    /// `release_authority` (optional) is a key that must CO-SIGN any vote that
    /// executes a tranche release — NeuGrid wires the ICP signer canister's
    /// threshold-Ed25519 address here, so no payout can leave the vault without
    /// the canister's policy approving it (A3: trustless release authority).
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: u64,
        milestone_amounts: Vec<u64>,
        raise_seconds: i64,
        stall_seconds: i64,
        release_authority: Option<Pubkey>,
    ) -> Result<()> {
        require!(
            !milestone_amounts.is_empty() && milestone_amounts.len() <= MAX_MILESTONES,
            VaultError::BadMilestones
        );
        require!(milestone_amounts.iter().all(|a| *a > 0), VaultError::BadMilestones);
        require!(raise_seconds > 0 && stall_seconds > 0, VaultError::BadWindow);
        let ask = milestone_amounts
            .iter()
            .try_fold(0u64, |s, a| s.checked_add(*a))
            .ok_or(VaultError::Overflow)?;

        let now = Clock::get()?.unix_timestamp;
        let v = &mut ctx.accounts.vault;
        v.vault_id = vault_id;
        v.founder = ctx.accounts.founder.key();
        v.usdc_mint = ctx.accounts.usdc_mint.key();
        v.ask = ask;
        v.raised = 0;
        v.released = 0;
        v.status = RAISING;
        v.raise_deadline = now.checked_add(raise_seconds).ok_or(VaultError::Overflow)?;
        v.stall_seconds = stall_seconds;
        v.last_activity = now;
        v.milestone_count = milestone_amounts.len() as u8;
        for (i, amount) in milestone_amounts.iter().enumerate() {
            v.milestones[i] = MilestoneState { amount: *amount, status: PENDING, round: 0, votes_for: 0, votes_against: 0 };
        }
        v.backer_count = 0;
        v.release_authority = release_authority.unwrap_or_default();
        v.bump = ctx.bumps.vault;
        emit!(VaultCreated { vault: v.key(), founder: v.founder, ask });
        Ok(())
    }

    /// Backer escrows USDC into the vault. Filling the ask starts milestone 0's vote.
    pub fn back(ctx: Context<Back>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let v = &ctx.accounts.vault;
            require!(v.status == RAISING, VaultError::NotRaising);
            require!(now <= v.raise_deadline, VaultError::RaiseExpired);
            require!(amount > 0, VaultError::ZeroAmount);
            require!(
                v.raised.checked_add(amount).ok_or(VaultError::Overflow)? <= v.ask,
                VaultError::OverAsk
            );
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.backer_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.backer.to_account_info(),
                },
            ),
            amount,
        )?;

        let b = &mut ctx.accounts.backing;
        if b.amount == 0 && !b.refunded {
            b.vault = ctx.accounts.vault.key();
            b.backer = ctx.accounts.backer.key();
            b.bump = ctx.bumps.backing;
            ctx.accounts.vault.backer_count += 1;
        }
        b.amount = b.amount.checked_add(amount).ok_or(VaultError::Overflow)?;

        let v = &mut ctx.accounts.vault;
        v.raised = v.raised.checked_add(amount).ok_or(VaultError::Overflow)?;
        if v.raised == v.ask {
            v.status = FUNDED;
            v.milestones[0].status = VOTING;
            v.milestones[0].round = 1;
            v.last_activity = now;
        }
        emit!(Backed { vault: v.key(), backer: ctx.accounts.backer.key(), amount, raised: v.raised });
        Ok(())
    }

    /// Backing-weighted vote on the currently-voting milestone. Crossing 50% FOR
    /// releases the tranche to the founder inside this same transaction; 50%
    /// AGAINST rejects it (founder may `reopen_milestone` for a fresh round).
    pub fn vote(ctx: Context<Vote>, milestone_idx: u8, approve: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let idx = milestone_idx as usize;
        let weight;
        {
            let v = &ctx.accounts.vault;
            let b = &ctx.accounts.backing;
            require!(v.status == FUNDED, VaultError::NotFunded);
            require!(idx < v.milestone_count as usize, VaultError::BadIndex);
            require!(v.milestones[idx].status == VOTING, VaultError::NotVoting);
            require!(b.voted_round[idx] < v.milestones[idx].round, VaultError::AlreadyVoted);
            weight = b.amount;
        }
        ctx.accounts.backing.voted_round[idx] = ctx.accounts.vault.milestones[idx].round;

        let raised = ctx.accounts.vault.raised as u128;
        let (released_now, rejected_now, tranche) = {
            let v = &mut ctx.accounts.vault;
            let m = &mut v.milestones[idx];
            if approve {
                m.votes_for = m.votes_for.checked_add(weight).ok_or(VaultError::Overflow)?;
            } else {
                m.votes_against = m.votes_against.checked_add(weight).ok_or(VaultError::Overflow)?;
            }
            if (m.votes_for as u128) * 2 >= raised {
                (true, false, m.amount)
            } else if (m.votes_against as u128) * 2 >= raised {
                (false, true, 0)
            } else {
                (false, false, 0)
            }
        };

        if released_now {
            let v = &ctx.accounts.vault;
            // The releasing vote is the only instruction that moves money to the
            // founder — when a release authority is set, it must co-sign HERE.
            if v.release_authority != Pubkey::default() {
                let ra = ctx
                    .accounts
                    .release_authority
                    .as_ref()
                    .ok_or(VaultError::MissingReleaseAuthority)?;
                require!(ra.key() == v.release_authority, VaultError::WrongReleaseAuthority);
            }
            let seeds: &[&[u8]] = &[b"vault", v.founder.as_ref(), &v.vault_id.to_le_bytes(), &[v.bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.vault_token.to_account_info(),
                        to: ctx.accounts.founder_token.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    &[seeds],
                ),
                tranche,
            )?;
            let v = &mut ctx.accounts.vault;
            v.milestones[idx].status = RELEASED;
            v.released = v.released.checked_add(tranche).ok_or(VaultError::Overflow)?;
            v.last_activity = now;
            if idx + 1 < v.milestone_count as usize {
                v.milestones[idx + 1].status = VOTING;
                v.milestones[idx + 1].round = 1;
            } else {
                v.status = COMPLETED;
            }
            emit!(MilestoneReleased { vault: v.key(), milestone: milestone_idx, amount: tranche });
        } else if rejected_now {
            let v = &mut ctx.accounts.vault;
            v.milestones[idx].status = REJECTED;
            v.last_activity = now; // a live vote IS activity — the stall clock restarts
            emit!(MilestoneRejected { vault: v.key(), milestone: milestone_idx });
        }
        Ok(())
    }

    /// Founder re-requests a rejected milestone: fresh voting round, tallies reset.
    pub fn reopen_milestone(ctx: Context<FounderOnly>, milestone_idx: u8) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        let idx = milestone_idx as usize;
        require!(v.status == FUNDED, VaultError::NotFunded);
        require!(idx < v.milestone_count as usize, VaultError::BadIndex);
        let m = &mut v.milestones[idx];
        require!(m.status == REJECTED, VaultError::NotRejected);
        require!(m.round < u8::MAX, VaultError::TooManyRounds);
        m.status = VOTING;
        m.round += 1;
        m.votes_for = 0;
        m.votes_against = 0;
        v.last_activity = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Anyone may flip an expired, unfilled raise to FAILED (opens refunds).
    pub fn expire_raise(ctx: Context<Crank>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        require!(v.status == RAISING, VaultError::NotRaising);
        require!(Clock::get()?.unix_timestamp > v.raise_deadline, VaultError::NotExpired);
        v.status = FAILED;
        emit!(VaultFailed { vault: v.key(), reason: 0 });
        Ok(())
    }

    /// Any backer may kill a funded vault with no milestone activity past the
    /// stall window. Unreleased funds become claimable pro-rata.
    pub fn kill_switch(ctx: Context<KillSwitch>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        require!(v.status == FUNDED, VaultError::NotFunded);
        require!(ctx.accounts.backing.amount > 0, VaultError::NotABacker);
        let now = Clock::get()?.unix_timestamp;
        require!(
            now > v.last_activity.checked_add(v.stall_seconds).ok_or(VaultError::Overflow)?,
            VaultError::NotStalled
        );
        v.status = FAILED;
        emit!(VaultFailed { vault: v.key(), reason: 1 });
        Ok(())
    }

    /// FAILED vault: backer claims their pro-rata share of the unreleased balance.
    /// (Raise-expiry case: released == 0, so the share is the full backing.)
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let share = {
            let v = &ctx.accounts.vault;
            let b = &ctx.accounts.backing;
            require!(v.status == FAILED, VaultError::NotFailed);
            require!(!b.refunded && b.amount > 0, VaultError::NothingToRefund);
            let remaining = (v.raised as u128) - (v.released as u128);
            ((b.amount as u128) * remaining / (v.raised as u128)) as u64
        };
        let v = &ctx.accounts.vault;
        let seeds: &[&[u8]] = &[b"vault", v.founder.as_ref(), &v.vault_id.to_le_bytes(), &[v.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.backer_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            share,
        )?;
        ctx.accounts.backing.refunded = true;
        emit!(RefundClaimed { vault: v.key(), backer: ctx.accounts.backing.backer, amount: share });
        Ok(())
    }

    /// Reclaim a Backing account's rent once it's spent (refunded, or the vault
    /// completed). Closes to the backer.
    pub fn close_backing(ctx: Context<CloseBacking>) -> Result<()> {
        let v = &ctx.accounts.vault;
        let b = &ctx.accounts.backing;
        require!(
            b.refunded || v.status == COMPLETED,
            VaultError::StillLive
        );
        Ok(())
    }
}

/* ---------------------------------- state ---------------------------------- */

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct MilestoneState {
    pub amount: u64,
    pub status: u8,
    pub round: u8,
    pub votes_for: u64,
    pub votes_against: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub vault_id: u64,
    pub founder: Pubkey,
    pub usdc_mint: Pubkey,
    pub ask: u64,
    pub raised: u64,
    pub released: u64,
    pub status: u8,
    pub raise_deadline: i64,
    pub stall_seconds: i64,
    pub last_activity: i64,
    pub milestone_count: u8,
    pub milestones: [MilestoneState; MAX_MILESTONES],
    pub backer_count: u32,
    /// must co-sign releasing votes when set (Pubkey::default() = unset)
    pub release_authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Backing {
    pub vault: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
    pub refunded: bool,
    /// per-milestone: the voting round this backer last voted in (0 = never)
    pub voted_round: [u8; MAX_MILESTONES],
    pub bump: u8,
}

/* --------------------------------- accounts --------------------------------- */

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(
        init, payer = founder, space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", founder.key().as_ref(), &vault_id.to_le_bytes()], bump
    )]
    pub vault: Account<'info, Vault>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init, payer = founder,
        associated_token::mint = usdc_mint, associated_token::authority = vault
    )]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Back<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        init_if_needed, payer = backer, space = 8 + Backing::INIT_SPACE,
        seeds = [b"backing", vault.key().as_ref(), backer.key().as_ref()], bump
    )]
    pub backing: Account<'info, Backing>,
    #[account(mut, constraint = backer_token.mint == vault.usdc_mint @ VaultError::WrongMint)]
    pub backer_token: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = vault.usdc_mint, associated_token::authority = vault)]
    pub vault_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    pub backer: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"backing", vault.key().as_ref(), backer.key().as_ref()], bump = backing.bump,
        constraint = backing.amount > 0 @ VaultError::NotABacker
    )]
    pub backing: Account<'info, Backing>,
    #[account(mut, associated_token::mint = vault.usdc_mint, associated_token::authority = vault)]
    pub vault_token: Account<'info, TokenAccount>,
    /// the founder's USDC account — tranche destination on release
    #[account(
        mut,
        constraint = founder_token.owner == vault.founder @ VaultError::WrongOwner,
        constraint = founder_token.mint == vault.usdc_mint @ VaultError::WrongMint
    )]
    pub founder_token: Account<'info, TokenAccount>,
    /// co-signer for the releasing vote — required only when the vault set one
    pub release_authority: Option<Signer<'info>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FounderOnly<'info> {
    pub founder: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        has_one = founder @ VaultError::NotFounder
    )]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct Crank<'info> {
    #[account(mut, seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct KillSwitch<'info> {
    pub backer: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        seeds = [b"backing", vault.key().as_ref(), backer.key().as_ref()], bump = backing.bump
    )]
    pub backing: Account<'info, Backing>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    pub backer: Signer<'info>,
    #[account(mut, seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"backing", vault.key().as_ref(), backer.key().as_ref()], bump = backing.bump
    )]
    pub backing: Account<'info, Backing>,
    #[account(mut, associated_token::mint = vault.usdc_mint, associated_token::authority = vault)]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = backer_token.mint == vault.usdc_mint @ VaultError::WrongMint)]
    pub backer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseBacking<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(seeds = [b"vault", vault.founder.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut, close = backer,
        seeds = [b"backing", vault.key().as_ref(), backer.key().as_ref()], bump = backing.bump,
        has_one = backer @ VaultError::WrongOwner
    )]
    pub backing: Account<'info, Backing>,
}

/* ---------------------------------- events ---------------------------------- */

#[event]
pub struct VaultCreated { pub vault: Pubkey, pub founder: Pubkey, pub ask: u64 }
#[event]
pub struct Backed { pub vault: Pubkey, pub backer: Pubkey, pub amount: u64, pub raised: u64 }
#[event]
pub struct MilestoneReleased { pub vault: Pubkey, pub milestone: u8, pub amount: u64 }
#[event]
pub struct MilestoneRejected { pub vault: Pubkey, pub milestone: u8 }
#[event]
pub struct VaultFailed { pub vault: Pubkey, pub reason: u8 } // 0 = raise expired, 1 = kill switch
#[event]
pub struct RefundClaimed { pub vault: Pubkey, pub backer: Pubkey, pub amount: u64 }

/* ---------------------------------- errors ---------------------------------- */

#[error_code]
pub enum VaultError {
    #[msg("milestones must be 1-8, all non-zero")] BadMilestones,
    #[msg("raise/stall windows must be positive")] BadWindow,
    #[msg("arithmetic overflow")] Overflow,
    #[msg("vault is not raising")] NotRaising,
    #[msg("raise deadline has passed")] RaiseExpired,
    #[msg("raise deadline has not passed")] NotExpired,
    #[msg("amount must be positive")] ZeroAmount,
    #[msg("backing would exceed the ask")] OverAsk,
    #[msg("vault is not funded")] NotFunded,
    #[msg("bad milestone index")] BadIndex,
    #[msg("milestone is not open for voting")] NotVoting,
    #[msg("already voted this round")] AlreadyVoted,
    #[msg("milestone is not rejected")] NotRejected,
    #[msg("too many voting rounds")] TooManyRounds,
    #[msg("not a backer of this vault")] NotABacker,
    #[msg("vault has not stalled")] NotStalled,
    #[msg("vault has not failed")] NotFailed,
    #[msg("nothing to refund")] NothingToRefund,
    #[msg("vault or backing still live")] StillLive,
    #[msg("wrong token mint")] WrongMint,
    #[msg("wrong token account owner")] WrongOwner,
    #[msg("only the founder may do this")] NotFounder,
    #[msg("release authority must co-sign this release")] MissingReleaseAuthority,
    #[msg("wrong release authority")] WrongReleaseAuthority,
}
