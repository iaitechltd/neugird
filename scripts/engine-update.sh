#!/usr/bin/env bash
# Engine self-update — keeps the self-hosted Grok Build engine current (docs/ECHO_STUDIO.md).
#
#   --check   fast (~2s, read-only): prints ENGINE_UP_TO_DATE or ENGINE_UPDATE_AVAILABLE <local>..<remote>
#   --update  pull + rebuild (+~7 min) + smoke test + swap-with-rollback. Run it in the background.
#
# Safety: the previous binary is kept at <bin>.prev BEFORE the rebuild; if the new
# build fails the smoke test (or the seam-critical flags vanish), the old binary is
# restored and the script exits 1 — the platform never loses its engine.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"

REPO="${NEUGRID_ENGINE_REPO:-$HOME/Desktop/neugrid-engine/grok-build}"
BIN="$REPO/target/release/xai-grok-pager"
HOME_DIR="${NEUGRID_ENGINE_HOME:-$HOME/Desktop/neugrid-engine/home}"
LOG="$HOME/Desktop/neugrid-engine/update.log"

say() { echo "$*" | tee -a "$LOG"; }

local_rev()  { git -C "$REPO" rev-parse HEAD; }
remote_rev() { git ls-remote "$(git -C "$REPO" remote get-url origin)" HEAD | cut -f1; }

smoke() { # $1 = binary path → 0 ok / 1 broken
  local b="$1" err
  GROK_HOME="$HOME_DIR" XAI_API_KEY="${XAI_API_KEY:-placeholder}" "$b" --version >/dev/null 2>&1 || { say "SMOKE_FAIL: --version failed"; return 1; }
  # The probe: EVERY flag our seam (src/lib/engine/index.ts) passes, each with a valid
  # value, then a deliberately invalid value on --output-format LAST. The parser reads
  # left-to-right, so "invalid value 'bogus'" proves every earlier flag still parses,
  # while "unexpected argument" names any flag the new build dropped (help-text greps
  # miss hidden-but-accepted flags — learned 2026-07-19). No run ever starts.
  err="$(GROK_HOME="$HOME_DIR" XAI_API_KEY="${XAI_API_KEY:-placeholder}" "$b" -p x --always-approve --cwd /tmp --sandbox workspace --no-auto-update --max-turns 1 -m neugrid-claude --disallowed-tools web_search --resume abc --check --best-of-n 3 --reasoning-effort high --experimental-memory --output-format bogus 2>&1 || true)"
  if grep -q "unexpected argument" <<<"$err"; then say "SMOKE_FAIL: $(grep -o "unexpected argument '[^']*'" <<<"$err" | head -1)"; return 1; fi
  grep -q "invalid value 'bogus' for '--output-format" <<<"$err" || { say "SMOKE_FAIL: probe got unexpected output: $(head -1 <<<"$err")"; return 1; }
  return 0
}

case "${1:---check}" in
  --check)
    L="$(local_rev)"; R="$(remote_rev)"
    if [ "$L" = "$R" ]; then echo "ENGINE_UP_TO_DATE ${L:0:7}"; else echo "ENGINE_UPDATE_AVAILABLE ${L:0:7}..${R:0:7}"; fi
    ;;
  --update|--rebuild)
    echo "== engine update $(date -u +%FT%TZ) ==" >> "$LOG"
    L="$(local_rev)"; R="$(remote_rev)"
    if [ "${1:-}" = "--update" ] && [ "$L" = "$R" ]; then say "ENGINE_UP_TO_DATE ${L:0:7}"; exit 0; fi
    say "ENGINE_UPDATING ${L:0:7}..${R:0:7}"
    cp -f "$BIN" "$BIN.prev"                       # rollback point BEFORE anything changes
    [ "$L" != "$R" ] && git -C "$REPO" pull --ff-only >>"$LOG" 2>&1
    say "ENGINE_BUILDING (cold build ~7 min; cached relink is fast)"
    if ! (cd "$REPO" && cargo build --release >>"$LOG" 2>&1); then
      # keep the invariant: the repo rev always matches the SERVING binary
      say "ENGINE_BUILD_FAILED — restoring previous binary + rev"; cp -f "$BIN.prev" "$BIN"; git -C "$REPO" reset --hard "$L" >>"$LOG" 2>&1; exit 1
    fi
    if ! smoke "$BIN"; then
      say "ENGINE_SMOKE_FAILED — restoring previous binary + rev (inspect with: git -C $REPO log ${L:0:7}..${R:0:7})"
      cp -f "$BIN.prev" "$BIN"; git -C "$REPO" reset --hard "$L" >>"$LOG" 2>&1; exit 1
    fi
    V="$(GROK_HOME="$HOME_DIR" XAI_API_KEY=placeholder "$BIN" --version 2>/dev/null | head -1)"
    say "ENGINE_UPDATED ${L:0:7} -> $(local_rev | cut -c1-7) · $V"
    say "WHATS_NEW (commits):"
    git -C "$REPO" log --oneline "${L}..HEAD" | head -15 | tee -a "$LOG"
    D="$(git -C "$REPO" diff --stat "${L}..HEAD" -- crates/codegen/xai-grok-pager/docs 2>/dev/null | tail -1)"
    if [ -n "$D" ]; then say "DOCS_CHANGED: $D — read the changed docs for NEW CAPABILITIES to productize"; fi
    exit 0
    ;;
  *)
    echo "usage: engine-update.sh [--check|--update]"; exit 2
    ;;
esac
