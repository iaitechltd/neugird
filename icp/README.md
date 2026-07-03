# NeuGrid × ICP — Chain Fusion canisters

Workstream A3 on `docs/ROADMAP.md`; the pitch map lives in `docs/ICP_INTEGRATION.md`.

## `neugrid_signer` — the Chain Fusion PoC ✅ (proven 2026-07-03)

An ICP canister that holds a **threshold-Ed25519** key (Solana's signature
scheme) and signs Solana transactions with it. The private key never exists
anywhere — it lives as shares across the ICP subnet. This is the primitive that
makes a canister the trustless escrow/mandate authority over real Solana USDC.

**Proven end-to-end:** canister derived its Solana address → its token account
was funded with test-USDC → it signed an SPL transfer message → the transaction
**settled on Solana devnet**
([tx `4WEbtR47…`](https://explorer.solana.com/tx/4WEbtR47Pdh27HjuMQrwYLg3NiLr61acLyqpXLtLxAJvxCHFuFJG95Goo87h2Wg3JUNwqBmhTtk3Ybc3CAtfMzyr?cluster=devnet)).

```bash
cd icp
dfx start --background          # local replica
dfx deploy neugrid_signer --argument '(opt "key_1")'
npm install
NEUGRID_SAS_ISSUER_SECRET=... CANISTER_ID=$(dfx canister id neugrid_signer) \
  node scripts/poc-devnet-transfer.mjs
```

Gotchas (2026-07-03):
- dfx 0.32's local replica exposes chain keys named **`key_1`** (mirroring
  mainnet), NOT the old `dfx_test_key` — pass `(opt "key_1")` at install.
- dfx itself prints a deprecation notice pointing at `icp-cli`
  (cli.internetcomputer.org) — dfx still works; migrate when convenient.
- PoC uses a client-fetched recent blockhash; the production path uses
  **durable nonces** (Solana blockhashes rotate faster than ICP outcall
  latency) and the SOL RPC canister (`tghme-zyaaa-aaaar-qarca-cai`) for
  reads/submission from inside the canister.

Next steps: mainnet canister deploy (needs cycles) · SOL RPC canister
integration for in-canister submission · policy layer on `sign_solana_message`
(who may request signatures over which instruction shapes) · wire as the
milestone-vault release authority.
