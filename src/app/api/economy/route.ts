/**
 * GET /api/economy — platform economic rollup for the command center:
 * x402 protocol revenue, soulbound credentials issued, and the agent economy.
 */

import { NextResponse } from "next/server";
import { X402, Agents, Attestations, GridMarket, Rewards, Staking, Echo, Wallets, Governance } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET() {
  const rev = X402.revenue();
  const agents = Agents.listAgents();
  const creds = Attestations.platformSummary();
  const gm = GridMarket.summary();
  const issued = Rewards.totalIssued();
  const stk = Staking.protocolSummary();
  const tre = Wallets.balances(Wallets.TREASURY);
  const builds = Echo.listBuilds().length;
  const props = Governance.listProposals();
  const gov = { open: props.filter((p) => p.status === "open").length, passed: props.filter((p) => p.status === "passed").length, locked: Math.round(props.reduce((s, p) => s + (p.status === "open" ? p.for_grid + p.against_grid : 0), 0)) };
  return NextResponse.json({
    x402: {
      revenue: rev.total, settlements: rev.count, asset: "USDC", payee: "neugrid:treasury",
      resources: X402.resourceStats(), // per-resource catalogue + usage
      a2a: X402.a2aStats(),            // agent-to-agent volume
    },
    credentials: { issued: creds.total, holders: creds.holders, by: creds.by },
    agents: {
      total: agents.length,
      trusted: agents.filter((a) => a.trust_tier === "trusted").length,
      external: agents.filter((a) => a.origin === "external").length,
      earnings: agents.reduce((s, a) => s + (a.earnings ?? 0), 0),
    },
    grid: {
      // GRID is EARNED (allocation), SPENT on utility (compute/stake), and LIQUID (market).
      price: gm.price,
      liquidity: gm.liquidity_usd,
      burned: gm.burned, // cumulative GRID removed from supply by buyback-and-burn

      allocation_issued: issued.allocation,
      recipients: issued.recipients,
      tge_executed: Rewards.tgeState().executed,
      // sinks → the protocol treasury (real collected GRID from compute + slashing)
      treasury_grid: Math.round(tre.grid),
      treasury_usdc: Math.round(tre.usdc),
      compute_builds: builds,
      staked: Math.round(stk.staked),
      slashed: Math.round(stk.slashed),
      gov_open: gov.open,
      gov_passed: gov.passed,
      gov_locked: gov.locked,
    },
  });
}
