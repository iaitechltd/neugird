//! Mandate Wallet — agent guardrails, enforced by the chain (C6, the LAST
//! program on docs/ROADMAP.md).
//!
//! An owner arms an agent with a bounded purse: the mandate's vault holds the
//! budget (an agent can never spend money that isn't there), every spend is
//! capped per transaction, the mandate expires on its own, and the owner can
//! KILL it or reclaim the remainder at any second. The agent signs its own
//! spends with its own key — so even a fully compromised platform cannot
//! overspend an owner's mandate.
//!
//! v1 mirror: the operational key plays both roles (documented everywhere);
//! true key separation is ready today for external agents, which already hold
//! their own Solana signers (the x402 SDK payer).

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("FetAKDK1vVQU44r52WuocFqYCMEoiPaT5KEwLbZ6ku3b");

#[program]
pub mod mandate_wallet {
    use super::*;

    /// Owner arms the mandate: agent key + per-tx cap + expiry. Fund it by
    /// transferring USDC into the vault (the balance IS the budget).
    pub fn create_mandate(
        ctx: Context<CreateMandate>,
        mandate_id: u64,
        agent: Pubkey,
        per_tx_cap: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(per_tx_cap > 0, MandateError::BadInput);
        require!(expires_at > Clock::get()?.unix_timestamp, MandateError::BadInput);
        let m = &mut ctx.accounts.mandate;
        m.owner = ctx.accounts.owner.key();
        m.mandate_id = mandate_id;
        m.agent = agent;
        m.mint = ctx.accounts.mint.key();
        m.per_tx_cap = per_tx_cap;
        m.expires_at = expires_at;
        m.killed = false;
        m.spent = 0;
        m.bump = ctx.bumps.mandate;
        emit!(MandateArmed { mandate: m.key(), owner: m.owner, agent, per_tx_cap, expires_at });
        Ok(())
    }

    /// THE AGENT's instruction — its own signature, nobody else's. Spends from
    /// the vault within the cap, while alive and unexpired.
    pub fn agent_spend(ctx: Context<AgentSpend>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let m = &ctx.accounts.mandate;
            require!(!m.killed, MandateError::Killed);
            require!(now < m.expires_at, MandateError::Expired);
            require!(amount > 0 && amount <= m.per_tx_cap, MandateError::OverCap);
        }
        let seeds: &[&[u8]] = &[
            b"mandate",
            ctx.accounts.mandate.owner.as_ref(),
            &ctx.accounts.mandate.mandate_id.to_le_bytes(),
            &[ctx.accounts.mandate.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.mandate.to_account_info(),
                },
                &[seeds],
            ),
            amount, // vault balance enforces the budget — overspend is impossible
        )?;
        let m = &mut ctx.accounts.mandate;
        m.spent = m.spent.checked_add(amount).ok_or(MandateError::Overflow)?;
        emit!(AgentSpent { mandate: m.key(), amount, spent: m.spent });
        Ok(())
    }

    /// The owner's kill-switch: blocks every future agent spend, instantly.
    pub fn kill(ctx: Context<OwnerOnly>) -> Result<()> {
        let m = &mut ctx.accounts.mandate;
        m.killed = true;
        emit!(MandateKilled { mandate: m.key() });
        Ok(())
    }

    /// Owner reclaims from the vault — any amount, any time, killed or not.
    pub fn owner_withdraw(ctx: Context<OwnerWithdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, MandateError::BadInput);
        let seeds: &[&[u8]] = &[
            b"mandate",
            ctx.accounts.mandate.owner.as_ref(),
            &ctx.accounts.mandate.mandate_id.to_le_bytes(),
            &[ctx.accounts.mandate.bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner_token.to_account_info(),
                    authority: ctx.accounts.mandate.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        emit!(OwnerWithdrew { mandate: ctx.accounts.mandate.key(), amount });
        Ok(())
    }
}

/* ---------------------------------- state ------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct MandateAccount {
    pub owner: Pubkey,
    pub mandate_id: u64,
    pub agent: Pubkey, // the key allowed to spend — the agent's OWN signer
    pub mint: Pubkey,
    pub per_tx_cap: u64,
    pub expires_at: i64,
    pub killed: bool,
    pub spent: u64, // lifetime spend through this mandate
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
#[instruction(mandate_id: u64)]
pub struct CreateMandate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init, payer = owner, space = 8 + MandateAccount::INIT_SPACE,
        seeds = [b"mandate", owner.key().as_ref(), &mandate_id.to_le_bytes()], bump
    )]
    pub mandate: Box<Account<'info, MandateAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(init, payer = owner, associated_token::mint = mint, associated_token::authority = mandate)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AgentSpend<'info> {
    /// the AGENT's key — the only signature this instruction accepts
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mandate", mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()], bump = mandate.bump,
        constraint = mandate.agent == agent.key() @ MandateError::NotAgent
    )]
    pub mandate: Box<Account<'info, MandateAccount>>,
    #[account(mut, associated_token::mint = mandate.mint, associated_token::authority = mandate)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = destination.mint == mandate.mint @ MandateError::WrongMint)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mandate", mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()], bump = mandate.bump,
        has_one = owner @ MandateError::NotOwner
    )]
    pub mandate: Box<Account<'info, MandateAccount>>,
}

#[derive(Accounts)]
pub struct OwnerWithdraw<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mandate", mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()], bump = mandate.bump,
        has_one = owner @ MandateError::NotOwner
    )]
    pub mandate: Box<Account<'info, MandateAccount>>,
    #[account(mut, associated_token::mint = mandate.mint, associated_token::authority = mandate)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = owner_token.mint == mandate.mint @ MandateError::WrongMint, constraint = owner_token.owner == owner.key() @ MandateError::NotOwner)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct MandateArmed { pub mandate: Pubkey, pub owner: Pubkey, pub agent: Pubkey, pub per_tx_cap: u64, pub expires_at: i64 }
#[event]
pub struct AgentSpent { pub mandate: Pubkey, pub amount: u64, pub spent: u64 }
#[event]
pub struct MandateKilled { pub mandate: Pubkey }
#[event]
pub struct OwnerWithdrew { pub mandate: Pubkey, pub amount: u64 }

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum MandateError {
    #[msg("bad input")] BadInput,
    #[msg("arithmetic overflow")] Overflow,
    #[msg("mandate was killed by the owner")] Killed,
    #[msg("mandate has expired")] Expired,
    #[msg("amount exceeds the per-transaction cap")] OverCap,
    #[msg("only the mandated agent key may spend")] NotAgent,
    #[msg("only the owner may do this")] NotOwner,
    #[msg("wrong token mint")] WrongMint,
}
