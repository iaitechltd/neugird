# NeuGrid — Stage B deploy (Cloud Run + Cloud SQL)

The app runs on an in-memory store hydrated from a backing store at boot and
snapshotted back on write. Locally that backing store is a JSON file; in
production it's **Cloud SQL Postgres**. Nothing above `src/lib/store.ts` changes
between the two — flipping `DATABASE_URL` is the whole swap.

> ⚠️ This must run from an environment with network access to Google Cloud +
> Solana. The dev sandbox cannot reach them, so the steps below are **untested
> against live Cloud SQL** — verify a round-trip on first deploy.

## 0. Infra (already provisioned)
- GCP project `neugrid-io`, region `us-central1`.
- Cloud SQL Postgres 16 instance `neugrid-db`, connection name
  `neugrid-io:us-central1:neugrid-db`, DB `neugrid`.
- DB password in Secret Manager: `neugrid-db-password`.

## 1. Apply the schema (idempotent)
`db/schema.sql` mirrors the store exactly (39 collection tables + a `singletons`
table for `gridPool` / `tge` / `params`). Apply via server-side import:
```
gcloud storage cp db/schema.sql gs://neugrid-io-sql/schema.sql
gcloud sql import sql neugrid-db gs://neugrid-io-sql/schema.sql --database=neugrid
```

## 2. Build + push the image
```
gcloud builds submit --tag us-central1-docker.pkg.dev/neugrid-io/neugrid/app:latest
```
The `Dockerfile` emits a Next standalone image and overlays `pg` (which the file
tracer omits because store-postgres loads it via a non-analyzable import).

## 3. Deploy to Cloud Run (with the Cloud SQL connector)
```
gcloud run deploy neugrid \
  --image us-central1-docker.pkg.dev/neugrid-io/neugrid/app:latest \
  --region us-central1 --allow-unauthenticated \
  --add-cloudsql-instances neugrid-io:us-central1:neugrid-db \
  --set-secrets DATABASE_URL=neugrid-database-url:latest \
  --set-env-vars NEUGRID_CHAIN_MODE=memory
```
`DATABASE_URL` (store as its own secret) uses the Cloud SQL unix socket:
```
postgresql://USER:PASS@/neugrid?host=/cloudsql/neugrid-io:us-central1:neugrid-db
```

## 4. Environment variables (all read by the code)
| Var | Purpose | Needed when |
| --- | --- | --- |
| `DATABASE_URL` | Cloud SQL connection string | Postgres mode (else JSON) |
| `PG_POOL_MAX` / `PGSSL` | pool size / `require` for public-IP TLS | optional |
| `NEUGRID_CHAIN_MODE` | `memory` (default) or `solana` | to go on-chain |
| `NEUGRID_SOLANA_RPC` | paid Solana RPC (Helius/QuickNode/…) | chain mode |
| `NEUGRID_SOLANA_WSS` | RPC websocket (send+confirm); derived from RPC if unset | optional |
| `NEUGRID_SOLANA_CLUSTER` | default `mainnet-beta` | chain mode |
| `NEUGRID_SAS_ISSUER_SECRET` | base58 platform keypair — SAS issuer + fee-payer | chain mode |
| `NEUGRID_SAS_PROGRAM_ID` | SAS program (has a default) | optional |
| `NEUGRID_SAS_TOKEN_URI` | metadata URI for minted credential tokens | optional |
| `NEUGRID_X402_FACILITATOR_URL` | x402 facilitator base URL | chain mode |
| `NEUGRID_X402_PAY_TO` | treasury USDC **owner** address (the payee; the ATA is derived) | chain mode |
| `NEUGRID_X402_NETWORK` | `solana` (v1) or CAIP-2 `solana:5eykt4…` (CDP v2) | optional |
| `NEUGRID_X402_ASSET` | USDC SPL mint (defaults to mainnet USDC) | optional |
| `NEUGRID_X402_API_KEY` | static bearer for a self-hosted/third-party facilitator | optional |
| `NEUGRID_BRAIN` | `claude` to drive native agents with an LLM (else rule-based) | model inference |
| `ANTHROPIC_API_KEY` | Anthropic API key (store in Secret Manager) | brain mode |
| `NEUGRID_BRAIN_MODEL` | model id (default `claude-opus-4-8`) | optional |
| `NEUGRID_ECHO_MODEL` | Echo codegen model id (default `claude-sonnet-5` — fast/cheap) | optional |
| `NEUGRID_WORKER_SCHEDULER` | `on` to tick armed agents 24/7 in-process (else off) | optional |
| `NEUGRID_WORKER_TICK_MS` | scheduler cadence in ms (default 60000, min 15000) | optional |
| `NEUGRID_CRON_KEY` | shared secret required on `POST /api/cron/agent-work` | optional |

### Model brain (native-agent LLM inference + Echo codegen + agent chat)
The native-agent work runtime (`agentWork.decide()` → the `src/lib/brain/` seam), agent
DM replies, and **Echo's REAL code generation** all use the Claude brain when configured;
otherwise agents stay rule-based and Echo builds fall back to the deterministic stub
(mock-default, fail-safe). Turns on with `NEUGRID_BRAIN=claude` + `ANTHROPIC_API_KEY`;
independent of chain mode. Echo codegen defaults to a fast/cheap model
(`NEUGRID_ECHO_MODEL`, default `claude-sonnet-5`); a failed synthesis refunds the
builder's GRID and returns 503 — a fake build is never passed off as real.

**The API key is pasted EXACTLY ONCE — step 2, into Secret Manager, on your machine.**
Never in the repo, a committed `.env`, an inline command (it'd sit in shell history), or a
build arg.

1. Create an API key in the Anthropic Console (it's shown once — copy it).
2. Store it as its own secret, pasted via **stdin** so it never hits shell history:
   ```
   gcloud secrets create anthropic-api-key --project=neugrid-io \
     --replication-policy=automatic --data-file=-
   ```
   Paste the key at the blank prompt, press Enter, then Ctrl-D. Grant the Cloud Run
   runtime service account `secretmanager.secretAccessor` on it (same as `neugrid-db-password`).
3. Install the SDK in the image — it's **overlaid like `pg`** (the Next tracer omits it
   because `brain/claude.ts` loads it via a non-analyzable import): `npm i @anthropic-ai/sdk`.
4. Reference it by name in the deploy (never the key text):
   ```
   --set-secrets ...,ANTHROPIC_API_KEY=anthropic-api-key:latest
   --set-env-vars ...,NEUGRID_BRAIN=claude
   ```
5. Verify: arm a native agent on `/agents/[id]` and run a work tick — the Job pick now
   comes from Claude; any failure falls back to the rule-based brain (fail-safe).

Rotate later with `gcloud secrets versions add anthropic-api-key --data-file=-` (paste again);
Cloud Run picks up `:latest` on the next deploy. Rotate immediately if the key ever leaks.

### Autonomous worker (scheduler)
Native agents armed for work (`agentWork`) advance one step per "tick". Two drivers,
both calling `AgentWork.tickAll()` — use one:
- **In-process** — set `NEUGRID_WORKER_SCHEDULER=on` (+ optional `NEUGRID_WORKER_TICK_MS`,
  default 60s) and the server ticks every armed agent on that interval. Good for a single
  always-on server; on autoscaling Cloud Run it runs per-instance, so prefer:
- **External cron (recommended on Cloud Run)** — point Cloud Scheduler at
  `POST /api/cron/agent-work` on your cadence. Protect it with `NEUGRID_CRON_KEY` (sent as
  the `x-ng-cron-key` header); store that as its own secret like the others.

When the model brain is on (above), each tick is an LLM call — keep the cadence sane and
watch spend. Off by default, so the sandbox/demo is unchanged.

### Daily maintenance (cron)
The "fade" half of reputation runs on a schedule: gentle time-decay of inactive
reputation + a ghost-sweep (a project that leaves a delivery unreviewed past the deadline
loses employer trust, and the worker who delivered is auto-paid). The same sweep also
auto-resolves governance proposals past their vote window (tally → enact/reject → locked
GRID returns), so locks never strand on a quiet deployment — reads settle them too, the
cron is the zero-traffic backstop. Point Cloud Scheduler at
`POST /api/cron/reputation` daily (same `NEUGRID_CRON_KEY` protection as the worker cron);
add `?force=1` to run immediately when testing.

### x402 rail (agent payments)
The real x402 flow turns on with `NEUGRID_CHAIN_MODE=solana` + a facilitator URL +
`NEUGRID_X402_PAY_TO`. The server emits spec-correct `PaymentRequirements` on 402,
and verifies+settles the agent's client-signed `X-PAYMENT` through the facilitator
(which is the on-chain fee-payer). Two facilitator options:
- **Coinbase CDP** — `https://api.cdp.coinbase.com/platform/v2/x402`. Needs CDP API
  keys; install `@coinbase/x402` in the deploy env and it mints the per-request JWT
  automatically (loaded via optional dynamic import). Use the CAIP-2 network id.
- **Self-hosted / third-party** (e.g. PayAI, a Kora signer) — set
  `NEUGRID_X402_API_KEY` for a static bearer, network `solana`.

⚠️ The agent (payer) side signs the Solana USDC transfer itself (non-custodial) via
`x402-fetch` / `@solana/web3.js`. Verify a **devnet** round-trip before mainnet.

### SAS rail (soulbound credentials)
Verified achievements mint tokenized (Token-2022 NonTransferable) attestations to
the subject's wallet via the Solana Attestation Service. Turns on with
`NEUGRID_CHAIN_MODE=solana` + `NEUGRID_SOLANA_RPC` + `NEUGRID_SAS_ISSUER_SECRET`.

1. Install the client libs in the deploy env:
   ```
   npm i sas-lib @solana/kit @solana-program/token-2022 @solana-program/compute-budget bs58
   ```
2. Fund the issuer keypair with SOL, then create the credential + 5 schemas **once**:
   ```
   node scripts/sas-setup.mjs
   ```
3. Thereafter the app mints/closes credentials automatically (`chain/sasSolana.ts`),
   guard-wrapped: if a mint fails, the in-platform mirror stands (fail-safe).

⚠️ **Untested vs live SAS** — verify a **devnet** mint (start with the free devnet
RPC) before mainnet. The issuer holds PermanentDelegate (clawback/revoke) on every
credential it mints; keep its key in Secret Manager.

Ship the DB layer first (`NEUGRID_CHAIN_MODE=memory` + `DATABASE_URL`), verify a
round-trip (boot → mutate in the UI → confirm rows land, incl. `singletons`),
then turn on `NEUGRID_CHAIN_MODE=solana` once the keypair, RPC, and facilitator
are provisioned.
