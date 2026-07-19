---
description: Bootstrap the NeuGrid session — read CLAUDE.md + memory as source of truth, verify the app, line up the next task.
---

Bootstrap this NeuGrid work session. Treat `CLAUDE.md` / `AGENTS.md` and the persistent memory as the **source of truth**.

1. **Read** `CLAUDE.md` + `AGENTS.md` (note: this is a *modified* Next.js — read the relevant guide under `node_modules/next/dist/docs/` before writing Next.js code). Then read `MEMORY.md` and EVERY file it links under `/Users/axoniue/.claude/projects/-Users-axoniue-Desktop-neugrid/memory/` — especially `neugrid-build.md`, `neugrid-infra.md`, and `session-handoff.md`.

2. **Reconcile** the memory against the actual tree — verify the routes/files/decisions it names still exist (`git status`, list `src/app`). The memory reflects the *last* session; note any drift before trusting a fact.

3. **Verify the app runs** — start the Claude Preview dev server "neugrid-dev" (port 3000) if it isn't running; confirm `/`, `/home`, and `/tradex` return 200.

4. **Keep the engine fresh** (founder rule 2026-07-19) — run `scripts/engine-update.sh --check` (~2s). If it prints `ENGINE_UPDATE_AVAILABLE`, kick `scripts/engine-update.sh --update` as a BACKGROUND task (never block bootstrap — the rebuild takes ~7 min; the old binary keeps working and is auto-restored if the new one fails its smoke test). When the update lands, report the new version AND the `WHATS_NEW` commit lines in your summary — **scan them for new engine capabilities to productize** (that's the point of self-hosting). If `DOCS_CHANGED` prints, read the changed docs under `~/Desktop/neugrid-engine/grok-build/crates/codegen/xai-grok-pager/docs/` before any Studio work.

5. **Summarize** (3–5 lines): where the project stands, the single most important next task (from the handoff), and any blockers waiting on the user.

6. **Continue** the next task unless redirected.
