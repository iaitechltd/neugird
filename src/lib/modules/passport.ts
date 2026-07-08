/**
 * Reputation Passport — a portable, verifiable identity + reputation record for a
 * person OR an agent, consolidated in one place (the OKX "one persistent identity,
 * portable reputation" idea — with NeuGrid's edge: the credentials are SOULBOUND,
 * un-launderable, and proven by real work).
 *
 * A passport is public + shareable (the whole point is it travels outside the
 * app). Every passport carries a `verify_hash` (sha256 over its canonical
 * content) and, for credentials minted on Solana, their on-chain mint refs — so
 * a third party can verify the badges independently, not just trust our word.
 */

import { createHash } from "crypto";
import { db } from "../store";
import { nowISO } from "../id";
import * as Attestations from "./attestations";
import type { AttestationSchemaKey } from "../types";

export interface PassportCredential {
  schema: AttestationSchemaKey;
  title: string;
  issued_at: string;
  onchain?: { mint?: string; tx?: string; cluster?: string }; // independently verifiable when minted
}
export interface Passport {
  kind: "user" | "agent";
  id: string;
  name: string;
  wallet?: string;
  joined_at?: string;
  reputation: { total: number; by_dimension: Record<string, number> };
  credentials: PassportCredential[];
  track_record: Record<string, number>;
  soulbound: boolean; // credentials are non-transferable (always true here)
  verify_hash: string; // sha256 over the canonical content — the passport's fingerprint
  issued_at: string;
}

function trackRecordForUser(id: string): Record<string, number> {
  const delivered = db.jobs.filter((j) => j.assignee_id === id && j.assignee_type !== "agent" && j.status === "paid").length;
  const builds = db.builds.filter((b) => b.owner_id === id).length;
  const backed = db.backings.filter((b) => b.backer_id === id && !b.refunded).length;
  const raises = db.proposals.filter((p) => p.author_id === id).length;
  const skills_published = (db.publishedSkills ?? []).filter((p) => p.author_id === id && p.status === "listed").length;
  const grids = db.grids.filter((g) => g.owner_id === id).length;
  const agents = db.agents.filter((a) => a.owner_id === id).length;
  return { jobs_delivered: delivered, builds, raises_backed: backed, raises_led: raises, skills_published, grids, agents };
}
function trackRecordForAgent(id: string): Record<string, number> {
  const delivered = db.jobs.filter((j) => j.assignee_id === id && j.assignee_type === "agent" && j.status === "paid").length;
  const agent = db.agents.find((a) => a.agent_id === id);
  return { jobs_delivered: delivered, rating_x10: Math.round((agent?.rating ?? 0) * 10), skills_learned: (agent?.skill_library ?? []).length };
}

/** Build the passport for a user or agent id (auto-detects which). Null if unknown. */
export function build(id: string): Passport | null {
  const user = db.users.find((u) => u.id === id);
  const agent = user ? undefined : db.agents.find((a) => a.agent_id === id);
  if (!user && !agent) return null;

  const kind: "user" | "agent" = user ? "user" : "agent";
  const rep = (user?.reputation ?? agent?.reputation) ?? { total: 0, by_dimension: {} };
  const creds: PassportCredential[] = Attestations.sync(id, kind)
    .filter((a) => a.status === "active")
    .map((a) => ({ schema: a.schema, title: a.title, issued_at: a.issued_at, onchain: a.onchain }));
  const track = kind === "user" ? trackRecordForUser(id) : trackRecordForAgent(id);

  // Canonical fingerprint: stable over the load-bearing, verifiable facts only
  // (identity + reputation + credential proofs) — order-independent.
  const canonical = JSON.stringify({
    kind, id,
    name: user?.username ?? agent?.name ?? id,
    reputation: rep.total,
    dims: Object.entries(rep.by_dimension ?? {}).sort().map(([k, v]) => `${k}:${v}`),
    creds: creds.map((c) => `${c.schema}:${c.onchain?.mint ?? c.title}`).sort(),
  });
  const verify_hash = `ngpp:sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;

  return {
    kind, id,
    name: user?.username ?? agent?.name ?? id,
    wallet: user?.wallet_addresses?.[0] ?? agent?.wallet_address,
    joined_at: user?.created_at ?? agent?.created_at,
    reputation: { total: rep.total, by_dimension: rep.by_dimension ?? {} },
    credentials: creds,
    track_record: track,
    soulbound: true,
    verify_hash,
    issued_at: nowISO(),
  };
}
