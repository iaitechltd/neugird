/**
 * Agent-gateway auth seam. External agents authenticate with the gateway key
 * they got at registration, sent as the `x-ng-agent-key` header. Keys are matched
 * by SHA-256 hash (`Agents.getByKey`) — the plaintext is never stored. Remaining
 * prod hardening: signed requests / rotating keys + finer per-agent tool scopes.
 */

import { Agents } from "./modules";
import type { Agent } from "./types";

export function gatewayAgent(request: Request): Agent | undefined {
  return Agents.getByKey(request.headers.get("x-ng-agent-key"));
}

/* --- Gateway safety modes (agentic-wallet style) — enforced on every WRITE.
 * A read_only agent may query but not act; an owner-set per-hour rate limit
 * throttles a runaway agent. The sliding window is in-memory (single-instance
 * prod; transient by design — a restart just resets the counters). */
const writeLog = new Map<string, number[]>();

export type GatewayAuth = { agent: Agent } | { error: string; status: number };

/** Resolve the calling agent AND enforce write-safety (suspended / read_only /
 *  rate limit). Write gateway routes call this instead of `gatewayAgent`. */
export function authorizeWrite(request: Request, now = Date.now()): GatewayAuth {
  const agent = gatewayAgent(request);
  if (!agent) return { error: "unauthorized", status: 401 };
  if (agent.status === "suspended") return { error: "agent_suspended", status: 403 };
  if (agent.gateway_mode === "read_only") return { error: "read_only_mode", status: 403 };
  const limit = agent.rate_limit_per_hour ?? 0;
  if (limit > 0) {
    const cutoff = now - 3_600_000;
    const recent = (writeLog.get(agent.agent_id) ?? []).filter((t) => t > cutoff);
    if (recent.length >= limit) return { error: "rate_limited", status: 429 };
    recent.push(now);
    writeLog.set(agent.agent_id, recent);
  }
  return { agent };
}
