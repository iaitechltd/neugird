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

5. **Push to GitHub** — commit all session changes and push to `origin main` (https://github.com/iaitechltd/neugird, public). Before committing, verify no sensitive files are staged (`.env*`, `.neugrid-store.json` — both gitignored; run a quick secret-pattern scan over newly added files). Use a descriptive commit message summarizing the session. If the push 403s as `coretech33`, switch with `gh auth switch --user iaitechltd` first. Record the pushed commit hash in the handoff.

6. **Deploy to staging** (https://staging.neugrid.io — founder rule 2026-07-10: every /end ships the session's work). Skip ONLY if the pushed commit is already the deployed revision's commit:
   - Pre-flight: no macOS `* 2.*` junk copies anywhere (`find . -path ./node_modules -prune -o -name "* 2.*" -print`).
   - Build: `gcloud builds submit --tag us-central1-docker.pkg.dev/neugrid-io/neugrid/app:latest` — check the REAL exit code (PIPESTATUS if piped; a failed build must never deploy the stale `:latest`).
   - Deploy image-only (env/secrets preserved — never re-pass `--set-env-vars`): `DIGEST=$(gcloud artifacts docker images describe …app:latest --format="value(image_summary.digest)")` then `gcloud run deploy neugrid --image …app@$DIGEST --region us-central1 --max-instances 1 --quiet`.
   - **Apply any NEW `db/migrations/*.sql` created this session**: `gsutil cp` to `gs://neugrid-io-sql/` + `gcloud sql import sql neugrid-db gs://neugrid-io-sql/<file> --database=neugrid --quiet` (additive `if not exists` migrations are safe in any order).
   - Verify: `https://staging.neugrid.io/` + `/home` + `/markets` return 200 and `/api/me` still answers `{"error":"no_user","demo":false}` (the staging posture must survive every deploy). Record the new revision in the handoff.

7. **Summarize** what you recorded, the deployed revision, and what's queued for next time.
