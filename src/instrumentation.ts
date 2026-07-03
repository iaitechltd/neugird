/**
 * Server boot hook (Next.js instrumentation). Blocks startup until the store has
 * hydrated so the first request never sees pre-hydration seed data, then optionally
 * starts the in-process native-agent worker scheduler.
 *
 * - Postgres mode (DATABASE_URL set): waits for Cloud SQL to load every
 *   collection + singleton before serving.
 * - JSON / dev mode: `dbReady` resolves immediately, so hydration is a no-op.
 *
 * Guarded to the Node.js runtime (the store uses `fs`/`pg`, unavailable on edge).
 */

function isOn(v: string | undefined): boolean {
  return !!v && ["1", "true", "on", "yes"].includes(v.trim().toLowerCase());
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dbReady } = await import("@/lib/store");
  await dbReady;

  // Optional 24/7 worker scheduler: tick every armed native agent on an interval, so
  // agents work autonomously without a UI Run-step. OFF by default (dev/demo unchanged).
  // In-process = per server instance; on autoscaling Cloud Run prefer an EXTERNAL cron
  // → POST /api/cron/agent-work (one scheduled instance). Both call AgentWork.tickAll().
  const g = globalThis as unknown as { __ngWorkerTimer?: ReturnType<typeof setInterval> };
  if (isOn(process.env.NEUGRID_WORKER_SCHEDULER) && !g.__ngWorkerTimer) {
    const ms = Math.max(15_000, Number(process.env.NEUGRID_WORKER_TICK_MS) || 60_000);
    const { AgentWork } = await import("@/lib/modules");
    g.__ngWorkerTimer = setInterval(() => {
      void AgentWork.tickAll().catch(() => {});
    }, ms);
    g.__ngWorkerTimer.unref?.();
    console.log(`[neugrid] native-agent worker scheduler ON · every ${ms}ms`);
  }

  // Optional 24/7 TRADING scheduler — the Agent-Mode sibling of the worker above:
  // sweep every active native mandate through AgentTrading.tickAll so armed agents
  // trade without an open terminal. Same posture: OFF by default, external cron
  // preferred in prod (POST /api/cron/agent-trading).
  const gt = globalThis as unknown as { __ngTraderTimer?: ReturnType<typeof setInterval> };
  if (isOn(process.env.NEUGRID_TRADER_SCHEDULER) && !gt.__ngTraderTimer) {
    const ms = Math.max(15_000, Number(process.env.NEUGRID_TRADER_TICK_MS) || 60_000);
    const { AgentTrading } = await import("@/lib/modules");
    gt.__ngTraderTimer = setInterval(() => {
      try { AgentTrading.tickAll(); } catch { /* next tick retries */ }
    }, ms);
    gt.__ngTraderTimer.unref?.();
    console.log(`[neugrid] agent-trading scheduler ON · every ${ms}ms`);
  }
}
