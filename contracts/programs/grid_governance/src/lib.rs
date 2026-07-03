//! GRID Governance — lock-to-vote on-chain (C4 on docs/ROADMAP.md).
//!
//! Mirrors the platform's protocol governance exactly: GRID holders LOCK tokens
//! to vote FOR/AGAINST a proposal (weight = GRID locked), a proposal passes when
//! FOR reaches quorum AND beats AGAINST at the deadline, and every lock RETURNS
//! after resolution — win or lose. GRID is the vote weight and a temporary sink,
//! never an emission.
//!
//! Realms/SPL-Governance verdict (evaluated first, per the roadmap): it is the
//! right vehicle at TGE when users vote from their own wallets; its per-voter
//! deposit model cannot carry the mirror era's aggregate FOR+AGAINST locks under
//! one operational signer — hence this minimal exact-semantics program. The
//! enactment of passed proposals (set_param / treasury_transfer) stays with the
//! platform's Params layer, as today.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("AmXRjxWNpzQs3Ca3AX1h2wdK61ytY2ZvPymiNDieWDYu");

// proposal status
pub const OPEN: u8 = 0;
pub const PASSED: u8 = 1;
pub const REJECTED: u8 = 2;

#[program]
pub mod grid_governance {
    use super::*;

    /// Open a proposal: quorum (atomic GRID), a deadline, and the title's hash
    /// (the full text lives with the platform; the hash pins it immutably).
    pub fn propose(
        ctx: Context<Propose>,
        proposal_id: u64,
        quorum: u64,
        closes_at: i64,
        title_hash: [u8; 32],
    ) -> Result<()> {
        require!(quorum > 0, GovError::BadInput);
        require!(closes_at > Clock::get()?.unix_timestamp, GovError::BadInput);
        let p = &mut ctx.accounts.proposal;
        p.authority = ctx.accounts.authority.key();
        p.proposal_id = proposal_id;
        p.grid_mint = ctx.accounts.grid_mint.key();
        p.quorum = quorum;
        p.closes_at = closes_at;
        p.title_hash = title_hash;
        p.for_locked = 0;
        p.against_locked = 0;
        p.status = OPEN;
        p.bump = ctx.bumps.proposal;
        emit!(Proposed { proposal: p.key(), proposal_id, quorum, closes_at });
        Ok(())
    }

    /// Lock GRID on a side. `side`: 1 = FOR, 0 = AGAINST. Additive per (voter, side).
    pub fn vote(ctx: Context<Vote>, side: u8, amount: u64) -> Result<()> {
        require!(side <= 1, GovError::BadInput);
        require!(amount > 0, GovError::BadInput);
        let now = Clock::get()?.unix_timestamp;
        {
            let p = &ctx.accounts.proposal;
            require!(p.status == OPEN, GovError::NotOpen);
            require!(now < p.closes_at, GovError::VotingClosed);
        }
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.voter_grid.to_account_info(),
                    to: ctx.accounts.vote_vault.to_account_info(),
                    authority: ctx.accounts.voter.to_account_info(),
                },
            ),
            amount,
        )?;
        let p = &mut ctx.accounts.proposal;
        let l = &mut ctx.accounts.vote_lock;
        if l.amount == 0 {
            l.proposal = p.key();
            l.voter = ctx.accounts.voter.key();
            l.side = side;
            l.bump = ctx.bumps.vote_lock;
        }
        require!(l.side == side, GovError::WrongSide); // one PDA per (voter, side)
        l.amount = l.amount.checked_add(amount).ok_or(GovError::Overflow)?;
        if side == 1 {
            p.for_locked = p.for_locked.checked_add(amount).ok_or(GovError::Overflow)?;
        } else {
            p.against_locked = p.against_locked.checked_add(amount).ok_or(GovError::Overflow)?;
        }
        emit!(Voted { proposal: p.key(), voter: l.voter, side, amount });
        Ok(())
    }

    /// Anyone settles a proposal past its deadline: FOR must reach quorum AND
    /// beat AGAINST — the platform's exact rule.
    pub fn resolve(ctx: Context<Resolve>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.proposal;
        require!(p.status == OPEN, GovError::NotOpen);
        require!(now >= p.closes_at, GovError::StillVoting);
        p.status = if p.for_locked >= p.quorum && p.for_locked > p.against_locked { PASSED } else { REJECTED };
        emit!(Resolved { proposal: p.key(), passed: p.status == PASSED, for_locked: p.for_locked, against_locked: p.against_locked });
        Ok(())
    }

    /// After resolution every lock returns — win or lose. Closes the lock PDA.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        {
            let p = &ctx.accounts.proposal;
            require!(p.status != OPEN, GovError::StillVoting);
        }
        let amount = ctx.accounts.vote_lock.amount;
        require!(amount > 0, GovError::NothingLocked);
        let seeds: &[&[u8]] = &[
            b"gov",
            ctx.accounts.proposal.authority.as_ref(),
            &ctx.accounts.proposal.proposal_id.to_le_bytes(),
            &[ctx.accounts.proposal.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vote_vault.to_account_info(),
                    to: ctx.accounts.voter_grid.to_account_info(),
                    authority: ctx.accounts.proposal.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        emit!(Reclaimed { proposal: ctx.accounts.proposal.key(), voter: ctx.accounts.vote_lock.voter, amount });
        Ok(())
    }
}

/* ---------------------------------- state ------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct GovProposal {
    pub authority: Pubkey,
    pub proposal_id: u64,
    pub grid_mint: Pubkey,
    pub quorum: u64,
    pub closes_at: i64,
    pub title_hash: [u8; 32],
    pub for_locked: u64,
    pub against_locked: u64,
    pub status: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteLock {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub side: u8, // 1 = FOR, 0 = AGAINST
    pub amount: u64,
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct Propose<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + GovProposal::INIT_SPACE,
        seeds = [b"gov", authority.key().as_ref(), &proposal_id.to_le_bytes()], bump
    )]
    pub proposal: Box<Account<'info, GovProposal>>,
    pub grid_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = authority, associated_token::mint = grid_mint, associated_token::authority = proposal)]
    pub vote_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: u8)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut, seeds = [b"gov", proposal.authority.as_ref(), &proposal.proposal_id.to_le_bytes()], bump = proposal.bump)]
    pub proposal: Box<Account<'info, GovProposal>>,
    #[account(
        init_if_needed, payer = voter, space = 8 + VoteLock::INIT_SPACE,
        seeds = [b"lock", proposal.key().as_ref(), voter.key().as_ref(), &[side]], bump
    )]
    pub vote_lock: Box<Account<'info, VoteLock>>,
    #[account(mut, constraint = voter_grid.mint == proposal.grid_mint @ GovError::WrongMint)]
    pub voter_grid: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = proposal.grid_mint, associated_token::authority = proposal)]
    pub vote_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(mut, seeds = [b"gov", proposal.authority.as_ref(), &proposal.proposal_id.to_le_bytes()], bump = proposal.bump)]
    pub proposal: Box<Account<'info, GovProposal>>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"gov", proposal.authority.as_ref(), &proposal.proposal_id.to_le_bytes()], bump = proposal.bump)]
    pub proposal: Box<Account<'info, GovProposal>>,
    #[account(
        mut, close = voter,
        seeds = [b"lock", proposal.key().as_ref(), voter.key().as_ref(), &[vote_lock.side]], bump = vote_lock.bump,
        has_one = voter @ GovError::WrongOwner
    )]
    pub vote_lock: Box<Account<'info, VoteLock>>,
    #[account(mut, constraint = voter_grid.mint == proposal.grid_mint @ GovError::WrongMint, constraint = voter_grid.owner == voter.key() @ GovError::WrongOwner)]
    pub voter_grid: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = proposal.grid_mint, associated_token::authority = proposal)]
    pub vote_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct Proposed { pub proposal: Pubkey, pub proposal_id: u64, pub quorum: u64, pub closes_at: i64 }
#[event]
pub struct Voted { pub proposal: Pubkey, pub voter: Pubkey, pub side: u8, pub amount: u64 }
#[event]
pub struct Resolved { pub proposal: Pubkey, pub passed: bool, pub for_locked: u64, pub against_locked: u64 }
#[event]
pub struct Reclaimed { pub proposal: Pubkey, pub voter: Pubkey, pub amount: u64 }

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum GovError {
    #[msg("bad input")] BadInput,
    #[msg("arithmetic overflow")] Overflow,
    #[msg("proposal is not open")] NotOpen,
    #[msg("voting has closed")] VotingClosed,
    #[msg("voting is still open")] StillVoting,
    #[msg("lock is on the other side")] WrongSide,
    #[msg("nothing locked")] NothingLocked,
    #[msg("wrong token mint")] WrongMint,
    #[msg("wrong token account owner")] WrongOwner,
}
