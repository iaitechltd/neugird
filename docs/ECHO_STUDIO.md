# ECHO STUDIO — the master plan

> **The pitch:** Lovable sells a chat with an engine. NeuGrid gives every builder a company.
> You arrive with an idea; you leave with a running product, a crew that keeps operating it,
> a provable build trail, and a path to money — hire, raise, deploy, sell, tokenize — without
> leaving the room. *From idea to income.*

Founder-locked 2026-07-18. This document is the plan of record — every session works this
roadmap phase by phase, **verifying each phase before starting the next** (founder rule).
Keep it current: mark phases DONE with date + evidence when their gate passes.

---

## The locked decisions (do not relitigate)

1. **The product is the CREW, not the prompt box.** A builder describes the product; a crew
   of agents (engineer / designer / tester / marketing, chief on top) builds it *live in
   front of them* — visible work, plain-English status, steer + approve. The Ventures
   engine (`modules/venture.ts` — ceoPlan → specialists, structured action intents,
   approvals) is the embryo; the Studio is its front room.
2. **Three-brain hierarchy — roles fixed, models swappable.**
   - **Chief** (plans, briefs, *grades* everything before the user sees it): strongest
     reasoner — today `claude-fable-5`.
   - **Hands** (the write→run→fix grind, ~80-90% of tokens): cheapest good coder — today
     `grok-4.5` ($2/$6 per Mtok).
   - **Chatter** (status lines, summaries, small texts): mini model — today Haiku-class.
   - Model per role = config (params/env), never hardcoded. The pairing is a hypothesis to
     benchmark in Phase 1; the seats + review loop are the architecture regardless.
3. **The engine body = open-source Grok Build, self-hosted.** (Apache 2.0, released
   2026-07-15, github.com/xai-org/grok-build — Rust agent harness + tool layer + workspace/
   checkpoints + skills/plugins/hooks/MCP/subagents + headless mode.) We drive it headless
   as a subprocess; **we never fork/edit its internals** (upstream snapshots stay painless
   to absorb). The brain APIs are the fuel inside it; the workshop is ours to host.
   Self-hosting = builders' code never leaves NeuGrid + every step can be proof-sealed.
4. **Two lanes stay.** Quick build (today's one-shot Echo — fast/cheap toys) and Studio
   build (the crew + engine — real products). Nothing existing is deleted; every rail
   (GRID metering, sha256 proof, witnessed steps, preview, deploy, fund, tokenize) carries
   over unchanged.
5. **Skills store is an economy.** We adopt Grok Build's skill/plugin format; community
   creators publish build-skills and earn GRID per install (skillsMarket rails). The
   toolbox grows itself because making tools pays.
6. **Proof gets stronger, not weaker.** With a real harness every tool call is a
   witnessable event → seal the whole ACTION TRAIL, not just the final output. "Every
   step verifiable" becomes literal — no competitor can offer it.
7. **Terminal skin.** The Studio wears the locked phosphor-terminal language
   ([[design-system]]): `[ TITLE ]` panes, plain-English agentic readouts (NO charts on
   agentic screens), PulseDot grammar. Reference room: `/labs/studio`.

## The screen (locked layout)

```
[ user@neugrid:~$ echo studio — <project> ]   [ HIRE HELP ][ OPEN A RAISE ][ DEPLOY ][ TOKENIZE ]
┌─[ PROJECT ]────────┬─[ LIVE PREVIEW ]───────────────┬─[ CREW · LIVE ]──────────┐
│ file tree          │ the app, updating as the       │ ● Rex · engineer         │
│ (● = being edited) │ crew ships                     │   2 tests failing → fix  │
│                    │                                │   brain: grok-4.5        │
│ [ CHECKPOINTS ]    │ [ COMMAND ]                    │ ● Ivy · designer …       │
│ v7 · restore ↺     │ > tell the crew what to change │ ● Juno · tester …        │
│                    │                                │ ● Max · marketing …      │
│ [ PROOF ]          │ [ MISSION FEED ]               │ [ SKILLS INSTALLED ]     │
│ step 214 sealed    │ plain-English crew lines,      │ pills + "+ store"        │
│ sha a3f2…9c71      │ approvals inline               │ [ SESSION ] cost/engine  │
└────────────────────┴────────────────────────────────┴──────────────────────────┘
```

---

## Phases + verification gates

**Rule: a phase is DONE only when its gate passes with evidence. Then the next begins.**

### Phase 0 — the room, on paper you can feel · `/labs/studio` ✦ IN PROGRESS 2026-07-18
A living design prototype in the terminal skin (self-contained, scripted demo loop — no
backend): crew rail ticking with per-seat brains visible, preview that visibly updates as
the crew "ships", command line that takes a directive and the crew responds, proof-step
counter, checkpoints, skills rail, the four money buttons, session cost readout.
**Gate:** founder looks at it in real Chrome, tears it apart, and LOCKS the room's design
(his taste pass is the verification).

### Phase 1 — the engine room (headless Grok Build, benchmarked)
- Clone + compile grok-build (Rust) on the Mac; run headless in a jailed workdir.
- `src/lib/engine/` seam: `runEngineBuild({workspace, instruction, brain})` → drives the
  binary headless, collects changed files + the per-step event stream.
- Sandbox: isolated per-build workdir, no network egress for the build process (their
  telemetry stays stubbed — we compiled it ourselves), CPU/time caps.
- Benchmark: same 3 real prompts through today's one-shot Echo AND the engine; also A/B
  Fable-vs-Grok as the brain inside on one prompt (decision evidence for the three-brain
  pairing).
**Gate:** side-by-side outputs; founder judges quality with his own eyes; engine files flow
into the EXISTING pipeline (sha256 proof + preview + deploy) untouched. Money: build cost
measured in real tokens → a GRID price recommendation.

### Phase 2 — Studio MVP (real workspaces, one builder + the engine) ✅ GATE PASSED 2026-07-18
Evidence: workspace `wksp_e0e88dc3` — run 1 built the habit tracker (3 files, engine
self-verified w/ 25 jsdom checks after the Seatbelt jail blocked Chrome — the sandbox held),
run 2 iterated dark mode → v2; both versions proof-sealed + trail-sealed (59 steps,
`ngtrail:sha256:767128…`); checkpoints v1+v2 restorable; deployed live `/d/habit-tracker`
(HTTP 200, serves v2); 400 GRID metered (2×200) → treasury; async job design proven
(run POST returns <1s, room polls); pages in the house 3-panel design; tsc+eslint clean.
Shipped: `modules/studio.ts` (#43) · `src/lib/engine` on_event · store collection
`studioWorkspaces` + `db/migrations/2026-07-18-studio.sql` · param `studio_run_cost_grid`
(200) · routes `/api/studio{,/[id]}` · pages `/echo/studio{,/[id]}` · hub link.
- Persistent Workspace: store collection + pg spec + migration (project files, checkpoints,
  session log, engine events). Import-a-repo lands here too (zip/paste first; git later).
- `/echo/studio/[id]`: the Phase-0 room wired real — chat-edit loop through the engine,
  live preview (sandboxed like /d/), checkpoints/undo, long-running builds (job runner —
  NOT the request thread; poll/SSE progress like markets stream).
- **Action-trail sealing:** every engine step → witnessed event; seal the trail into the
  build proof (extends echo.ts proofs; the "receipt, not claim" moat).
- GRID metering per session (params: studio session/step costs; conservation tests).
**Gate:** build a real app end-to-end in the Studio (multi-file, runs, iterated over ≥2
sessions), deploy it to `/d/`, proof page shows the sealed step trail. tsc/eslint clean,
money conserved.

### Step 0 — the engine keeps itself fresh ✅ BUILT + PROVEN 2026-07-19
`scripts/engine-update.sh` (--check ~2s / --update bg rebuild + probe-smoke + auto-rollback
via `.prev` + git reset on fail + WHATS_NEW/DOCS_CHANGED scan) wired into `.claude/commands/
start.md` step 4. Proven live: 0.2.102→**0.2.105** pulled + rebuilt (7m) + smoke-passed + swapped.
⚠ Lesson: upstream DROPPED the `--yolo` alias → `--always-approve` (seam updated); the smoke
test now uses an invalid-value PROBE (every seam flag + `--output-format bogus`), not a --help
grep (which missed hidden-but-accepted flags).

### Phase 6a — quick power ✅ BUILT + PROVEN 2026-07-19
Quality dial (standard/verified `--check`/best-of-3 `--best-of-n 3`, priced 1×/1.5×/3× in the
command bar) · effort knob (`--reasoning-effort`) · RULES card (workspace AGENTS.md, engine
obeys automatically) · memory toggle (`--experimental-memory`) · **real $ per run** (the engine's
own `total_cost_usd` → SESSION "engine compute" + a cyan StepArea) · receipt export
(`GET /api/studio/[id]/export` → sealed Markdown). Proof: a **verified-tier** run on **Grok-4.5
hands** shipped v6 (footer law "built in Echo Studio" obeyed + the paid changelog skill fired),
**563K tokens = $0.47** shown honestly in the room, 299s.

### Phase 6b — MCP CONNECTIONS ✅ BUILT + PROVEN 2026-07-19
The CREW rail's CONNECTIONS pane: a curated catalog (GitHub/Postgres/mcp-test) + custom command;
secrets stored server-side, MASKED to key-names in views; `Studio.addMcp/removeMcp` write the
workspace `.grok/config.toml` `[mcp_servers.*]` (per-workspace — the engine discovers it via cwd;
self-built engine skips repo-trust so OUR connect action IS the consent gate); `checkMcp` spawns
the engine's own `mcp doctor`. Proof: connected the MCP test server → doctor reported **✓ 13 tools
discovered, ● live**; PER-WORKSPACE ISOLATION proven (remove the config → mcp-test vanishes from
the doctor). ⚠ health parse reads the ✓ BLOCK after each server header, not the header line.

### THE HANDS ARE GROK ✅ 2026-07-19
`NEUGRID_STUDIO_BRAIN_HANDS=grok-4.5` (founder's xAI key in `.env.local` `XAI_API_KEY`). The
engine now builds natively on Grok via xAI (auto-caching, ~$2/$6). First Grok build = the 6a
proof above. Founder direction: head Grok-FIRST (chief A/B pending an Anthropic top-up — that key
ran dry mid-session; the chief/chatter/Echo/Ventures seats fail-soft to quiet until refilled).
Anthropic stays as a dormant fallback config (zero spend). Roles fixed, models swappable.

### Phase 6d — crew-in-engine ⚠ BLOCKED ON PHASE 7 (finding 2026-07-19)
Goal: seal every engine tool call into the trail + show tester/reviewer subagents working.
**Investigation found this is NOT reachable via the headless `-p` interface we drive:**
(1) headless streaming-json emits ONLY `text`/`thought`/`end`/`error`/`max_turns_reached` —
NO per-tool-call or subagent-lifecycle events (verified in `headless.rs`); (2) HOOKS (the
engine's designed observability, incl. SubagentStart/Stop + PostToolUse) are **TUI-only** —
`load_hooks`/`HookRegistry`/`run_hooks` are wired ONLY into the interactive views, never the
headless path (3 hook test-runs fired nothing; global + project + /tmp-write all silent).
**→ 6d depends on PHASE 7 (ACP agent-server mode):** `grok agent` streams `tool_call`,
`tool_call_update`, `plan`, `agent_thought_chunk` via `session/update` — exactly what 6d
needs, natively. RECOMMENDATION: do Phase 7 next (it's also the prod runner — the "prod has
no engine" answer); then 6d = consume the tool_call/subagent stream the ACP server already
emits. Grinding observability onto headless `-p` fights the grain.

### Phase 7 — the engine becomes a service ✦ CORE BUILT + PROVEN 2026-07-19 (prod-runner infra-gated)
**Probed first (the 6d discipline):** `grok agent stdio` speaks ACP (JSON-RPC 2.0, newline-
delimited): `initialize`(proto 1) → `session/new {cwd}` → `session/prompt` → streamed
`session/update` `{agent_message_chunk · agent_thought_chunk · tool_call · tool_call_update ·
plan}`. Live probe w/ grok-4.5 → `tool_call: list_dir` + 31 thought/29 msg chunks. Sandbox
in agent mode = **`GROK_SANDBOX=workspace` ENV** (no --sandbox flag; resolves in
`agent/config.rs`). Built **`src/lib/engine/acp.ts` `runEngineBuildAcp`** — same EngineResult
contract, drives the ACP handshake, emits `tool`/`tool_update`/`plan` events, snapshot-diff
files, timeout kill, same kernel jail. **`engineMode()`** (env `NEUGRID_ENGINE_MODE=acp`,
headless default) picks the seam; studio.ts seals each `tool_call` as a **`tool` trail event**
(Phase 6d's per-tool-call moat — narration buffered + flushed at each tool boundary; quality
tiers stay headless). **PROVEN:** an ACP stopwatch build streamed `▸ run_terminal_command`
live + sealed individual tool calls into the witnessed trail (`tool` type, amber #ffb347);
SESSION shows "· live". ⚠️ **v1 / follow-ons:** fresh session per run (session/load resume
later); ACP cost not yet parsed (headless still reports $); web-tool-disable TBD; **PROD
RUNNER infra-gated** (Cloud Run has no engine binary — needs an engine host near prod);
live in-room approvals + mid-run steering = the next ACP layer. **6d is now unblocked.**

### Phase 3 — the crew moves in ✦ CORE BUILT + CYCLE PROVEN 2026-07-18 (founder gate pending)
Evidence: one directive ("add a copy button…") → the CHIEF (claude-fable-5) wrote the
engineering brief → the HANDS (engine, `-m` per run) built v2 with the feature working in
the preview → the CHATTER (haiku) wrote the founder's status line → the CHIEF graded
**pass** with specific evidence — all visible per-seat in the room (CREW · LIVE rail +
mission feed), both crew decisions sealed as `crew` trail events. Grade is schema-enforced
(no regex anywhere). A "revise" verdict parks the chief's corrective brief as an inline
amber approval card — the paid fix run fires ONLY on the owner's click (`resolveFix`;
code-verified, awaits a natural revise for its live demo).
Shipped: `Brain.studioBrief/studioGrade/studioStatus` (brain seam + claude.ts, fail-soft
null → engine-only run) · `Studio.studioBrains()` env config `NEUGRID_STUDIO_BRAIN_
{CHIEF,HANDS,CHATTER}` (defaults fable-5 / engine model / haiku-4.5 — roles fixed, models
swappable) · `StudioTurn.role` +chief/chatter +grade · trail type `crew` ·
`StudioWorkspace.pending_fix` · API action `fix` · the CREW · LIVE rail. ⚠ Fable-5 lesson:
it REJECTS `thinking:{type:"disabled"}` (adaptive always) — chief calls send no thinking
param + roomier max_tokens; both verified live on fable.
- **Launch assets DONE (same day, later session):** `Studio.draftLaunchAssets` — the
  CONTENT seat drafts the launch post (Brain.specialistWork, grounded in the real
  build + live URL) + the MARKETING seat writes the tagline; parks as `pending_post`
  (publishing is public → ALWAYS owner-gated); approve → a real wire post.
  Evidence: post `post_40fc24b7` live on the wire, topic build, ref → the real build.
- Remaining in phase: a live revise→approve→fix-run demo (code-verified; awaits a
  natural "revise" verdict).
**Gate:** founder gives one directive; the crew builds a feature with visible per-agent
work; every action fires via structured intents (no regex); approval gates hold; a full
crew cycle completes in the Studio UI. ← the cycle above is this, minus the founder's
own eyes (his taste pass locks the gate).

### Phase 4 — money in the room ✅ BUILT + EVERY BUTTON LIVE-DEMOED 2026-07-18
The room header's money row + inline panels (state from `view().money` — all real
lookups off the build's grid/product/proposal/market links):
- **HIRE HELP** → `Studio.hireHelp` → `Jobs.postFundedJob` (USDC escrow). Evidence:
  `job_ebfb132d` — exactly 25 USDC left the owner's wallet into escrow `esc_024eaaa2`.
- **OPEN A RAISE** → Echo.draftProposal (free, editable review in-room) → /api/proposals.
  Evidence: `prop_b006891f` open on the Fund board ($9,500 · 5 milestones · build-linked).
- **LAUNCH POST** → the Phase-3 launch-assets flow (owner-gated wire post).
- **TOKENIZE** → the "PATH TO TOKEN" checklist panel driving the EARNED path: project
  grid (`ensureHomeGrid`) → GridX listing (SELL) → security audit (non-founder verifier)
  → `launchToken`. Evidence: grid `step-chain-check` → product `prod_a0013a59` → audit
  `aud_b6b2450f` passed by usr_trinity → **$CONV market `mkt_f22d88ac` LIVE at Alpha**.
- **DEPLOY** → the existing rail. Evidence: `/d/step-chain-check` 200.
**Gate:** each button live-demoed once; money-conservation proven per flow (the platform
invariants in [[tokenomics]] / audit memories hold). ← all demonstrated above; the
founder's own click-through remains his review pass.

### Phase 6c — PLUGINS + the store as a plugin marketplace ✅ BUILT + PROVEN 2026-07-19
A plugin bundles several INERT components (skills + slash-commands + agent personas +
plugin.json) in the open grok-build layout, sold on the SAME skills-market rails (domain
`studio-plugin`, `recipe` = the JSON file map, pinned at publish). **Security (v1): an
allowlist — `skills/<n>/SKILL.md · commands/<n>.md · agents/<n>.(md|json) · plugin.json` —
is enforced at PUBLISH and re-checked at MOUNT; anything that executes (hooks, bundled
MCP/LSP) is rejected both times.** Installs into the TOOLBOX (hub, flows into every
workshop) or a workshop (project-only); the Studio mounts each under `.grok/plugins/<name>/`
and names it in `[plugins] enabled` (grok disables plugins by default → naming = switching
on). Shipped: `SkillsMarket.publishPlugin/installPlugin/listPlugins/pluginFiles/
isInertPluginPath` · `Toolbox.installPlugin/removePlugin` · `Studio.installWorkspacePlugin`
+ `effectivePlugins`/`mountPlugins` · `/api/skills` POST kind "plugin" · toolbox
plugin_install/remove · studio install_plugin · the /skills composer's Skill|Plugin toggle
(multi-file editor + allowed-paths hint) · plugin chips (cyan ⧉) + store rows in the room
& hub SKILLS·PLUGINS panes. **GATE PROVEN:** trinity published "Launch kit" (3 files, 120
GRID) → a hooks/.mcp.json bundle was REJECTED (`bad_path`) → neo installed it to the toolbox
(neo −120, trinity +117, treasury +3, settlements, conserved) → it inherited into the
workshop (scope:toolbox) → mounted (3 files under `.grok/plugins/launch-kit/`, `[plugins]
enabled=["launch-kit"]`) → a FRESH workspace auto-inherited it (zero setup) →
**the engine's own `inspect` confirms `launch-kit (project, enabled) 1 skills`** — loaded
+ switched on. ⚠️→✅ **FOUND + FIXED: a bundled skill didn't ACTIVATE at first** (a neutral countdown build
had no SEO meta) because plugin-bundled skills showed only under "Plugins", NOT the top-level
activatable "Skills (N)" list. **FIX: `mountPlugins` now ALSO flattens each plugin `skills/
<n>/SKILL.md` into the first-class `.grok/skills/<plugin>-<n>/` tier** (where the workspace
changelog-skill fired) — the engine's `inspect` now lists `launch-kit-seo-basics` as an
activatable project skill. ✅ **PROVEN: a neutral tip-calculator build (nobody mentioned SEO)
shipped with `meta name="description"` + 2 `og:` tags** — the plugin's bundled skill fired.
6c is complete end-to-end: publish → secure → pay → inherit → mount → engine-load → the
model uses the plugin's component in a build. ⚠️ during this a stray edit TRUNCATED `mountPlugins`
mid-line (`".grok", "pl`) — the running dev server had cached a good copy so builds still
ran; caught + repaired, restart cleared it.

### Phase 5 — the skills store economy ✅ BUILT + FULL LOOP PROVEN 2026-07-18
Build-skills = SKILL.md prompt packages in the open grok-build format, published on the
EXISTING skillsMarket rails (reserved domain `"studio"` marks the kind; `recipe` holds
the body, version-pinned). Install targets a WORKSHOP, not an agent: the body pins onto
the workspace and mounts into the engine workdir at `.grok/skills/<name>/SKILL.md`
(the engine's highest-priority tier; `.grok` excluded from files/snapshots/proofs).
Shipped: `SkillsMarket.publishBuildSkill/installBuildSkill/listBuildSkills` (same
economics — GRID price, fee → treasury, creator reputation; self-install free) ·
`Studio.installSkill` + workspace `skills` field · `/api/skills` POST kind "build" ·
the room's SKILLS rail with "+ store" · /skills store cards route studio skills to the
workshop · **the "Write a build-skill" COMPOSER on /skills** (left rail: title · pitch ·
price · a pre-filled SKILL.md template whose description block = the trigger; publish →
listed instantly — proven through the real UI with "Mobile-first check"). ⚠ Install RESETS `engine_session_id` — skills load at engine-session START;
a resumed warm session never sees a new skill (found live: the first proof run resumed
and ignored the skill).
**Gate evidence (the full loop):** usr_trinity published "Changelog keeper" (150 GRID)
→ usr_neo installed it from the room — trinity +146, treasury +4 fee, settlements
ledgered, conservation exact → mounted → the next engine run shipped **CHANGELOG.md
with a dated, honest entry** exactly per the skill's rules (in the sealed v5 build) →
creator paid. Also proven en route: the stock-skill door (`neugrid-terminal-skin` in
the engine home — a run shipped an app wearing the full house skin).

### Cross-cutting (every phase)
- **The engine keeps itself fresh** (founder rule 2026-07-19): every /start runs
  `scripts/engine-update.sh --check` (~2s vs upstream HEAD); an available update
  rebuilds in the BACKGROUND (old binary keeps serving), must pass a smoke test
  (version + every seam-critical flag present) before it's kept, and auto-restores
  the previous binary on any failure (`<bin>.prev`). Each update's commit log +
  docs diff is scanned for NEW capabilities to productize. Log: `~/Desktop/
  neugrid-engine/update.log`.
- Sandbox/security review before anything user-facing executes code server-side.
- Cost telemetry per build (tokens per brain per seat) → pricing params.
- Staging deploy + migration per phase (the /end recipe); memory `echo-studio` updated.
- The preview-pane rAF/video gotchas apply to verifying the room ([[design-system]]).

## Where the pieces already live
- Crew engine: `src/lib/modules/venture.ts` (structured intents DONE 2026-07-18) ·
  brains: `src/lib/brain/` (pluggable; add grok provider in Phase 1).
- Proof/witness: `src/lib/modules/echo.ts` · deploy: `/d/[slug]` server.
- Escrow/jobs: `modules/jobs.ts` (postFundedJob proven) · raises: `genesis.ts` ·
  markets: `markets.ts` · skills: `skillsMarket.ts`.
- Terminal language: `/labs/terminal` + `[[design-system]]` · agentic readout grammar:
  the `/venture/[id]` cockpit (founder-approved).
