# NeuGrid on-chain programs

Anchor workspace for NeuGrid's smart contracts — workstream C on `docs/ROADMAP.md`.
Excluded from the Next.js build, Docker image, and Cloud Build upload.

## Programs

### `milestone_vault` (C1) — the escrow primitive
USDC vault covering both platform escrow lenses:

- **GenesisX raise**: founder creates a vault with milestone tranches → backers
  escrow USDC → each tranche releases only on a **backing-weighted backer vote**
  (≥50% FOR releases to the founder, ≥50% AGAINST rejects; founder can reopen a
  rejected milestone for a fresh round) → unfilled raises refund in full after
  the deadline (`expire_raise` crank) → funded-but-stalled vaults refund the
  unreleased remainder **pro-rata** via a backer-fired `kill_switch`.
- **Job/hire escrow**: the same vault with 1 milestone and the employer as the
  sole backer — approve = release to the worker, reject + stall window = refund.

Design notes:
- Vote weight = USDC backed. The platform's reputation multiplier stays an
  off-chain signal; the chain enforces only money math.
- Classic SPL token (USDC). Max 8 milestones. No vote changes within a round.
- `last_activity` moves on funding, release, rejection, and reopen — the stall
  clock measures true inactivity, mirroring the platform's rule.

## Workflow

```bash
cd contracts
anchor build          # compiles + writes the IDL to target/idl/
anchor keys sync      # aligns declare_id! with the generated keypair
anchor test           # spins a local validator, runs tests/milestone-vault.ts
anchor deploy --provider.cluster devnet   # devnet deploy (funded wallet needed)
```

**Mainnet rule: no program deploys to mainnet without a professional audit.**

## Roadmap (tier order — see docs/ROADMAP.md)
C1 milestone vault (this) · C2 GRID mint + vesting (standard tooling) ·
C3 staking/slashing · C4 governance (evaluate Realms first) · C5 ownership
splits · C6 agent mandate wallets · C7 deal proofs · C8 DEX/perps integration
(borrow, never build an AMM).
