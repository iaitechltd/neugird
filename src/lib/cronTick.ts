/**
 * Cron tick dedupe — defense in depth for schedulers that may re-deliver a tick
 * (ICP HTTPS outcalls in replicated mode send one request per subnet replica).
 * A tick carries `x-ng-cron-tick`; a repeat of a seen id is acknowledged without
 * running the sweep. Check-and-record is synchronous, so concurrent duplicates
 * can't both pass. In-memory on purpose: worst case (restart) a tick runs twice,
 * which the sweeps tolerate — same as before this guard existed.
 */

const seen = new Set<string>();

/** True when this request is a duplicate of an already-processed tick. */
export function isDuplicateTick(request: Request): boolean {
  const tick = request.headers.get("x-ng-cron-tick");
  if (!tick) return false; // schedulers without tick ids (Cloud Scheduler) pass through
  if (seen.has(tick)) return true;
  if (seen.size >= 1000) seen.clear();
  seen.add(tick);
  return false;
}
