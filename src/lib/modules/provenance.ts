/**
 * Provenance — the credibility story behind a market, assembled from existing
 * verified state. This is NeuGrid's thesis made visible at the point of trade:
 * WHERE a project came from (Grid/SubGrid + the Echo→Fund→milestones→audit
 * lineage) and WHO built it (the founder's reputation + soulbound credentials +
 * track record) + WHO backed it. Pure read-aggregation; no new state.
 */

import { db } from "../store";
import * as Genesis from "./genesis";
import * as Attestations from "./attestations";

function repOf(user_id: string): number {
  const u = db.users.find((x) => x.id === user_id);
  return Math.max(u?.pulse_score ?? 0, u?.reputation?.total ?? 0);
}

/** The one-line credibility chip for market CARDS (the /markets list) — founder +
 *  reputation + credential count + origin. Deliberately light: reads existing
 *  attestations only (no reconcile-on-read mints on a list endpoint). */
export function credibilityFor(grid_id: string) {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return null;
  const fid = grid.owner_id;
  const founder = db.users.find((u) => u.id === fid);
  if (!founder) return null;
  const credentials = Attestations.activeFor(fid).length;
  const audit = [...db.audits].reverse().find((a) => a.grid_id === grid_id);
  return {
    founder: { id: fid, username: founder.username, reputation: Math.round(repOf(fid)) },
    credentials,
    audit_passed: audit?.status === "passed",
    origin: grid.spawned_from?.origin ?? "direct", // proposal | product | direct
  };
}

export function provenanceFor(grid_id: string) {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return null;
  const fid = grid.owner_id;
  const founder = db.users.find((u) => u.id === fid);

  // Lineage: where this Grid came from (proposal raise / product) + the team.
  const sf = grid.spawned_from;
  const proposal = sf?.proposal_id ? Genesis.getProposal(sf.proposal_id) : undefined;
  const backings = proposal ? Genesis.backersFor(proposal.proposal_id) : [];
  const raised = proposal ? Genesis.raisedFor(proposal.proposal_id) : 0;
  const subgrid = sf?.subgrid_id ? db.subgrids.find((s) => s.subgrid_id === sf.subgrid_id) : undefined;

  // Delivery proof: milestones released + the security audit.
  const milestones = db.milestones.filter((m) => m.grid_id === grid_id);
  const released = milestones.filter((m) => m.status === "released").length;
  const audit = [...db.audits].reverse().find((a) => a.grid_id === grid_id);

  // The MVP build (proof-of-build) — from the proposal, else any build for this Grid.
  const build = (proposal?.mvp_ref && db.builds.find((b) => b.artifact?.artifact_id === proposal.mvp_ref?.artifact_id)) || db.builds.find((b) => b.grid_id === grid_id);

  // Founder credibility: soulbound credentials + the auto-generated track record.
  const creds = Attestations.sync(fid, "user").filter((a) => a.status === "active");
  const founderGridIds = new Set(db.grids.filter((g) => g.owner_id === fid).map((g) => g.grid_id));

  return {
    grid: { name: grid.name, slug: grid.slug, grid_type: grid.grid_type ?? "community", lifecycle_stage: grid.lifecycle_stage ?? null },
    subgrid: subgrid ? { id: subgrid.subgrid_id, name: subgrid.name } : null,
    origin: {
      kind: sf?.origin ?? "direct", // proposal | product | direct
      proposal: proposal ? { id: proposal.proposal_id, title: proposal.title, ask: proposal.ask_amount, raised, backers: backings.length, endorsements: proposal.endorsements?.length ?? 0 } : null,
      built_with_echo: !!build?.artifact?.built_with_echo,
    },
    founder: founder
      ? {
          id: founder.id,
          username: founder.username,
          bio: founder.bio ?? "",
          wallet: founder.wallet_addresses?.[0] ?? "",
          reputation: Math.max(founder.pulse_score ?? 0, founder.reputation?.total ?? 0),
          by_dimension: founder.reputation?.by_dimension ?? {},
          skills: founder.skills ?? [],
          credentials_count: creds.length,
          credentials: creds.map((c) => ({ schema: c.schema, title: c.title })),
          track_record: {
            builds: db.builds.filter((b) => b.owner_id === fid).length,
            jobs_done: db.jobs.filter((j) => j.assignee_id === fid && j.assignee_type !== "agent" && j.status === "paid").length,
            milestones_shipped: db.milestones.filter((m) => m.status === "released" && founderGridIds.has(m.grid_id)).length,
            projects_launched: db.markets.filter((mk) => founderGridIds.has(mk.grid_id)).length,
          },
        }
      : null,
    build: build ? { title: build.title, kind: build.artifact?.kind ?? "build", proof: build.artifact?.proof_of_build ?? null, stack: build.stack ?? [] } : null,
    milestones: { total: milestones.length, released },
    audit: audit ? { status: audit.status, reviewer: audit.reviewer_id ?? null } : null,
    backers: backings.slice(0, 8).map((b) => {
      const u = db.users.find((x) => x.id === b.backer_id);
      return { id: b.backer_id, username: u?.username ?? b.backer_id, amount: b.amount, reputation: repOf(b.backer_id) };
    }),
  };
}
