/**
 * The producers behind the x402-metered gateway resources, plus the shared
 * handler that gates any resource behind payment (real x402 in solana mode, the
 * mock proof in memory mode). One place to declare "what an agent gets once paid".
 */

import { NextResponse } from "next/server";
import { publicRequestUrl } from "../publicUrl";
import * as X402 from "./x402";
import * as Jobs from "./jobs";
import * as Markets from "./markets";
import * as Provenance from "./provenance";
import * as Users from "./users";
import * as Agents from "./agents";
import * as Attestations from "./attestations";
import type { Agent } from "../types";

/** Produce a metered resource's payload for a paid request. */
export async function produce(name: string, agent: Agent, request: Request): Promise<unknown> {
  const url = new URL(request.url);
  switch (name) {
    case "signals": {
      const open = Jobs.listJobs({ status: "open" });
      const top = [...open].sort((a, b) => b.reward_amount - a.reward_amount).slice(0, 5)
        .map((j) => ({ job_id: j.job_id, title: j.title, reward: j.reward_amount, skills: j.required_skills }));
      return { paid: true, signals: { open_jobs: open.length, top_paying_jobs: top } };
    }
    case "market_data": {
      const markets = Markets.listMarkets().map((m) => {
        const st = Markets.tradeStats(m.market_id);
        const prog = Markets.stageProgress(m);
        return {
          symbol: m.base_symbol, stage: m.stage, price: m.price,
          marketcap: prog.marketcap, cap_pct: prog.capPct,
          change: st.change, vol24h: st.volume, holders: m.holders ?? 0,
          book: Markets.orderBook(m.market_id, 5),
        };
      });
      return { paid: true, market_data: markets };
    }
    case "provenance": {
      const marketId = url.searchParams.get("market");
      const gridParam = url.searchParams.get("grid");
      const grids = gridParam
        ? [gridParam]
        : marketId
          ? [Markets.listMarkets().find((m) => m.market_id === marketId)?.grid_id].filter(Boolean) as string[]
          : Markets.listMarkets().slice(0, 8).map((m) => m.grid_id);
      return { paid: true, provenance: grids.map((g) => Provenance.provenanceFor(g)) };
    }
    case "discovery": {
      const builders = Users.listAll()
        .map((u) => ({
          id: u.id, username: u.username,
          reputation: Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0),
          credentials: Attestations.activeFor(u.id).length, skills: (u.skills ?? []).slice(0, 4),
        }))
        .filter((b) => b.reputation > 0 || b.credentials > 0)
        .sort((a, b) => b.reputation - a.reputation).slice(0, 20);
      const agents = Agents.listAgents()
        .map((a) => ({
          agent_id: a.agent_id, name: a.name, rating: a.rating ?? 0, trust_tier: a.trust_tier,
          verified_jobs: Agents.paidJobCount(a.agent_id), earnings: a.earnings ?? 0,
          capabilities: (a.capabilities ?? []).slice(0, 4), boosted: X402.isBoosted(a.agent_id),
        }))
        // boosted agents first (that's what they paid for), then by rating
        .sort((a, b) => Number(b.boosted) - Number(a.boosted) || b.rating - a.rating).slice(0, 20);
      return { paid: true, builders, agents };
    }
    case "boost": {
      const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      return { paid: true, boosted: true, agent: agent.agent_id, until, note: "Priority placement in agent discovery for 7 days." };
    }
    default:
      return { error: "unknown_resource" };
  }
}

/**
 * Serve a metered resource: pay-gate it, then produce it.
 *  - solana mode: 402 with real PaymentRequirements → verify+settle the X-PAYMENT.
 *  - memory mode: a mock proof (from POST /x402/pay) checked against the ledger.
 */
export async function serveMeteredResource(request: Request, agent: Agent, name: string): Promise<NextResponse> {
  if (!X402.isResource(name)) return NextResponse.json({ error: "unknown_resource" }, { status: 404 });
  const xPayment = request.headers.get("x-payment");
  // the public URL, not request.url — behind Cloud Run's proxy the latter is 0.0.0.0:8080
  const resourceUrl = publicRequestUrl(request);

  if (X402.active()) {
    if (!xPayment) {
      return NextResponse.json(await X402.challenge(name, resourceUrl, agent), { status: 402, headers: { "accept-payment": "x402" } });
    }
    const r = await X402.settleViaFacilitator(xPayment, name, resourceUrl, agent.agent_id);
    if (r.error) return NextResponse.json(await X402.challenge(name, resourceUrl, agent, r.error), { status: 402 });
    return NextResponse.json(await produce(name, agent, request), { headers: { "x-payment-response": r.paymentResponse ?? "" } });
  }

  if (!X402.verify(xPayment, name)) {
    return NextResponse.json(
      { error: "payment_required", accepts: [X402.quote(name, agent)] },
      { status: 402, headers: { "accept-payment": "x402" } },
    );
  }
  return NextResponse.json(await produce(name, agent, request));
}
