# Devnet validation — the gate before mainnet

Both Solana rails (x402 payments + SAS credentials) are built, env-gated, and
**mock-by-default**. Before any mainnet money, validate the real path end-to-end
on **devnet**. This is the gate. Nothing below touches real funds.

Provision (yours): a Solana keypair, devnet SOL + USDC, and a facilitator. Then
run the checks in order — each is a small, isolated confirmation.

## 0. Prereqs
- Node 18+ and the `solana` CLI (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`).
- In the deploy env: `npm i sas-lib @solana/kit @solana-program/token-2022 @solana-program/compute-budget @coinbase/x402` (the runtime-only rail packages).

## 1. Keypair + funding
```
node scripts/keygen.mjs                 # prints an address + base58 secret
solana airdrop 2 <address> --url devnet # fund SOL (fees)
```
Set `NEUGRID_SAS_ISSUER_SECRET=<secret>` and `NEUGRID_X402_PAY_TO=<address>`.
Get **devnet USDC** for the payer wallet from the Circle devnet faucet (or an SPL
faucet) — the agent needs USDC to actually pay.

## 2. Pick + validate a facilitator
- **Coinbase CDP** (`https://api.cdp.coinbase.com/platform/v2/x402`) — needs CDP API
  keys; `@coinbase/x402` mints the JWT. Use the CAIP-2 network id.
- **PayAI / self-hosted** — set `NEUGRID_X402_API_KEY` (or none if open), network `solana-devnet`.
```
NEUGRID_X402_FACILITATOR_URL=<facilitator> node scripts/x402-facilitator-check.mjs
```
Confirms it's reachable, offers a Solana `exact` kind, and (ideally) advertises a
fee-payer. Set `NEUGRID_X402_NETWORK` to the exact network string it reports.

## 3. Turn the rails on (devnet)
```
NEUGRID_CHAIN_MODE=solana
NEUGRID_SOLANA_RPC=https://api.devnet.solana.com
NEUGRID_SOLANA_WSS=wss://api.devnet.solana.com
NEUGRID_SOLANA_CLUSTER=devnet
NEUGRID_X402_FACILITATOR_URL=<facilitator>   NEUGRID_X402_NETWORK=<network>
NEUGRID_X402_PAY_TO=<treasury address>
NEUGRID_SAS_ISSUER_SECRET=<secret>
```
Boot NeuGrid with these set (locally or on Cloud Run). `X402.active()` is now true,
so metered endpoints return **real** PaymentRequirements.

## 4. Validate x402 (the round-trip)
1. Register an agent; give it a funded **devnet Solana signer**.
2. Wire the SDK payer (see `sdk/README.md`): `wrapFetchWithPayment` (x402-fetch) or
   `createSolanaX402Payer({ signer, createPaymentHeader })`.
3. `await agent.resource("market_data")` — expect: 402 → the agent signs a devnet
   USDC transfer → facilitator verifies + settles → the resource returns, with an
   `x-payment-response` header and a real tx signature in the recorded settlement.
4. `await agent.payAgent(otherAgentId, 1)` — agent-to-agent USDC on devnet.

✓ **x402 validated** when a settlement row has a real devnet `onchain.tx` you can
open in a devnet explorer.

## 5. Validate SAS (credentials)
```
node scripts/sas-setup.mjs   # one-time: credential + 5 schemas + tokenize
```
Then trigger any credential-minting event (an Echo build, a paid Job, a released
milestone) for a user whose profile has a `subject_wallet`. The attestations
module fires `Sas.anchor`, which mints a Token-2022 NonTransferable credential.

✓ **SAS validated** when `attestation.onchain.mint` is set and the mint shows the
NonTransferable + PermanentDelegate extensions in a devnet explorer.

## 6. Ship to mainnet
Once both round-trips pass on devnet: swap `NEUGRID_SOLANA_CLUSTER=mainnet-beta`,
the mainnet RPC (a paid provider — Helius/QuickNode), a mainnet facilitator + the
CAIP-2 network, a **funded mainnet** issuer/treasury, and re-run `sas-setup.mjs`.
Re-verify the USDC mint / SAS program / facilitator addresses first (`docs/DEPLOY.md`) — they move.
