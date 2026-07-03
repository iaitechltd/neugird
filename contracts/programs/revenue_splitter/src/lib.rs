//! Revenue Splitter — SubGrid ownership splits, executable (C5 on docs/ROADMAP.md).
//!
//! The platform's ContributorSplit agreement (who owns what % of a team's
//! output, humans + agents, bps summing to 10000) becomes enforceable: revenue
//! distributed through the splitter divides ATOMICALLY by the configured shares
//! — one transaction pays everyone or no one, with the split math on-chain.
//!
//! v1: the platform's operational key configures + funds distributions (same
//! mirror posture as the other rails); member destinations are real wallets
//! when users have bound one, else the treasury holds custody of their share.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("HFuFMdRJPR1BG3vQqjxtvxybeu4mF3FMrLWU2noVHy4N");

pub const MAX_MEMBERS: usize = 8;
pub const TOTAL_BPS: u64 = 10_000;

#[program]
pub mod revenue_splitter {
    use super::*;

    /// Create or replace the split table for a SubGrid. Shares must sum to 10000.
    pub fn configure(ctx: Context<Configure>, subgrid_id: u64, members: Vec<Member>) -> Result<()> {
        require!(!members.is_empty() && members.len() <= MAX_MEMBERS, SplitError::BadMembers);
        let sum: u64 = members.iter().map(|m| m.bps as u64).sum();
        require!(sum == TOTAL_BPS, SplitError::MustSum10000);
        let s = &mut ctx.accounts.splitter;
        s.authority = ctx.accounts.authority.key();
        s.subgrid_id = subgrid_id;
        s.mint = ctx.accounts.mint_token.mint;
        s.members = members;
        s.distributed = s.distributed; // unchanged across reconfigures
        s.bump = ctx.bumps.splitter;
        emit!(Configured { splitter: s.key(), subgrid_id, members: s.members.len() as u8 });
        Ok(())
    }

    /// Split `amount` across the members atomically. `remaining_accounts` must be
    /// each member's token account (ATA of the splitter's mint), in member order.
    pub fn distribute<'info>(ctx: Context<'info, Distribute<'info>>, amount: u64) -> Result<()> {
        require!(amount > 0, SplitError::BadAmount);
        let members = ctx.accounts.splitter.members.clone();
        require!(ctx.remaining_accounts.len() == members.len(), SplitError::BadRecipients);

        let mut paid: u64 = 0;
        for (i, member) in members.iter().enumerate() {
            let dest: &AccountInfo<'info> = &ctx.remaining_accounts[i];
            let expected = get_associated_token_address(&member.wallet, &ctx.accounts.splitter.mint);
            require!(dest.key() == expected, SplitError::BadRecipients);
            // last member takes the rounding remainder so the whole amount moves
            let share = if i == members.len() - 1 {
                amount - paid
            } else {
                amount * (member.bps as u64) / TOTAL_BPS
            };
            if share == 0 {
                continue;
            }
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.source.to_account_info(),
                        to: dest.clone(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                share,
            )?;
            paid += share;
        }
        let s = &mut ctx.accounts.splitter;
        s.distributed = s.distributed.checked_add(paid).ok_or(SplitError::Overflow)?;
        emit!(Distributed { splitter: s.key(), amount: paid });
        Ok(())
    }
}

/* ---------------------------------- state ------------------------------------ */

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Member {
    pub wallet: Pubkey,
    pub bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Splitter {
    pub authority: Pubkey,
    pub subgrid_id: u64,
    pub mint: Pubkey,
    #[max_len(8)]
    pub members: Vec<Member>,
    pub distributed: u64, // lifetime total routed through the split
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
#[instruction(subgrid_id: u64)]
pub struct Configure<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed, payer = authority, space = 8 + Splitter::INIT_SPACE,
        seeds = [b"split", authority.key().as_ref(), &subgrid_id.to_le_bytes()], bump
    )]
    pub splitter: Box<Account<'info, Splitter>>,
    /// any token account of the revenue mint — pins which mint this splitter pays
    pub mint_token: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"split", splitter.authority.as_ref(), &splitter.subgrid_id.to_le_bytes()], bump = splitter.bump,
        has_one = authority @ SplitError::NotAuthority
    )]
    pub splitter: Box<Account<'info, Splitter>>,
    #[account(mut, constraint = source.mint == splitter.mint @ SplitError::WrongMint, constraint = source.owner == authority.key() @ SplitError::NotAuthority)]
    pub source: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct Configured { pub splitter: Pubkey, pub subgrid_id: u64, pub members: u8 }
#[event]
pub struct Distributed { pub splitter: Pubkey, pub amount: u64 }

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum SplitError {
    #[msg("1-8 members required")] BadMembers,
    #[msg("shares must sum to 10000 bps")] MustSum10000,
    #[msg("amount must be positive")] BadAmount,
    #[msg("recipient accounts must match the member table")] BadRecipients,
    #[msg("arithmetic overflow")] Overflow,
    #[msg("wrong token mint")] WrongMint,
    #[msg("only the splitter authority may do this")] NotAuthority,
}
