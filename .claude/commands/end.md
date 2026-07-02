---
description: Wrap up the NeuGrid session — update memory + write a cold-start handoff, verify the build, then summarize. No new feature work.
---

Wrap up this NeuGrid work session. **Do NOT start new feature work** — this is a checkpoint.

1. **Review** what changed this session (the conversation + `git status` / recent edits): what was built, changed, decided, or left unfinished.

2. **Update the persistent memory** at `/Users/axoniue/.claude/projects/-Users-axoniue-Desktop-neugrid/memory/`:
   - Refresh `neugrid-build.md` so it reflects the CURRENT state (replace stale facts — don't just append).
   - Add/update other memory files for new durable facts (decisions, gotchas, cloud ids). Keep `MEMORY.md` (the index) in sync. Convert relative dates to absolute.

3. **Update `session-handoff.md`** with: ✅ done this session · 🔜 the next task(s) with enough detail to resume cold (file paths, Figma node-ids, exact commands, next frame to pull) · ⚠️ anything blocked / needs a decision / broken.

4. **Verify the build** — the dev server returns 200 on `/`, `/home`, and `/tradex`. Record the result in the handoff.

5. **Push to GitHub** — commit all session changes and push to `origin main` (https://github.com/iaitechltd/neugird, public). Before committing, verify no sensitive files are staged (`.env*`, `.neugrid-store.json` — both gitignored; run a quick secret-pattern scan over newly added files). Use a descriptive commit message summarizing the session. If the gh CLI's active account isn't `iaitechltd`, switch with `gh auth switch --user iaitechltd` first. Record the pushed commit hash in the handoff.

6. **Summarize** what you recorded and what's queued for next time.
