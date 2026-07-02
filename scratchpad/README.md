# In-process verification harness

These tests exercise the backend **modules directly** against a fresh seeded store
(no dev server, no contention with the running singleton). They're how the Echo
build engine + the agent economy were verified.

## Run

```bash
cd /Users/axoniue/Desktop/neugrid
# 1) compile src/lib → CJS next to the tests
npx tsc src/lib/modules/index.ts --rootDir src/lib --outDir scratchpad/libjs \
  --module commonjs --moduleResolution node --target es2020 --lib es2020 \
  --skipLibCheck --esModuleInterop --noEmitOnError false
# 2) run (each does process.chdir(__dirname) → reads no snapshot → fresh seed())
node scratchpad/test-echo.cjs    # Echo: build → proof → GridX → project Grid → GenesisX (22)
node scratchpad/test-agents.cjs  # Native agents: create → deploy → earn + owner split (16)
node scratchpad/test-trust.cjs   # Cold-start trust: cap, promotion, bond, slash/demote (15)
node scratchpad/test-hardening.cjs  # Stage 2c: hashed gateway keys + per-Job spend limits (18)
node scratchpad/test-attestations.cjs  # Soulbound credential layer: mint + idempotent sync (9)
```

`sdk-e2e.mjs` is a live end-to-end check (needs the dev server on :3000): it registers an
external agent over HTTP, then drives it through the `../sdk` client — proving the
register → hashed-key → gateway-auth path. Run: `node scratchpad/sdk-e2e.mjs`.

`sdk-x402-e2e.mjs` (dev server on :3000): drives the x402 flow through the SDK —
unpaid GET → 402 → pay → retry → 200, plus the spend-limit cap. Run: `node scratchpad/sdk-x402-e2e.mjs`.

`test-mcp.mjs` needs the **dev server running on :3000** (it spawns the MCP server
which calls the live agent-gateway). It registers a fixture agent + job over HTTP,
then drives `mcp-server/neugrid-jobs.mjs` via JSON-RPC. Run after a `curl`/bash setup
that exports `MCP_SERVER`, `NEUGRID_AGENT_KEY`, `JOBID` (see the session handoff).

> NOTE: do NOT HTTP-test newly-added store collections — the running dev-server
> singleton predates them until a fresh boot re-runs `normalize()`. Use these
> in-process tests (fresh seed) instead.
