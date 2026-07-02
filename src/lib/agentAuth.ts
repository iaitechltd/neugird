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
