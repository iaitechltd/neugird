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

## `neugrid_hosting` — /d/ apps as an asset canister ✅ (built 2026-07-03)

A plain certified-assets canister that mirrors every NeuGrid-hosted Echo
deployment (`/d/<slug>`): the platform uploads the version-pinned HTML snapshot
to `/d/<slug>/index.html`, so each build gets an **unstoppable second URL** at
`https://<canister>.icp0.io/d/<slug>/` — same path shape as platform hosting.
The uploader is `src/lib/chain/icpHosting.ts` (guarded fire-and-forget from
`Echo.deployBuild`; fills `deployment.icp`).

```bash
cd icp
dfx start --background
dfx deploy neugrid_hosting

# one-time: mint the platform's uploader identity (32-byte Ed25519 seed, bs58)
node -e "const{Ed25519KeyIdentity}=require('@dfinity/identity');const bs58=require('bs58').default;const s=require('crypto').randomBytes(32);const id=Ed25519KeyIdentity.fromSecretKey(new Uint8Array(s));console.log('secret',bs58.encode(s));console.log('principal',id.getPrincipal().toText())"
dfx canister call neugrid_hosting grant_permission \
  '(record { to_principal = principal "<principal>"; permission = variant { Commit } })'

# app env (.env.local / Cloud Run):
#   NEUGRID_ICP_HOSTING_CANISTER_ID=<canister id>
#   NEUGRID_ICP_UPLOADER_SECRET=<bs58 seed>
#   NEUGRID_ICP_HOST=http://127.0.0.1:4943   # omit for mainnet (icp0.io)
```

Gotchas: with a `package.json` in `icp/`, dfx insists on running `npm run build`
for assets canisters — the noop `"build": "exit 0"` script exists for that.
Prod runtime needs the `@dfinity/*` packages in the Dockerfile overlay (they load
via tracer-invisible dynamic imports). Mainnet = deploy with cycles, re-grant the
uploader, flip the two envs.

## Signer policy layer + vault release authority ✅ (built 2026-07-03)

`neugrid_signer` is now the milestone-vault **release authority** (A3's
trustless-custody centerpiece):

- `milestone_vault` (contracts/) vaults may name a `release_authority` that must
  CO-SIGN any vote that executes a tranche release. NeuGrid names this canister's
  threshold-Ed25519 Solana address on every mirrored vault.
- `set_vault_program(text)` (controller-only) pins the program id;
  `sign_vault_release(blob)` is open to all callers but parses the legacy Solana
  message and signs ONLY when every instruction is the vault program's `vote`
  (ComputeBudget allowed) — a compromised platform key cannot make the canister
  sign anything else. `sign_solana_message` is controller-only now.
- Platform side: `src/lib/chain/vaultSolana.ts` (`releaseAuthorityAddress` +
  the co-sign path in `mirrorRelease`), env `NEUGRID_ICP_SIGNER_CANISTER_ID`.
- E2E-proven on localnet + the local replica: co-signed release paid exactly;
  a plain transfer was rejected by policy. Devnet needs the program upgrade
  (~2 SOL buffer for the 303KB binary) + the env.

⚠️ Upgrades wipe thread_local state: `post_upgrade` re-applies the key name from
the install argument, but **`set_vault_program` must be re-called after every
canister upgrade**.

## `neugrid_cron` — ICP timers replacing Cloud Scheduler ✅ (built 2026-07-03)

On-chain timers fire the platform's cron endpoints via HTTPS outcalls
(`is_replicated = false` → exactly one request per tick; the routes also dedupe
on `x-ng-cron-tick`).

```bash
dfx deploy neugrid_cron --argument '(opt record {
  base_url = "https://neugrid-188737658015.us-central1.run.app";
  cron_key = "<NEUGRID_CRON_KEY>";
  agent_work_secs = 600 : nat64;
  reputation_secs = 86400 : nat64;
  agent_trading_secs = 300 : nat64 })'   # 0 = trading job off
dfx canister call neugrid_cron fire_now '("agent-work")'   # controller-only smoke
dfx canister call neugrid_cron status --query
```

Proven locally: all three jobs returned HTTP 200 fired from the canister — agent-work, reputation, and agent-trading (the Agent-Mode 24/7 runner: a canister-fired tick executed a real DCA buy with no terminal open) (http://
targets work on the local replica; mainnet requires https — prod already is).
Mainnet flip: deploy with cycles + prod config, then PAUSE the two Cloud
Scheduler jobs (don't run both drivers).
