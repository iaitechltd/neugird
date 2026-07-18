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

### Phase 3 — the crew moves in
- Wire the Ventures brain-graph (ceoPlan structured intents → specialists) into Studio
  sessions: chief briefs, hands build through the engine, tester runs it, content/marketing
  produce launch assets; approvals inline in the mission feed (the venture approval rails).
- Three-brain config: params `studio_brain_chief|hands|chatter` (model ids), per-seat
  display in the crew rail.
- The chief GRADES: review step between hands-output and user-visible (reject → re-brief).
**Gate:** founder gives one directive; the crew builds a feature with visible per-agent
work; every action fires via structured intents (no regex); approval gates hold; a full
crew cycle completes in the Studio UI.

### Phase 4 — money in the room
- HIRE HELP → escrowed Job posted from the Studio (existing Jobs escrow; venture bounty
  path already proven). OPEN A RAISE → Echo.draftProposal → Genesis. DEPLOY → /d/.
  SELL → GridX listing. TOKENIZE → Markets (delivery-status gate).
**Gate:** each button live-demoed once; money-conservation proven per flow (the platform
invariants in [[tokenomics]] / audit memories hold).

### Phase 5 — the skills store economy
- Adopt the grok-build skill/plugin format (their extension dirs) for build-skills;
  publish/install via skillsMarket (GRID per install, creator payout rails exist).
- Installed skills mount into the engine workspace; "+ store" in the Studio rail.
**Gate:** one community-authored skill: published → installed → demonstrably used by the
engine in a build → creator paid. 

### Cross-cutting (every phase)
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
