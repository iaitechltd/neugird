//! Perp Vault — TradeX futures get a REAL counterparty (T2 of
//! docs/TRADING_ENGINE_AUDIT.md §5; fixes audit F1: PnL used to print/burn
//! ledger USDC with no economic source).
//!
//! One global Engine per authority, three segregated quote (USDC) vaults:
//!   - lp_vault         — the treasury-seeded COUNTERPARTY pool (GMX-style):
//!                        trader profits are PAID from it, trader losses flow
//!                        INTO it. Depth also bounds open interest (oi_cap_bps).
//!   - collateral_vault — segregated trader margin. Never house money.
//!   - insurance_vault  — liquidation remainders in; bad debt absorbed out.
//!
//! Settlement model (v1 mirror posture, same as the other seven rails): the
//! platform engine computes prices/PnL (TWAP-banded mark — the T3 milestone
//! moves that on-chain) and reports the SETTLEMENT SPLIT; this program
//! enforces CONSERVATION — every unit a trader receives provably comes from
//! real collateral or the real LP vault, and the vault flows are events anyone
//! can audit. Opens are blocked while halted; closes always work (exits are
//! sacred).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use market_amm::{AmmPool, TwapState};

declare_id!("7ptefj73hfStHPNTB272MaG4AnuR98YgGMdqj48HGYWN");

const MAX_OI_CAP_BPS: u16 = 10_000; // 100% of LP depth
// T3 oracle discipline: settlements must price within the band of the
// on-chain TWAP, the oracle must be fresh, and the LP's outflow is bounded by
// the banded price (+ a funding tolerance — funding accounting is platform-
// side in the mirror era, so payouts can exceed pure price PnL slightly).
const ORACLE_BAND_BPS: u128 = 200; // ±2% — mirrors the platform MARK_BAND
const ORACLE_MAX_AGE_SECS: i64 = 900; // 15 min — crank cadence is 5
const PAYOUT_TOL_BPS: u128 = 500; // 5% of collateral headroom over price PnL

#[program]
pub mod perp_vault {
    use super::*;

    /// Open the engine: one per authority, three seeded vaults.
    pub fn init_engine(ctx: Context<InitEngine>, oi_cap_bps: u16) -> Result<()> {
        require!(oi_cap_bps > 0 && oi_cap_bps <= MAX_OI_CAP_BPS, PerpError::BadInput);
        let e = &mut ctx.accounts.engine;
        e.authority = ctx.accounts.authority.key();
        e.quote_mint = ctx.accounts.quote_mint.key();
        e.oi_cap_bps = oi_cap_bps;
        e.total_oi = 0;
        e.lp_deposited = 0;
        e.halted = false;
        e.bump = ctx.bumps.engine;
        emit!(EngineInit { engine: e.key(), quote_mint: e.quote_mint, oi_cap_bps });
        Ok(())
    }

    /// Treasury seeds (or tops up) the counterparty pool.
    pub fn lp_deposit(ctx: Context<LpMove>, amount: u64) -> Result<()> {
        require!(amount > 0, PerpError::BadInput);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.authority_quote.to_account_info(),
                    to: ctx.accounts.lp_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;
        let e = &mut ctx.accounts.engine;
        e.lp_deposited = e.lp_deposited.saturating_add(amount);
        emit!(LpDeposited { engine: e.key(), amount });
        Ok(())
    }

    /// Authority withdraws LP capital (treasury ops / migration). Loud by design.
    pub fn lp_withdraw(ctx: Context<LpMove>, amount: u64) -> Result<()> {
        require!(amount > 0 && amount <= ctx.accounts.lp_vault.amount, PerpError::InsufficientLp);
        let seeds: &[&[u8]] = &[b"engine", ctx.accounts.engine.authority.as_ref(), &[ctx.accounts.engine.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.lp_vault.to_account_info(),
                    to: ctx.accounts.authority_quote.to_account_info(),
                    authority: ctx.accounts.engine.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        emit!(LpWithdrawn { engine: ctx.accounts.engine.key(), amount });
        Ok(())
    }

    /// Open: real margin moves into the segregated collateral vault; total OI
    /// is bounded by the LP pool's REAL depth. `market_id` = the market's AMM
    /// pool id (links the position to its on-chain price oracle).
    pub fn open_position(
        ctx: Context<OpenPosition>,
        position_id: u64,
        market_id: u64,
        side: u8,
        collateral: u64,
        notional: u64,
        entry_price_micro: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.engine.halted, PerpError::Halted);
        require!(collateral > 0 && notional > 0 && side <= 1, PerpError::BadInput);
        let cap = (ctx.accounts.lp_vault.amount as u128) * (ctx.accounts.engine.oi_cap_bps as u128) / 10_000;
        let new_oi = (ctx.accounts.engine.total_oi as u128) + (notional as u128);
        require!(new_oi <= cap, PerpError::OiCapExceeded);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.authority_quote.to_account_info(),
                    to: ctx.accounts.collateral_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            collateral,
        )?;

        let p = &mut ctx.accounts.position;
        p.engine = ctx.accounts.engine.key();
        p.position_id = position_id;
        p.market_id = market_id;
        p.side = side;
        p.collateral = collateral;
        p.notional = notional;
        p.entry_price_micro = entry_price_micro;
        p.open = true;
        p.bump = ctx.bumps.position;

        let e = &mut ctx.accounts.engine;
        e.total_oi = new_oi as u64;
        emit!(PositionOpened {
            engine: e.key(),
            position_id,
            side,
            collateral,
            notional,
            entry_price_micro,
            total_oi: e.total_oi
        });
        Ok(())
    }

    /// Permissionless keeper crank: refresh a market's mark oracle FROM the
    /// AMM's on-chain TwapState. Anyone may crank — the truth comes from the
    /// accumulator, not the caller. First crank bootstraps from the holding
    /// price; later cranks store the exact inter-touch TWAP.
    pub fn crank_mark(ctx: Context<CrankMark>, market_id: u64) -> Result<()> {
        require!(ctx.accounts.amm_pool.market_id == market_id, PerpError::WrongOracle);
        require!(ctx.accounts.twap_state.pool == ctx.accounts.amm_pool.key(), PerpError::WrongOracle);
        let now = Clock::get()?.unix_timestamp;
        let cum = ctx.accounts.twap_state.price_cumulative;
        let ts = ctx.accounts.twap_state.last_ts;
        let o = &mut ctx.accounts.mark_oracle;
        if o.updated_at > 0 && ts > o.last_ts {
            o.twap_micro = ((cum - o.last_cumulative) / ((ts - o.last_ts) as u128)) as u64;
        } else {
            // bootstrap / quiet market: the price still holding IS the TWAP
            o.twap_micro = ctx.accounts.twap_state.last_price_micro;
        }
        if o.updated_at == 0 {
            o.engine = ctx.accounts.engine.key();
            o.market_id = market_id;
            o.bump = ctx.bumps.mark_oracle;
        }
        o.last_cumulative = cum;
        o.last_ts = ts;
        o.updated_at = now;
        emit!(MarkCranked { engine: o.engine, market_id, twap_micro: o.twap_micro });
        Ok(())
    }

    /// Close with a platform-reported settlement split. The program enforces
    /// conservation and routes REAL money:
    ///   trader payout  ≤ collateral + LP capacity (profit is PAID by the pool)
    ///   trader loss    → LP pool
    ///   liq remainder  → insurance (`to_insurance`)
    ///   bad debt       → insurance pays the pool (`insurance_to_lp`)
    /// T3: when the market's mark oracle has been cranked, the close is
    /// VALIDATED against it — the exit price must sit within ±band of the
    /// on-chain TWAP, the oracle must be fresh, and the payout may not exceed
    /// what the banded price allows. Closes work even while halted.
    pub fn close_position(
        ctx: Context<ClosePosition>,
        exit_price_micro: u64,
        to_trader: u64,
        to_insurance: u64,
        insurance_to_lp: u64,
    ) -> Result<()> {
        require!(ctx.accounts.position.open, PerpError::NotOpen);
        let collateral = ctx.accounts.position.collateral;
        let out = (to_trader as u128) + (to_insurance as u128);

        let mut verified = false;
        if let Some(o) = ctx.accounts.mark_oracle.as_ref() {
            if o.updated_at > 0 {
                let p = &ctx.accounts.position;
                require!(o.market_id == p.market_id, PerpError::WrongOracle);
                let now = Clock::get()?.unix_timestamp;
                require!(now - o.updated_at <= ORACLE_MAX_AGE_SECS, PerpError::OracleStale);
                let twap = o.twap_micro as u128;
                require!(twap > 0, PerpError::OracleStale);
                let dev = (exit_price_micro as u128).abs_diff(twap);
                require!(dev * 10_000 <= twap * ORACLE_BAND_BPS, PerpError::PriceOutOfBand);
                // LP-outflow bound at the (already banded) exit price
                let entry = p.entry_price_micro as i128;
                require!(entry > 0, PerpError::BadInput);
                let diff = exit_price_micro as i128 - entry;
                let signed = if p.side == 0 { diff } else { -diff };
                let pnl = (p.notional as i128) * signed / entry;
                let max_out = (collateral as i128)
                    + pnl.max(0)
                    + ((collateral as u128) * PAYOUT_TOL_BPS / 10_000) as i128;
                require!((out as i128) <= max_out, PerpError::PayoutExceedsBand);
                verified = true;
            }
        }

        let seeds: &[&[u8]] = &[b"engine", ctx.accounts.engine.authority.as_ref(), &[ctx.accounts.engine.bump]];

        if out > collateral as u128 {
            // profit case: the LP pool funds the excess into the collateral vault
            let profit = (out - collateral as u128) as u64;
            require!(profit <= ctx.accounts.lp_vault.amount, PerpError::InsufficientLp);
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.lp_vault.to_account_info(),
                        to: ctx.accounts.collateral_vault.to_account_info(),
                        authority: ctx.accounts.engine.to_account_info(),
                    },
                    &[seeds],
                ),
                profit,
            )?;
        } else {
            // loss case: what the trader doesn't get back flows to the LP pool
            let loss = collateral - out as u64;
            if loss > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.collateral_vault.to_account_info(),
                            to: ctx.accounts.lp_vault.to_account_info(),
                            authority: ctx.accounts.engine.to_account_info(),
                        },
                        &[seeds],
                    ),
                    loss,
                )?;
            }
        }
        if to_insurance > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.collateral_vault.to_account_info(),
                        to: ctx.accounts.insurance_vault.to_account_info(),
                        authority: ctx.accounts.engine.to_account_info(),
                    },
                    &[seeds],
                ),
                to_insurance,
            )?;
        }
        if to_trader > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.collateral_vault.to_account_info(),
                        to: ctx.accounts.trader_quote.to_account_info(),
                        authority: ctx.accounts.engine.to_account_info(),
                    },
                    &[seeds],
                ),
                to_trader,
            )?;
        }
        if insurance_to_lp > 0 {
            // bad-debt absorption: the fund makes the pool whole (adapter caps
            // the ask at the fund's real balance — on-chain never goes negative)
            require!(insurance_to_lp <= ctx.accounts.insurance_vault.amount, PerpError::InsufficientInsurance);
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.insurance_vault.to_account_info(),
                        to: ctx.accounts.lp_vault.to_account_info(),
                        authority: ctx.accounts.engine.to_account_info(),
                    },
                    &[seeds],
                ),
                insurance_to_lp,
            )?;
        }

        let p = &mut ctx.accounts.position;
        p.open = false;
        let e = &mut ctx.accounts.engine;
        e.total_oi = e.total_oi.saturating_sub(p.notional);
        emit!(PositionClosed {
            engine: e.key(),
            position_id: p.position_id,
            exit_price_micro,
            verified,
            to_trader,
            to_insurance,
            insurance_to_lp,
            collateral,
            total_oi: e.total_oi
        });
        Ok(())
    }

    /// Blocks OPENS only (closes stay live). Mirrors platform halts.
    pub fn set_halt(ctx: Context<AdminEngine>, halted: bool) -> Result<()> {
        ctx.accounts.engine.halted = halted;
        emit!(HaltSet { engine: ctx.accounts.engine.key(), halted });
        Ok(())
    }

    /// Governable OI cap as bps of LP depth.
    pub fn set_oi_cap(ctx: Context<AdminEngine>, oi_cap_bps: u16) -> Result<()> {
        require!(oi_cap_bps > 0 && oi_cap_bps <= MAX_OI_CAP_BPS, PerpError::BadInput);
        ctx.accounts.engine.oi_cap_bps = oi_cap_bps;
        emit!(OiCapSet { engine: ctx.accounts.engine.key(), oi_cap_bps });
        Ok(())
    }
}

/* ---------------------------------- state ------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct Engine {
    pub authority: Pubkey,
    pub quote_mint: Pubkey,
    pub oi_cap_bps: u16,
    pub total_oi: u64,
    pub lp_deposited: u64, // lifetime deposits (accounting)
    pub halted: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PerpPosition {
    pub engine: Pubkey,
    pub position_id: u64,
    pub market_id: u64, // links to the market's AMM pool / mark oracle
    pub side: u8, // 0 long · 1 short
    pub collateral: u64,
    pub notional: u64,
    pub entry_price_micro: u64,
    pub open: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MarkOracle {
    pub engine: Pubkey,
    pub market_id: u64,
    pub twap_micro: u64,      // last inter-touch TWAP from the AMM accumulator
    pub last_cumulative: u128, // TwapState snapshot at the last crank
    pub last_ts: i64,
    pub updated_at: i64,
    pub bump: u8,
}

/* --------------------------------- accounts ----------------------------------- */

#[derive(Accounts)]
pub struct InitEngine<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init, payer = authority, space = 8 + Engine::INIT_SPACE,
        seeds = [b"engine", authority.key().as_ref()], bump
    )]
    pub engine: Account<'info, Engine>,
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = authority,
        token::mint = quote_mint, token::authority = engine,
        seeds = [b"lp", engine.key().as_ref()], bump
    )]
    pub lp_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = authority,
        token::mint = quote_mint, token::authority = engine,
        seeds = [b"insurance", engine.key().as_ref()], bump
    )]
    pub insurance_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = authority,
        token::mint = quote_mint, token::authority = engine,
        seeds = [b"collateral", engine.key().as_ref()], bump
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LpMove<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"engine", engine.authority.as_ref()], bump = engine.bump,
        has_one = authority @ PerpError::NotAuthority
    )]
    pub engine: Account<'info, Engine>,
    #[account(mut, constraint = authority_quote.mint == engine.quote_mint @ PerpError::WrongMint)]
    pub authority_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"lp", engine.key().as_ref()], bump)]
    pub lp_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"engine", engine.authority.as_ref()], bump = engine.bump,
        has_one = authority @ PerpError::NotAuthority
    )]
    pub engine: Account<'info, Engine>,
    #[account(
        init, payer = authority, space = 8 + PerpPosition::INIT_SPACE,
        seeds = [b"pos", engine.key().as_ref(), &position_id.to_le_bytes()], bump
    )]
    pub position: Account<'info, PerpPosition>,
    #[account(mut, constraint = authority_quote.mint == engine.quote_mint @ PerpError::WrongMint)]
    pub authority_quote: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"lp", engine.key().as_ref()], bump)]
    pub lp_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"collateral", engine.key().as_ref()], bump)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CrankMark<'info> {
    /// permissionless — anyone may pay to refresh the oracle
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(seeds = [b"engine", engine.authority.as_ref()], bump = engine.bump)]
    pub engine: Account<'info, Engine>,
    /// the market's AMM pool — owner-checked against the market_amm program
    pub amm_pool: Account<'info, AmmPool>,
    /// its cumulative-price accumulator (same owner check)
    pub twap_state: Account<'info, TwapState>,
    #[account(
        init_if_needed, payer = cranker, space = 8 + MarkOracle::INIT_SPACE,
        seeds = [b"mark", engine.key().as_ref(), &market_id.to_le_bytes()], bump
    )]
    pub mark_oracle: Account<'info, MarkOracle>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"engine", engine.authority.as_ref()], bump = engine.bump,
        has_one = authority @ PerpError::NotAuthority
    )]
    pub engine: Account<'info, Engine>,
    /// the market's mark oracle — validation engages once it has been cranked
    #[account(seeds = [b"mark", engine.key().as_ref(), &position.market_id.to_le_bytes()], bump = mark_oracle.bump)]
    pub mark_oracle: Option<Account<'info, MarkOracle>>,
    #[account(
        mut,
        seeds = [b"pos", engine.key().as_ref(), &position.position_id.to_le_bytes()], bump = position.bump
    )]
    pub position: Account<'info, PerpPosition>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"lp", engine.key().as_ref()], bump)]
    pub lp_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"insurance", engine.key().as_ref()], bump)]
    pub insurance_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = engine.quote_mint, token::authority = engine, seeds = [b"collateral", engine.key().as_ref()], bump)]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    /// where the trader's payout lands (the platform custodian ATA in v1)
    #[account(mut, constraint = trader_quote.mint == engine.quote_mint @ PerpError::WrongMint)]
    pub trader_quote: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminEngine<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"engine", engine.authority.as_ref()], bump = engine.bump,
        has_one = authority @ PerpError::NotAuthority
    )]
    pub engine: Account<'info, Engine>,
}

/* ---------------------------------- events ------------------------------------ */

#[event]
pub struct EngineInit { pub engine: Pubkey, pub quote_mint: Pubkey, pub oi_cap_bps: u16 }
#[event]
pub struct LpDeposited { pub engine: Pubkey, pub amount: u64 }
#[event]
pub struct LpWithdrawn { pub engine: Pubkey, pub amount: u64 }
#[event]
pub struct PositionOpened { pub engine: Pubkey, pub position_id: u64, pub side: u8, pub collateral: u64, pub notional: u64, pub entry_price_micro: u64, pub total_oi: u64 }
#[event]
pub struct PositionClosed { pub engine: Pubkey, pub position_id: u64, pub exit_price_micro: u64, pub verified: bool, pub to_trader: u64, pub to_insurance: u64, pub insurance_to_lp: u64, pub collateral: u64, pub total_oi: u64 }
#[event]
pub struct MarkCranked { pub engine: Pubkey, pub market_id: u64, pub twap_micro: u64 }
#[event]
pub struct HaltSet { pub engine: Pubkey, pub halted: bool }
#[event]
pub struct OiCapSet { pub engine: Pubkey, pub oi_cap_bps: u16 }

/* ---------------------------------- errors ------------------------------------ */

#[error_code]
pub enum PerpError {
    #[msg("bad input")]
    BadInput,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("engine is halted")]
    Halted,
    #[msg("open interest cap exceeded")]
    OiCapExceeded,
    #[msg("position is not open")]
    NotOpen,
    #[msg("LP pool cannot cover this payout")]
    InsufficientLp,
    #[msg("insurance fund cannot cover this")]
    InsufficientInsurance,
    #[msg("wrong token mint")]
    WrongMint,
    #[msg("only the engine authority may do this")]
    NotAuthority,
    #[msg("oracle does not match this market")]
    WrongOracle,
    #[msg("mark oracle is stale — crank it first")]
    OracleStale,
    #[msg("exit price outside the on-chain TWAP band")]
    PriceOutOfBand,
    #[msg("payout exceeds what the banded price allows")]
    PayoutExceedsBand,
}
