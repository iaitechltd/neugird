"use client";

/**
 * Trade terminal — stage-aware. The trading UI LEVELS UP as a project ascends:
 *   Alpha  = bonding-curve buy/sell (early access)
 *   Spot   = order-book terminal (limit + market)
 *   Futures= perp terminal (long/short, leverage, margin, liquidation)
 *
 * Adapted from the trading-terminal concept to ours: USDC quote · project (Grid)
 * identity · the **Ascension Arc** = real graduation progress · GRID stake-to-list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Stat, Mark, Tag, IconChart, IconActivity, IconBolt, IconCoins, IconArrowRight, IconShield, IconNetwork, IconCheck, IconLock, IconLayers, IconClose, IconUser } from "@/components/app/ui";
import { Candles, Gauge, Ring, Spark, Waterfall, Donut, type Candle } from "@/components/app/charts";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Decrypt } from "@/components/app/typefx";
import type { Market } from "@/lib/types";

type Trade = { side: "buy" | "sell"; base: number; quote: number; price: number; at: string; user_id?: string };
type Progress = { stage: string; next?: string; capTarget: number; marketcap: number; capPct: number; liquidity: number; liqFloor: number; liqOk: boolean };
type Grad = { ok: boolean; next?: string; reason?: string };
type StakeInfo = { stage: "spot" | "futures"; staked: number; required: number; pct: number; met: boolean; backers: number } | null;
type MyStake = { stake_id: string; amount: number; stage: string; locked_until: string; fees_earned: number; released: boolean; slashed: boolean; matured: boolean };
type Holder = { address: string; amount: number; pct: number; value: number };
type Stats = { buys: number; sells: number; txns: number; buyVol: number; sellVol: number; volume: number; high: number; low: number; change: number };
type GridInfo = { name: string; slug: string; description: string; category: string; pulse: number; glyph: string; accent: string | null } | null;
type Milestone = { title: string; status: string; amount: number; order: number };
type Level = { price: number; qty: number; total: number };
type Book = { asks: Level[]; bids: Level[]; price: number } | null;
type Pos = { position_id: string; side: "long" | "short"; size: number; leverage: number; entry_price: number; margin: number; liquidation_price: number; mark: number; upnl: number; funding_paid?: number; take_profit?: number; stop_loss?: number; trailing_stop_pct?: number; trail_anchor?: number };
type Funding = { rate: number; pays: "long" | "short" | "none"; long_oi: number; short_oi: number; interval_hours: number };
type Order = { order_id: string; side: "buy" | "sell"; price: number; qty: number; filled: number; status: string; kind?: string; pside?: "long" | "short"; collateral?: number; leverage?: number };
type Cred = { schema: string; title: string };
type Prov = {
  grid: { name: string; slug: string; grid_type: string; lifecycle_stage: string | null };
  subgrid: { id: string; name: string } | null;
  origin: { kind: string; proposal: { id: string; title: string; ask: number; raised: number; backers: number; endorsements: number } | null; built_with_echo: boolean; product?: { id: string; name: string } | null; deploy_slug?: string | null };
  founder: { id: string; username: string; bio: string; wallet: string; reputation: number; by_dimension: Record<string, number>; skills: string[]; credentials_count: number; credentials: Cred[]; track_record: { builds: number; jobs_done: number; milestones_shipped: number; projects_launched: number } } | null;
  build: { title: string; kind: string; proof: string | null; stack: string[] } | null;
  milestones: { total: number; released: number };
  audit: { status: string; reviewer: string | null } | null;
  backers: { id: string; username: string; amount: number; reputation: number }[];
} | null;
type Data =
  | { market: Market & { grid_name?: string; marketcap?: number }; grid: GridInfo; trades: Trade[]; holders: Holder[]; holder_count: number; stats: Stats; holding: number; allocation?: { total: number; vested: number; claimed: number; claimable: number; vest_days: number; upfront_bps: number } | null; founder_allocation?: { total: number; vested: number; claimed: number; claimable: number; vest_days: number; upfront_bps: number } | null; wallet: { usdc: number; grid: number }; progress: Progress; graduation: Grad; stake: StakeInfo; roadmap: Milestone[]; orderBook: Book; orders: Order[]; positions: Pos[]; maxLeverage: number; funding: Funding; provenance: Prov; my_stakes: MyStake[]; staker_fees: number; can_flag: boolean; flagged: boolean; fraud_flags?: number; fraud_quorum?: number }
  | null
  | "missing";

const STAGE_ACCENT: Record<string, "neon" | "cyan" | "amber"> = { alpha: "amber", spot: "neon", futures: "cyan" };
const STAGE_ORDER = ["alpha", "spot", "futures"];
const TF = ["15m", "1H", "4H", "1D"];
const LEV = [2, 5, 10];
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n < 1 ? n.toFixed(4) : Math.round(n).toLocaleString()}`);
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(n < 1 ? 3 : 0));
const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a);

/* Synthetic order book (AMM depth) beside the chart — toggled open/closed. */
function OrderBook({ book, onClose }: { book: Book; onClose: () => void }) {
  if (!book) return null;
  const max = Math.max(...[...book.asks, ...book.bids].map((l) => l.total), 1);
  const Row = ({ l, up }: { l: Level; up: boolean }) => (
    <div className="relative flex justify-between px-1.5 py-[1.5px] text-[9.5px] tnum">
      <span className="absolute inset-y-0 right-0" style={{ width: `${(l.total / max) * 100}%`, background: up ? "rgba(0,255,0,0.10)" : "rgba(255,77,94,0.12)" }} />
      <span className={`relative ${up ? "text-neon" : "text-danger"}`}>{l.price.toFixed(4)}</span>
      <span className="relative text-ink-dim">{compact(l.qty)}</span>
    </div>
  );
  return (
    <div className="w-[152px] shrink-0 self-stretch border-l border-line pl-1.5">
      <div className="mb-0.5 flex items-center justify-between px-1"><span className="text-[8.5px] uppercase tracking-wide text-ink-faint" title="Depth derived from the AMM curve — resting limit orders execute against the pool, not each other">Order book · AMM depth</span><button onClick={onClose} className="text-ink-faint transition hover:text-neon" aria-label="Close order book"><IconClose className="h-3 w-3" /></button></div>
      {book.asks.map((l, i) => <Row key={`a${i}`} l={l} up={false} />)}
      <div className="my-0.5 px-1.5 text-center text-[12px] font-bold text-neon tnum">${book.price.toFixed(4)}</div>
      {book.bids.map((l, i) => <Row key={`b${i}`} l={l} up />)}
    </div>
  );
}

type TickerItem = { id: string; symbol: string; price: number; change: number; liquidity: number; volume: number };

/* Top marquee — scrolling live prices across every market (different projects). */
function PriceTicker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const cells = (prefix: string) =>
    items.map((t, i) => (
      <Link key={prefix + i} href={`/market/${t.id}`} className="flex shrink-0 items-center gap-1.5 px-4 text-[11px] transition hover:text-neon">
        <span className="text-ink-faint">#{i + 1}</span>
        <span className="font-semibold text-ink">{t.symbol}</span>
        <span className="text-ink-dim">${t.price < 1 ? t.price.toFixed(4) : t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className={t.change >= 0 ? "text-neon" : "text-danger"}>{t.change >= 0 ? "▲" : "▼"}{Math.abs(t.change).toFixed(2)}%</span>
      </Link>
    ));
  return (
    <div className="relative shrink-0 overflow-hidden border-b border-line bg-black/40">
      <div className="ng-marquee flex w-max items-center py-1.5">{cells("a")}{cells("b")}</div>
    </div>
  );
}

/* Static footer — protocol / aggregate info (not moving). */
function TerminalFooter({ items }: { items: TickerItem[] }) {
  const liq = items.reduce((a, t) => a + t.liquidity, 0);
  const vol = items.reduce((a, t) => a + t.volume, 0);
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-x-5 overflow-x-auto border-t border-line bg-black/70 px-4 py-1.5 text-[10px] text-ink-faint backdrop-blur">
      <span className="flex items-center gap-1.5 text-neon"><span className="ng-led" />Live</span>
      <span className="hidden sm:inline">Solana · USDC-quoted · non-custodial</span>
      <span className="ml-auto">Markets <span className="text-ink">{items.length}</span></span>
      <span>Liquidity <span className="text-ink">{money(liq)}</span></span>
      <span>24h Vol <span className="text-ink">{money(vol)}</span></span>
      <span className="hidden text-neon/70 lg:inline">Markets are earned, not bought.</span>
    </div>
  );
}

type ChatMsg = { message_id: string; user_id: string; username: string; reputation: number; role: string; text: string; likes: number; liked: boolean; ago: string };
const ROLE_CHIP: Record<string, string> = { founder: "bg-neon/15 text-neon", backer: "bg-cyan/15 text-cyan", holder: "bg-neon/10 text-neon", member: "bg-neon/[0.06] text-ink-dim", guest: "bg-neon/[0.04] text-ink-faint" };

/* Per-Grid community thread — reputation-tagged messages + composer. */
function ChatPanel({ messages, onSend, onLike, busy }: { messages: ChatMsg[]; onSend: (t: string) => Promise<boolean>; onLike: (id: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <div>
      <p className="mb-2.5 text-[10px] leading-relaxed text-ink-faint">Community thread for this project — messages are reputation-tagged, so credible voices (founder · backer · holder) stand out.</p>
      <div className="space-y-3">
        {messages.length === 0 ? <p className="text-[11px] text-ink-faint">No messages yet — start the conversation.</p> : messages.map((mm) => (
          <div key={mm.message_id} className="text-[11px]">
            <div className="flex items-center gap-1.5">
              <MatrixAvatar seed={mm.username} size={20} />
              <span className="font-semibold text-ink">{mm.username}</span>
              <span className={`rounded px-1 py-px text-[8px] uppercase tracking-wide ${ROLE_CHIP[mm.role] ?? ROLE_CHIP.guest}`}>{mm.role}</span>
              <span className="text-[9px] text-ink-faint">{Math.round(mm.reputation)} rep · {mm.ago}</span>
              <button onClick={() => onLike(mm.message_id)} className={`ml-auto flex items-center gap-0.5 text-[9px] transition hover:text-neon ${mm.liked ? "text-neon" : "text-ink-faint"}`}>▲ {mm.likes || ""}</button>
            </div>
            <p className="mt-1 break-words pl-[26px] leading-relaxed text-ink-dim">{mm.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={async (e) => { e.preventDefault(); const t = text.trim(); if (t) { const ok = await onSend(t); if (ok) setText(""); } }} className="sticky bottom-0 mt-3 flex gap-1.5 border-t border-line bg-black/85 pt-2 backdrop-blur">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Share what you think…" className="ng-input !py-1.5 text-xs" />
        <button type="submit" disabled={busy || !text.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">Send</button>
      </form>
    </div>
  );
}

/* ----------------------------- Agent Mode ----------------------------- */
type AgentInfo = { agent_id: string; name: string; origin: string; trust_tier: string; rating: number; trading_rating: number | null };
type AgentAct = { action_id: string; kind: string; rationale: string; amount?: number; price?: number; pnl?: number; ok: boolean; detail?: string; risk_grade?: "low" | "medium" | "high" | "critical"; sim?: { price_impact_pct: number; budget_after_pct: number; leverage_ratio?: number }; at: string; ago: string };

const RISK_C: Record<string, string> = { low: "text-neon/70", medium: "text-cyan", high: "text-amber", critical: "text-danger" };
type AgentPos = { position_id: string; side: string; size: number; leverage: number; entry_price: number; margin: number; liquidation_price: number; mark: number; upnl: number };
type MandateView = {
  mandate_id: string; agent_id: string; strategy: string; status: string;
  budget_usdc: number; max_position_usd: number; max_leverage: number; allowed_stages: string[];
  stop_loss_pct: number; daily_loss_cap: number; expiry: string;
  deployed_usdc: number; position_base: number; realized_pnl: number; trades_count: number;
  remaining_budget: number; consumed_usdc: number; budget_used_pct: number; position_value: number;
  unrealized_pnl: number; realized_today: number; expires_in_hours: number;
};
type AgentState = { active: boolean; mandate: MandateView | null; agent: AgentInfo | null; positions?: AgentPos[]; actions: AgentAct[]; myAgents: AgentInfo[]; stage: string | null; maxLeverage: number } | null;
type ArmInput = { agent_id: string; strategy: string; budget_usdc: number; max_position_usd?: number; max_leverage: number; stop_loss_pct: number; daily_loss_cap?: number; duration_hours: number; allowed_stages: string[] };

const ACT_KIND: Record<string, { c: string; label: string }> = {
  buy: { c: "text-neon", label: "BUY" }, sell: { c: "text-danger", label: "SELL" },
  open_long: { c: "text-neon", label: "LONG" }, open_short: { c: "text-danger", label: "SHORT" },
  close: { c: "text-cyan", label: "CLOSE" }, hold: { c: "text-ink-faint", label: "HOLD" }, stop: { c: "text-amber", label: "STOP" },
};
const STRATS: { k: string; name: string; sub: string }[] = [
  { k: "dca", name: "DCA", sub: "deploy in clips, accumulate" },
  { k: "momentum", name: "Momentum", sub: "buy strength, trim weakness" },
  { k: "hedge", name: "Hedge", sub: "leveraged perp (futures)" },
  { k: "external", name: "External", sub: "agent runs its own model (SDK/MCP) — needs an external agent + its gateway key" },
];
const usd2 = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const pnlClass = (n: number) => (n > 0 ? "text-neon" : n < 0 ? "text-danger" : "text-ink-dim");

/**
 * Agent Mode — authorize an agent to trade this market autonomously under a
 * scoped mandate (budget / max position / leverage / stop-loss / kill-switch).
 * The agent acts on YOUR wallet within those limits (non-custodial, scoped).
 */
function AgentPanel({ state, stage, maxLeverage, onArm, onStop, busy }: { state: AgentState; stage: string; maxLeverage: number; onArm: (f: ArmInput) => void; onStop: () => void; busy: boolean }) {
  const [strategy, setStrategy] = useState("dca");
  const [agentId, setAgentId] = useState("");
  const [budget, setBudget] = useState("1000");
  const [maxPos, setMaxPos] = useState("");
  const [maxLev, setMaxLev] = useState(3);
  const [stopLoss, setStopLoss] = useState("25");
  const [dailyCap, setDailyCap] = useState("");
  const [dur, setDur] = useState("24");

  if (!state) return <p className="text-[11px] text-ink-faint">Loading…</p>;

  /* ---- ACTIVE: live agent dashboard ---- */
  if (state.active && state.mandate) {
    const md = state.mandate;
    const ag = state.agent;
    const positions = state.positions ?? [];
    return (
      <div>
        <div className="flex items-center gap-2 rounded border border-neon/30 bg-neon/[0.06] px-2.5 py-2">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-neon" /></span>
          <MatrixAvatar seed={ag?.name ?? "agent"} size={22} />
          <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-neon">{ag?.name ?? "Agent"} is trading</div><div className="text-[9px] uppercase tracking-wide text-ink-faint">{md.strategy} · {ag?.trust_tier}{ag?.trading_rating != null ? ` · ★ ${ag.trading_rating}` : ""}</div></div>
          <button onClick={onStop} disabled={busy} className="ng-btn ng-btn-danger ng-btn--sm shrink-0 disabled:opacity-40">■ Stop</button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Ring percent={md.budget_used_pct} value={`${md.budget_used_pct}%`} label="deployed" size={78} stroke={5} />
          <div className="flex-1 text-[11px]">
            <div className="ng-row !py-0.5"><span className="ng-row__k">Budget</span><span className="ng-row__v font-normal">{money(md.consumed_usdc)} / {money(md.budget_usdc)}</span></div>
            <div className="ng-row !py-0.5"><span className="ng-row__k">Realized</span><span className={`ng-row__v font-normal ${pnlClass(md.realized_pnl)}`}>{usd2(md.realized_pnl)}</span></div>
            <div className="ng-row !py-0.5"><span className="ng-row__k">Unrealized</span><span className={`ng-row__v font-normal ${pnlClass(md.unrealized_pnl)}`}>{usd2(md.unrealized_pnl)}</span></div>
            <div className="ng-row !py-0.5"><span className="ng-row__k">Trades</span><span className="ng-row__v font-normal">{md.trades_count}</span></div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded border border-line p-2 text-[10px] text-ink-dim">
          <span>Max pos <span className="text-ink">{money(md.max_position_usd)}</span></span>
          <span>Max lev <span className="text-ink">{md.max_leverage}×</span></span>
          <span>Stop-loss <span className="text-ink">{Math.round(md.stop_loss_pct * 100)}%</span></span>
          <span>Daily cap <span className="text-ink">{money(md.daily_loss_cap)}</span></span>
          <span>Stages <span className="text-ink capitalize">{md.allowed_stages.join("/")}</span></span>
          <span>Expires <span className="text-ink">{md.expires_in_hours < 1 ? `${Math.round(md.expires_in_hours * 60)}m` : `${Math.round(md.expires_in_hours)}h`}</span></span>
        </div>

        {positions.length > 0 && (
          <div className="mt-3">
            <div className="ng-label mb-1 !text-ink-dim">Open positions</div>
            {positions.map((p) => (
              <div key={p.position_id} className="mb-1 flex items-center justify-between rounded border border-line px-2 py-1 text-[10px]">
                <span className={p.side === "long" ? "text-neon" : "text-danger"}>{p.side.toUpperCase()} {p.leverage}×</span>
                <span className="text-ink-dim">{compact(p.size)} @ ${p.entry_price.toFixed(4)}</span>
                <span className={pnlClass(p.upnl)}>{usd2(p.upnl)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-line pt-2">
          <div className="ng-label mb-1.5 flex items-center gap-1.5 !text-ink-dim"><IconActivity className="h-3.5 w-3.5" />Activity</div>
          <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
            {state.actions.length === 0 ? <p className="text-[11px] text-ink-faint">Warming up…</p> : state.actions.map((a) => {
              const k = ACT_KIND[a.kind] ?? ACT_KIND.hold;
              return (
                <div key={a.action_id} className={`text-[10.5px] ${a.ok ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 font-semibold ${k.c}`}>{k.label}</span>
                    {a.detail === "risk_critical" ? <span className="shrink-0 rounded bg-danger/15 px-1 text-[8px] uppercase text-danger">risk-blocked</span> : !a.ok && <span className="shrink-0 rounded bg-amber/15 px-1 text-[8px] uppercase text-amber">blocked</span>}
                    {a.risk_grade && <span className={`shrink-0 text-[8px] uppercase ${RISK_C[a.risk_grade]}`} title={a.sim ? `impact ${(a.sim.price_impact_pct * 100).toFixed(1)}% · budget ${(a.sim.budget_after_pct * 100).toFixed(0)}%` : undefined}>{a.risk_grade}</span>}
                    {a.pnl != null && <span className={`shrink-0 ${pnlClass(a.pnl)}`}>{usd2(a.pnl)}</span>}
                    <span className="ml-auto shrink-0 text-[9px] text-ink-faint">{a.ago}</span>
                  </div>
                  <p className="leading-snug text-ink-dim">{a.rationale}{a.detail && !a.ok ? ` (${a.detail === "risk_critical" ? "critical risk — auto-blocked" : a.detail})` : ""}{a.sim && a.ok && a.sim.price_impact_pct >= 0.02 ? ` · ${(a.sim.price_impact_pct * 100).toFixed(1)}% impact` : ""}</p>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-ink-faint">Non-custodial: the agent acts only on your wallet, only within this mandate. Stop anytime — the kill-switch halts it instantly.</p>
      </div>
    );
  }

  /* ---- INACTIVE: arm a mandate ---- */
  const agents = state.myAgents ?? [];
  if (agents.length === 0) {
    return (
      <div className="text-[11px] text-ink-dim">
        <p className="leading-relaxed">Agent Mode lets one of your agents trade {stage} for you under a bounded mandate. You don&apos;t have an agent yet.</p>
        <Link href="/agents" className="ng-btn ng-btn-primary ng-btn--block mt-3">Create an agent →</Link>
      </div>
    );
  }
  const selAgent = agentId || agents[0].agent_id;
  const arm = () => onArm({
    agent_id: selAgent, strategy,
    budget_usdc: Number(budget) || 0,
    max_position_usd: maxPos ? Number(maxPos) : undefined,
    max_leverage: strategy === "hedge" || strategy === "external" ? maxLev : 1,
    stop_loss_pct: (Number(stopLoss) || 25) / 100,
    daily_loss_cap: dailyCap ? Number(dailyCap) : undefined,
    duration_hours: Number(dur) || 24,
    allowed_stages: [stage],
  });
  return (
    <div className="text-[11px]">
      <p className="mb-2.5 leading-relaxed text-ink-faint">Authorize an agent to trade <span className="text-ink-dim capitalize">{stage}</span> on your behalf — strictly within the mandate below. It acts on your wallet; you can kill it anytime.</p>

      <label className="ng-label !text-ink-dim">Agent</label>
      <select value={selAgent} onChange={(e) => setAgentId(e.target.value)} className="ng-input mt-1 !py-1.5 text-xs">
        {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.name} · {a.trust_tier}{a.trading_rating != null ? ` · ★${a.trading_rating}` : ""}</option>)}
      </select>

      <div className="ng-label mt-3 !text-ink-dim">Strategy</div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {STRATS.map((s) => <button key={s.k} onClick={() => setStrategy(s.k)} className={`rounded border px-1 py-1.5 text-[10px] transition ${strategy === s.k ? "border-neon/50 bg-neon/10 text-neon" : "border-line text-ink-dim hover:text-neon"}`}>{s.name}</button>)}
      </div>
      <p className="mt-1 text-[9.5px] text-ink-faint">{STRATS.find((s) => s.k === strategy)?.sub}{strategy === "hedge" && stage !== "futures" ? " — idles until this market reaches futures" : ""}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><label className="ng-label !text-ink-dim">Budget (USDC)</label><input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="ng-input mt-1 !py-1.5 text-xs" /></div>
        <div><label className="ng-label !text-ink-dim">Max position</label><input value={maxPos} onChange={(e) => setMaxPos(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="auto" className="ng-input mt-1 !py-1.5 text-xs" /></div>
      </div>

      {(strategy === "hedge" || strategy === "external") && (
        <div className="mt-3"><label className="ng-label !text-ink-dim">Max leverage</label><div className="mt-1 grid grid-cols-5 gap-1">{[1, 2, 3, 5, maxLeverage].filter((v, i, a) => a.indexOf(v) === i).map((l) => <button key={l} onClick={() => setMaxLev(l)} className={`rounded border py-1 text-[10px] transition ${maxLev === l ? "border-neon/50 bg-neon/10 text-neon" : "border-line text-ink-dim hover:text-neon"}`}>{l}×</button>)}</div></div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><label className="ng-label !text-ink-dim">Stop-loss %</label><input value={stopLoss} onChange={(e) => setStopLoss(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="ng-input mt-1 !py-1.5 text-xs" /></div>
        <div><label className="ng-label !text-ink-dim">Daily-loss cap</label><input value={dailyCap} onChange={(e) => setDailyCap(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="auto" className="ng-input mt-1 !py-1.5 text-xs" /></div>
      </div>

      <div className="mt-3"><label className="ng-label !text-ink-dim">Duration (hours)</label><input value={dur} onChange={(e) => setDur(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="ng-input mt-1 !py-1.5 text-xs" /></div>

      <button onClick={arm} disabled={busy || !(Number(budget) > 0)} className="ng-btn ng-btn-primary ng-btn--block mt-4 disabled:opacity-40"><IconBolt className="h-3.5 w-3.5" /> Arm Agent Mode</button>
      <p className="mt-2 text-[9.5px] leading-relaxed text-ink-faint">Server-side guardrails enforce every limit before any trade. Non-custodial — the mandate is scoped consent on your own funds.</p>
    </div>
  );
}

export default function MarketTerminal() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [data, setData] = useState<Data>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [ot, setOt] = useState<"market" | "limit">("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [lev, setLev] = useState(5);
  const [tpIn, setTpIn] = useState("");
  const [slIn, setSlIn] = useState("");
  const [trailIn, setTrailIn] = useState("");
  const [tf, setTf] = useState("1H");
  const [tab, setTab] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const [rPanel, setRPanel] = useState<"trade" | "agent" | "chat">("trade");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [agentState, setAgentState] = useState<AgentState>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartW, setChartW] = useState(760);
  const [chartH, setChartH] = useState(360);
  const [allMarkets, setAllMarkets] = useState<TickerItem[]>([]);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/markets/${id}`).then((x) => (x.ok ? x.json() : Promise.reject(new Error("404")))).then((r) => { if (alive) setData(r); }).catch(() => { if (alive) setData("missing"); });
    return () => { alive = false; };
  }, [id, tick]);

  useEffect(() => {
    let alive = true;
    fetch("/api/markets").then((r) => r.json()).then((j) => { if (alive) setAllMarkets((j.markets ?? []).map((x: { market_id: string; base_symbol: string; price?: number; change?: number; liquidity_usd?: number; volume?: number; vol24h?: number }) => ({ id: x.market_id, symbol: x.base_symbol, price: x.price ?? 0, change: x.change ?? 0, liquidity: x.liquidity_usd ?? 0, volume: x.vol24h ?? x.volume ?? 0 }))); }).catch(() => {});
    return () => { alive = false; };
  }, [tick]);

  // ONE SSE stream per open terminal replaces the 4s chat poll: `chat` events
  // trigger a refetch of the shaped thread (only while the Chat tab is open —
  // tracked via ref so the stream survives tab switches), `price` events keep
  // the marquee honest between full refreshes. Stream error → 4s poll fallback.
  const rPanelRef = useRef(rPanel);
  useEffect(() => { rPanelRef.current = rPanel; }, [rPanel]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let iv: ReturnType<typeof setInterval> | null = null;
    const loadChat = () => fetch(`/api/markets/${id}/chat`).then((r) => r.json()).then((j) => { if (alive) setChatMsgs(j.messages ?? []); }).catch(() => {});
    const es = new EventSource(`/api/markets/${id}/stream`);
    es.addEventListener("chat", () => { if (rPanelRef.current === "chat") loadChat(); });
    es.addEventListener("price", (e) => {
      try {
        const { price } = JSON.parse((e as MessageEvent).data) as { price: number };
        if (alive) setAllMarkets((prev) => prev.map((t) => (t.id === id ? { ...t, price } : t)));
      } catch { /* malformed frame — ignore */ }
    });
    es.onerror = () => { es.close(); if (alive && !iv) iv = setInterval(() => { if (rPanelRef.current === "chat") loadChat(); }, 4000); };
    return () => { alive = false; es.close(); if (iv) clearInterval(iv); };
  }, [id]);

  // Initial thread load when the Chat tab opens (SSE only signals CHANGES).
  useEffect(() => {
    if (rPanel !== "chat" || !id) return;
    let alive = true;
    fetch(`/api/markets/${id}/chat`).then((r) => r.json()).then((j) => { if (alive) setChatMsgs(j.messages ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [rPanel, id, tick]);

  // Agent Mode: load the mandate state (so the "agent active" indicator + feed
  // are live on any tab). Refreshes on every `tick` bump.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/markets/${id}/agent`).then((r) => r.json()).then((j) => { if (alive) setAgentState(j); }).catch(() => {});
    return () => { alive = false; };
  }, [id, tick]);

  // The runner: while a mandate is active, advance it every ~6.5s (past the
  // server rate-limit). This drives autonomous trading while the terminal is
  // open; the same tick endpoint is the seam for a server-side scheduler (24/7).
  const agentActive = agentState?.active ?? false;
  useEffect(() => {
    if (!id || !agentActive) return;
    let alive = true;
    const iv = setInterval(() => {
      fetch(`/api/markets/${id}/agent/tick`, { method: "POST" }).then((r) => r.json()).then((j) => {
        if (!alive) return;
        if (j.state) setAgentState(j.state);
        if (j.action?.ok && j.action.kind !== "hold") setTick((t) => t + 1); // refresh wallet/holdings/chart
      }).catch(() => {});
    }, 6500);
    return () => { alive = false; clearInterval(iv); };
  }, [id, agentActive]);

  async function act(url: string, body: object, msg?: string, errMap?: Record<string, string>): Promise<boolean> {
    if (busy) return false; setBusy(true);
    let ok = false;
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j?.error); if (msg) notify(msg); window.dispatchEvent(new Event("neugrid:refresh-me")); setTick((t) => t + 1); ok = true; }
    catch (e) { const code = e instanceof Error && e.message ? e.message : "Failed"; notify(errMap?.[code] ?? code); }
    setBusy(false);
    return ok;
  }
  const tradeMkt = (s: "buy" | "sell", amt: number, msg: string): Promise<boolean> => amt > 0 ? act(`/api/markets/${id}/trade`, { side: s, amount: amt }, msg) : Promise.resolve(false);
  const CHAT_ERR: Record<string, string> = {
    reputation_gate: "Posting here needs 25+ reputation — or a stake in this project (hold, back, or join)",
    rate_limited: "Slow down — one message every 5 seconds",
    hourly_cap: "Hourly message cap reached — back shortly",
  };
  const sendChat = (t: string) => act(`/api/markets/${id}/chat`, { text: t }, undefined, CHAT_ERR);
  const likeChat = (mid: string) => act(`/api/markets/${id}/chat`, { action: "like", message_id: mid });
  const flagFraud = () => { if (window.confirm("Report this market as fraudulent? Your report counts toward the Verifier quorum — at quorum, trading HALTS and every listing stake is SLASHED (vouchers forfeit their locked GRID). This can't be undone.")) act(`/api/markets/${id}/slash`, {}, "Fraud report registered"); };

  async function armAgent(f: ArmInput) {
    if (busy) return; setBusy(true);
    try { const r = await fetch(`/api/markets/${id}/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); const j = await r.json(); if (!r.ok) throw new Error(j?.error); setAgentState(j); notify("Agent Mode armed"); setTick((t) => t + 1); }
    catch (e) { notify(e instanceof Error && e.message ? e.message : "Failed"); }
    setBusy(false);
  }
  async function stopAgent() {
    if (busy) return; setBusy(true);
    try { const r = await fetch(`/api/markets/${id}/agent/stop`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j?.error); setAgentState(j.state); notify("Agent stopped"); setTick((t) => t + 1); }
    catch (e) { notify(e instanceof Error && e.message ? e.message : "Failed"); }
    setBusy(false);
  }

  const d = data && data !== "missing" ? data : null;
  const m = d?.market;
  const prog = d?.progress;
  const st = d?.stats;
  const stage = m?.stage ?? "alpha";
  const candleN = Math.max(40, Math.min(220, Math.round(chartW / 9))); // width-driven → constant candle width across timeframes + panel states
  // Real OHLC, aggregated from the trade history. Refetches on timeframe / width
  // change + on every `tick` (new trades, incl. the agent's) so the chart is live.
  const [candles, setCandles] = useState<Candle[]>([]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/markets/${id}/candles?tf=${tf}&n=${candleN}`).then((r) => r.json()).then((j) => { if (alive) setCandles(j.candles ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [id, tf, candleN, tick]);
  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) { setChartW(Math.round(r.width)); setChartH(Math.round(r.height)); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [m?.market_id]);
  const posValue = d ? (d.holding ?? 0) * (m?.price ?? 0) : 0;

  const TABS = useMemo(() => [...(stage === "futures" ? ["Positions"] : []), ...(stage !== "alpha" ? ["Open Orders"] : []), "Provenance", "Tnx", "Holders", "Traders", "My Position", "Roadmap"], [stage]);
  const activeTab = tab && TABS.includes(tab) ? tab : TABS[0];

  const traders = useMemo(() => {
    if (!d) return [] as { user: string; vol: number; n: number }[];
    const by = new Map<string, { user: string; vol: number; n: number }>();
    for (const t of d.trades) { const u = t.user_id ?? "?"; const e = by.get(u) ?? { user: u, vol: 0, n: 0 }; e.vol += t.quote; e.n += 1; by.set(u, e); }
    return [...by.values()].sort((a, b) => b.vol - a.vol).slice(0, 12);
  }, [d]);

  // perp preview
  const collateral = Number(amount) || 0;
  const perpSize = m && m.price ? (collateral * lev) / m.price : 0;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Trade" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <PriceTicker items={allMarkets} />
      <div className="flex flex-col gap-3 px-3 py-3 pb-9 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — identity + project */}
        <OrbPanel side="left" label="Market" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[280px] xl:w-[300px]">
          <Panel scroll title="MARKET" icon={<IconChart className="h-4 w-4" />} bodyClass="p-3.5">
            {!m ? <p className="text-xs text-ink-dim">{data === "missing" ? "Market not found." : "Loading…"}</p> : (
              <>
                <div className="flex items-center gap-2"><span className="grid h-11 w-11 place-items-center rounded-lg text-base font-bold" style={{ color: d.grid?.accent ?? "var(--ng-neon)", background: "radial-gradient(circle, rgba(0,255,0,0.14), rgba(0,255,0,0.03))" }}>{d.grid?.glyph ?? m.base_symbol.slice(0, 2)}</span><div className="min-w-0"><div className="ng-title truncate text-base font-bold text-neon">{m.base_symbol}</div><div className="truncate text-[10px] text-ink-faint">{m.grid_name}</div></div></div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Link href={`/grid/${d.grid?.slug ?? m.grid_id}`} className="ng-btn ng-btn--sm !text-[10px]"><IconNetwork className="h-3 w-3" />Grid</Link>
                  <span className="ng-btn ng-btn--sm !text-[10px] opacity-60">Site</span>
                  <span className="ng-btn ng-btn--sm !text-[10px] opacity-60">X</span>
                </div>
                {/* price headline — the number you came for, big, with its heartbeat */}
                <div className="mt-3 border-t border-line pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[24px] font-bold leading-none text-neon tnum">${(m.price ?? 0).toFixed(5)}</span>
                    <span className={`text-[12px] font-bold tnum ${(st?.change ?? 0) >= 0 ? "text-neon" : "text-danger"}`}>{(st?.change ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(st?.change ?? 0).toFixed(2)}%</span>
                  </div>
                  {candles.length > 1 && (
                    <div className="mt-2"><Spark data={candles.slice(-40).map((c) => c.c)} up={(st?.change ?? 0) >= 0} gid={`mkt-${id}`} w={240} h={30} /></div>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[9px] text-ink-faint"><Mark plain accent={STAGE_ACCENT[stage]} className="!text-[9px]">{stage}</Mark><span>· mark, live · last 40 bars</span></div>
                </div>
                {/* vitals — open type, no boxes */}
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
                  {([["Mkt cap", money(m.marketcap ?? 0)], ["Liquidity", money(prog?.liquidity ?? 0)], ["Holders", (d.holder_count ?? 0).toLocaleString()], ["24h Vol", money(st?.volume ?? 0)]] as [string, string][]).map(([k, v]) => (
                    <div key={k}><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">{k}</div><div className="mt-0.5 text-[16px] font-bold leading-none text-ink tnum">{v}</div></div>
                  ))}
                </div>
                {/* depth — how much of the cap is actually backed by liquidity */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[9px] text-ink-faint"><span>Depth · liquidity / cap</span><span className="text-ink-dim tnum">{(m.marketcap ?? 0) > 0 ? ((prog?.liquidity ?? 0) / (m.marketcap ?? 1) * 100).toFixed(1) : "0"}%</span></div>
                  <div className="mt-1 h-[5px] bg-neon/10"><div className="h-full bg-cyan/80" style={{ width: `${Math.min(100, (m.marketcap ?? 0) > 0 ? ((prog?.liquidity ?? 0) / (m.marketcap ?? 1)) * 100 : 0)}%` }} /></div>
                </div>
                <div className="mt-3 flex items-baseline justify-between"><span className="text-[8.5px] uppercase tracking-wide text-ink-faint">Pulse</span><span className="text-[16px] font-bold leading-none text-neon tnum">{(d.grid?.pulse ?? 0).toLocaleString()}</span></div>
                {d.provenance?.founder && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="ng-label mb-2 !text-ink-dim">Founder · provenance</div>
                    <Link href={`/talent/${d.provenance.founder.id}`} className="group flex items-center gap-2.5">
                      <MatrixAvatar seed={d.provenance.founder.username} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-neon group-hover:underline">{d.provenance.founder.username}</div>
                        <div className="flex items-center gap-2 text-[10px] text-ink-dim"><span className="flex items-center gap-0.5"><IconActivity className="h-3 w-3 text-neon" />{Math.round(d.provenance.founder.reputation).toLocaleString()} rep</span><span className="flex items-center gap-0.5"><IconShield className="h-3 w-3" />{d.provenance.founder.credentials_count} creds</span></div>
                      </div>
                    </Link>
                    <div className="mt-2 text-[10px] leading-relaxed text-ink-faint">From <Link href={`/grid/${d.provenance.grid.slug}`} className="text-ink-dim transition hover:text-neon">{d.provenance.grid.name}</Link>{d.provenance.subgrid ? ` · team ${d.provenance.subgrid.name}` : ""}{d.provenance.origin.proposal ? <> · <Link href={`/genesis/${d.provenance.origin.proposal.id}`} className="text-ink-dim transition hover:text-neon">funded on Fund</Link></> : ""}{d.provenance.origin.product ? <> · <Link href={`/gridx/${d.provenance.origin.product.id}`} className="text-ink-dim transition hover:text-neon">the product</Link></> : ""}{d.provenance.origin.deploy_slug ? <> · <Link href={`/d/${d.provenance.origin.deploy_slug}`} className="text-ink-dim transition hover:text-neon">live app ↗</Link></> : ""}. <button onClick={() => setTab("Provenance")} className="text-neon transition hover:underline">See provenance →</button></div>
                  </div>
                )}
                <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Markets are earned: {m.base_symbol} reached Trade only after the project delivered + passed audit.</p>
                {d.flagged ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded border border-danger/30 bg-danger/[0.06] px-2.5 py-1.5 text-[10px] text-danger"><IconShield className="h-3.5 w-3.5 shrink-0" />Flagged fraudulent — halted, stakes slashed.</div>
                ) : d.can_flag ? (
                  <button onClick={flagFraud} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded border border-danger/25 px-2.5 py-1.5 text-[10px] text-danger/80 transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"><IconShield className="h-3.5 w-3.5" /> Flag fraud ({d.fraud_flags ?? 0}/{d.fraud_quorum ?? 2} reports)</button>
                ) : (d.fraud_flags ?? 0) > 0 && !d.flagged ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded border border-amber/25 bg-amber/[0.05] px-2.5 py-1.5 text-[10px] text-amber"><IconShield className="h-3.5 w-3.5 shrink-0" />{d.fraud_flags}/{d.fraud_quorum} fraud reports — halts at quorum.</div>
                ) : null}
              </>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — price terminal */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Link href="/markets" className="inline-flex items-center gap-1.5 text-xs text-ink-dim transition hover:text-neon"><span aria-hidden>←</span> All markets</Link>
          {data === "missing" && <Panel><div className="p-8 text-center text-sm text-ink-dim">Market not found.</div></Panel>}
          {m && d && st && prog && (
            <>
              {d.flagged && (
                <div className="flex items-center gap-2 rounded border border-danger/40 bg-danger/[0.08] px-3 py-2 text-[11px] text-danger" style={{ boxShadow: "0 0 18px rgba(255,40,40,0.15)" }}>
                  <IconShield className="h-4 w-4 shrink-0" /><span><b>Flagged fraudulent.</b> Trading is halted and every listing stake was slashed — the vouchers forfeited their locked GRID.</span>
                </div>
              )}
              <div className="ng-panel p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div><h1 className="ng-title text-xl font-bold text-neon text-glow-soft"><Decrypt text={`${m.base_symbol} / ${m.quote_symbol}`} /></h1><div className="mt-0.5 text-[10px] text-ink-faint">{m.grid_name} · {stage} market</div></div>
                    {/* condensed founder credibility — the thesis, in the header */}
                    {d.provenance?.founder && (
                      <Link href={`/talent/${d.provenance.founder.id}`} className="group flex min-w-0 shrink items-center gap-2 rounded border border-line bg-neon/[0.03] px-2.5 py-1.5 transition hover:border-neon/40" title="Founder — verifiable track record">
                        <MatrixAvatar seed={d.provenance.founder.username} size={26} />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-bold leading-tight text-ink group-hover:text-neon">{d.provenance.founder.username}</span>
                          <span className="block text-[9px] leading-tight text-ink-faint"><span className="text-neon tnum">{Math.round(d.provenance.founder.reputation).toLocaleString()}</span> rep · {d.provenance.founder.credentials_count}✓ creds</span>
                        </span>
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div><div className="text-[9px] uppercase tracking-wide text-ink-faint">Change</div><div className={`text-sm font-bold tnum ${st.change >= 0 ? "text-neon" : "text-danger"}`}>{st.change >= 0 ? "+" : ""}{st.change.toFixed(2)}%</div></div>
                    <div><div className="text-[9px] uppercase tracking-wide text-ink-faint">High</div><div className="text-sm tnum text-ink">${st.high.toFixed(4)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wide text-ink-faint">Low</div><div className="text-sm tnum text-ink">${st.low.toFixed(4)}</div></div>
                    <div><div className="text-[9px] uppercase tracking-wide text-ink-faint">Mkt cap</div><div className="text-sm font-bold tnum text-neon">{money(m.marketcap ?? 0)}</div></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5">
                  {TF.map((t) => <button key={t} onClick={() => setTf(t)} className={`rounded px-2 py-0.5 text-[10px] transition ${tf === t ? "bg-neon/15 text-neon" : "text-ink-dim hover:text-neon"}`}>{t}</button>)}
                  <span className="ml-auto text-[10px] text-ink-faint">${(m.price ?? 0).toFixed(5)} · live</span>
                  {stage !== "alpha" && <button onClick={() => setBookOpen((v) => !v)} className={`ml-2 flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition ${bookOpen ? "bg-neon/15 text-neon" : "text-ink-dim hover:text-neon"}`}><IconLayers className="h-3 w-3" />{bookOpen ? "Hide book" : "Book"}</button>}
                </div>
                <div className="mt-1 flex gap-2" style={{ height: "clamp(320px, 56vh, 620px)" }}>
                  <div ref={chartRef} className="min-w-0 flex-1">
                    {candles.length > 0 ? <Candles data={candles} w={chartW} h={chartH} /> : (
                      <div className="grid h-full w-full place-items-center border border-dashed border-neon/15">
                        <div className="text-center">
                          <div className="text-[13px] text-ink-dim">░ awaiting first trades ░</div>
                          <div className="mt-1 text-[10px] text-ink-faint">The chart plots live from the first fill on this timeframe.</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {bookOpen && stage !== "alpha" && <OrderBook book={d.orderBook} onClose={() => setBookOpen(false)} />}
                </div>
              </div>

              {/* bottom tabs */}
              <Panel bodyClass="p-0">
                <div className="flex items-center gap-4 overflow-x-auto border-b border-line px-3.5 pt-3">
                  {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`-mb-px shrink-0 border-b-2 pb-2 text-[12px] transition ${activeTab === t ? "border-neon text-neon" : "border-transparent text-ink-dim hover:text-neon"}`}>{t}{t === "Holders" ? ` (${d.holder_count})` : t === "Positions" && d.positions.length ? ` (${d.positions.length})` : t === "Open Orders" && d.orders.length ? ` (${d.orders.length})` : ""}</button>)}
                </div>
                <div className="p-3.5">
                  {activeTab === "Positions" && (d.positions.length ? (
                    <div className="space-y-2">
                      {d.positions.map((p) => (
                        <div key={p.position_id} className="rounded border border-line p-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className={`w-16 font-semibold ${p.side === "long" ? "text-neon" : "text-danger"}`}>{p.side.toUpperCase()} {p.leverage}×</span>
                            <span className="flex-1 text-right text-ink-dim">{compact(p.size)} @ ${p.entry_price.toFixed(4)}</span>
                            <span className="flex-1 text-right text-amber">liq ${p.liquidation_price.toFixed(4)}</span>
                            <span className={`flex-1 text-right ${p.upnl >= 0 ? "text-neon" : "text-danger"}`}>{p.upnl >= 0 ? "+" : ""}{money(Math.abs(p.upnl))}</span>
                            <button onClick={() => act(`/api/markets/${id}/perp`, { action: "close", position_id: p.position_id }, "Position closed")} disabled={busy} className="w-12 text-right text-[10px] text-neon hover:underline disabled:opacity-40">Close</button>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[9px] text-ink-faint">
                            <span>Margin {money(p.margin)}</span>{(p.funding_paid ?? 0) > 0 && <span className="text-danger/70">funding −{money(p.funding_paid ?? 0)}</span>}
                            {p.take_profit ? <span className="text-neon">TP ${p.take_profit.toFixed(4)}</span> : null}{p.stop_loss ? <span className="text-danger">SL ${p.stop_loss.toFixed(4)}</span> : null}{p.take_profit && p.stop_loss ? <span className="rounded bg-cyan/15 px-1 text-cyan">OCO</span> : null}
                            {p.trailing_stop_pct ? <span className="text-amber">TRAIL {p.trailing_stop_pct}%{p.trail_anchor ? ` @ $${p.trail_anchor.toFixed(4)}` : ""}</span> : null}
                          </div>
                          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const tp = String(fd.get("tp") ?? "").trim(), sl = String(fd.get("sl") ?? "").trim(), tr = String(fd.get("trail") ?? "").trim(); act(`/api/markets/${id}/perp`, { action: "triggers", position_id: p.position_id, take_profit: tp ? Number(tp) : null, stop_loss: sl ? Number(sl) : null, trailing_pct: tr ? Number(tr) : null }, "Triggers updated"); }} className="mt-1.5 flex items-center gap-1">
                            <input name="tp" inputMode="decimal" defaultValue={p.take_profit ?? ""} placeholder="Take-profit $" className="ng-input w-full !py-1 text-[10px]" />
                            <input name="sl" inputMode="decimal" defaultValue={p.stop_loss ?? ""} placeholder="Stop-loss $" className="ng-input w-full !py-1 text-[10px]" />
                            <input name="trail" inputMode="decimal" defaultValue={p.trailing_stop_pct ?? ""} placeholder="Trail %" className="ng-input w-24 shrink-0 !py-1 text-[10px]" />
                            <button type="submit" disabled={busy} className="ng-btn ng-btn--sm shrink-0 !py-1 text-[10px] disabled:opacity-40">Set</button>
                          </form>
                        </div>
                      ))}
                      <p className="px-1 text-[9px] leading-relaxed text-ink-faint">TP/SL close the position when the mark crosses your level; set both for OCO (first to hit wins). Trail % follows the best mark and closes on the pullback. Leave a field blank to clear it.</p>
                    </div>
                  ) : <p className="text-xs text-ink-dim">No open positions. Open a long or short on the right.</p>)}

                  {activeTab === "Open Orders" && (d.orders.length ? (
                    <div className="space-y-1.5">
                      {d.orders.map((o) => (
                        <div key={o.order_id} className="flex items-center gap-2 px-1 text-[11px]">
                          <span className={`w-12 font-semibold ${o.side === "buy" ? "text-neon" : "text-danger"}`}>{o.kind === "perp_entry" ? (o.pside ?? o.side).toUpperCase() : o.side.toUpperCase()}</span>
                          <span className="flex-1 text-ink-dim">{o.kind === "perp_entry" ? `${money(o.collateral ?? 0)} · ${o.leverage ?? 1}×` : `${compact(o.qty)}${o.filled > 0 ? ` (${compact(o.filled)} filled)` : ""}`} @ ${o.price.toFixed(4)}</span>
                          <span className={o.kind === "perp_entry" ? "rounded bg-cyan/15 px-1 text-[9px] text-cyan" : "text-ink-faint"}>{o.kind === "perp_entry" ? "perp entry" : o.filled > 0 ? "partial" : "limit"}</span>
                          <button onClick={() => act(`/api/markets/${id}/order`, { action: "cancel", order_id: o.order_id }, "Order cancelled")} disabled={busy} className="text-[10px] text-danger hover:underline disabled:opacity-40">Cancel</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-ink-dim">No open orders.</p>)}

                  {activeTab === "Tnx" && (d.trades.length ? (() => {
                    const maxQ = Math.max(1, ...d.trades.map((x) => x.quote));
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 px-1 text-[9px] uppercase tracking-wide text-ink-faint"><span className="w-11">Side</span><span className="w-16">Volume</span><span className="flex-1 text-right">Amount</span><span className="flex-1 text-right">USDC</span><span className="flex-1 text-right">Price</span></div>
                        {d.trades.map((t, i) => <div key={i} className="flex items-center gap-2 px-1 text-[11px]"><span className={`w-11 font-semibold ${t.side === "buy" ? "text-neon" : "text-danger"}`}>{t.side.toUpperCase()}</span><span className="h-1.5 w-16 shrink-0 overflow-hidden bg-neon/8"><span className={`block h-full ${t.side === "buy" ? "bg-neon/55" : "bg-danger/55"}`} style={{ width: `${Math.max(3, (t.quote / maxQ) * 100)}%` }} /></span><span className="flex-1 text-right text-ink-dim">{t.base.toFixed(0)}</span><span className="flex-1 text-right text-ink-dim">${t.quote.toFixed(2)}</span><span className="flex-1 text-right text-ink">${t.price.toFixed(5)}</span></div>)}
                      </div>
                    );
                  })() : <p className="text-xs text-ink-dim">No trades yet — be the first.</p>)}

                  {activeTab === "Holders" && (d.holders.length ? (() => {
                    const top5 = Math.min(100, d.holders.slice(0, 5).reduce((s, h) => s + (h.pct || 0), 0));
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4 border-b border-line pb-3">
                          <Donut size={92} thickness={12} data={[top5, Math.max(0, 100 - top5)]} colors={["var(--ng-neon)", "rgba(0,255,65,0.14)"]} center={`${Math.round(top5)}%`} />
                          <div className="text-[11px] leading-relaxed text-ink-dim">
                            <div className="ng-label !text-[10px]">Concentration</div>
                            <div className="mt-1">Top 5 hold <span className="font-semibold text-neon">{Math.round(top5)}%</span></div>
                            <div className="text-ink-faint">{d.holder_count.toLocaleString()} holders total</div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-3 px-1 text-[9px] uppercase tracking-wide text-ink-faint"><span className="w-5">#</span><span className="w-28">Address</span><span className="w-12 text-right">%</span><span className="flex-1" /><span className="w-20 text-right">Amount</span><span className="w-24 text-right">Value</span></div>
                          {d.holders.map((hd, i) => (
                            <div key={i} className="flex items-center gap-3 px-1 text-[11px]"><span className="w-5 text-ink-faint">{i + 1}</span><span className="w-28 truncate text-ink">{shortAddr(hd.address)}</span><span className="w-12 text-right text-neon">{hd.pct.toFixed(2)}%</span><span className="h-1.5 flex-1 overflow-hidden bg-neon/10"><span className="block h-full bg-neon/60" style={{ width: `${Math.min(100, hd.pct)}%` }} /></span><span className="w-20 text-right text-ink-dim">{compact(hd.amount)}</span><span className="w-24 text-right text-ink-dim">{money(hd.value)}</span></div>
                          ))}
                        </div>
                      </div>
                    );
                  })() : <p className="text-xs text-ink-dim">No holders yet.</p>)}

                  {activeTab === "Traders" && (traders.length ? (() => {
                    const maxVol = Math.max(1, ...traders.map((x) => x.vol));
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3 px-1 text-[9px] uppercase tracking-wide text-ink-faint"><span className="w-5">#</span><span className="w-24">Trader</span><span className="flex-1">Volume</span><span className="w-20 text-right">USDC</span><span className="w-12 text-right">Txns</span></div>
                        {traders.map((tr, i) => (
                          <div key={i} className="flex items-center gap-3 px-1 text-[11px]">
                            <span className="w-5 text-ink-faint">{i + 1}</span>
                            <span className="w-24 truncate text-ink">{shortAddr(tr.user)}</span>
                            <span className="h-2 flex-1 overflow-hidden bg-neon/10"><span className="block h-full bg-neon/60" style={{ width: `${Math.max(3, (tr.vol / maxVol) * 100)}%` }} /></span>
                            <span className="w-20 text-right text-neon">{money(tr.vol)}</span>
                            <span className="w-12 text-right text-ink-dim">{tr.n}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })() : <p className="text-xs text-ink-dim">No traders yet.</p>)}

                  {activeTab === "My Position" && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label={`${m.base_symbol} held`} value={Math.round(d.holding ?? 0)} accent="neon" /><Stat label="Value" value={Math.round(posValue)} prefix="$" /><Stat label="USDC" value={Math.round(d.wallet.usdc)} prefix="$" /><Stat label="GRID" value={Math.round(d.wallet.grid)} /></div>
                  )}

                  {activeTab === "Provenance" && (d.provenance ? (() => {
                    const p = d.provenance;
                    const tr = p.founder?.track_record;
                    const steps = [
                      { label: p.origin.built_with_echo ? "Built · Echo" : "Built", done: !!p.build },
                      ...(p.origin.kind === "proposal" ? [{ label: `Funded · ${money(p.origin.proposal?.raised ?? 0)}`, done: (p.origin.proposal?.raised ?? 0) > 0 }] : []),
                      { label: `Delivered ${p.milestones.released}/${p.milestones.total}`, done: p.milestones.released > 0 || p.milestones.total === 0 },
                      { label: "Audited", done: p.audit?.status === "passed" },
                      { label: `Launched · ${stage}`, done: true },
                    ];
                    return (
                      <div className="space-y-4">
                        <div>
                          <div className="ng-label mb-2 !text-ink-dim">Lineage — how {m.base_symbol} earned its market</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {steps.map((s, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                <span className={`flex items-center gap-1 rounded border px-2 py-1 ${s.done ? "border-neon/30 bg-neon/[0.06] text-neon" : "border-line text-ink-faint"}`}>{s.done && <IconCheck className="h-3 w-3" />}{s.label}</span>
                                {i < steps.length - 1 && <IconArrowRight className="h-3 w-3 text-ink-faint" />}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {p.founder && (
                            <div className="ng-card p-3.5">
                              <div className="ng-label mb-2 !text-neon">Founder</div>
                              <Link href={`/talent/${p.founder.id}`} className="group flex items-center gap-3">
                                <MatrixAvatar seed={p.founder.username} size={42} />
                                <div className="min-w-0"><div className="truncate text-sm font-bold text-neon group-hover:underline">{p.founder.username}</div><div className="truncate text-[10px] text-ink-faint">{p.founder.wallet || `@${p.founder.username}`}</div></div>
                              </Link>
                              {p.founder.bio && <p className="mt-2 line-clamp-2 text-[11px] text-ink-dim">{p.founder.bio}</p>}
                              <div className="mt-2.5 flex items-baseline gap-2"><span className="ng-stat__v !text-lg text-neon tnum">{Math.round(p.founder.reputation).toLocaleString()}</span><span className="ng-stat__k">reputation</span></div>
                              {Object.keys(p.founder.by_dimension).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(p.founder.by_dimension).map(([k, v]) => <Tag key={k} className="!text-[9px]">{k} {Math.round(v)}</Tag>)}</div>}
                              {tr && <div className="mt-3 grid grid-cols-4 divide-x divide-line border-t border-line pt-2.5 text-center">{([["builds", tr.builds], ["jobs", tr.jobs_done], ["shipped", tr.milestones_shipped], ["launched", tr.projects_launched]] as [string, number][]).map(([k, v]) => <div key={k}><div className="text-sm font-bold text-ink tnum">{v}</div><div className="ng-stat__k">{k}</div></div>)}</div>}
                              {p.founder.credentials.length > 0 && <div className="mt-3"><div className="ng-label mb-1.5 !text-ink-dim">Soulbound credentials</div><div className="flex flex-wrap gap-1.5">{p.founder.credentials.map((c, i) => <span key={i} className="inline-flex items-center gap-1 rounded border border-cyan/25 bg-cyan/[0.05] px-1.5 py-0.5 text-[9px] text-cyan"><IconShield className="h-2.5 w-2.5" />{c.title}</span>)}</div></div>}
                            </div>
                          )}
                          <div className="ng-card p-3.5">
                            <div className="ng-label mb-2 !text-ink-dim">Backers{p.origin.proposal ? ` · ${money(p.origin.proposal.raised)} raised` : ""}</div>
                            {p.backers.length ? (
                              <div className="space-y-1.5">{p.backers.map((b) => <Link key={b.id} href={`/talent/${b.id}`} className="flex items-center gap-2 text-[11px]"><MatrixAvatar seed={b.username} size={22} /><span className="min-w-0 flex-1 truncate text-ink">{b.username}</span><span className="flex items-center gap-0.5 text-ink-dim"><IconActivity className="h-2.5 w-2.5 text-neon" />{Math.round(b.reputation)}</span><Mark plain className="!text-[10px]">{money(b.amount)}</Mark></Link>)}</div>
                            ) : <p className="text-[11px] text-ink-faint">{p.origin.kind === "direct" ? "Direct launch — no Fund raise." : "No backers listed."}</p>}
                            <div className="mt-3 divide-y divide-line border-t border-line pt-2 text-[11px]">
                              <div className="ng-row !py-1"><span className="ng-row__k">Audit</span><span className={`font-normal ${p.audit?.status === "passed" ? "text-neon" : "text-amber"}`}>{p.audit?.status ?? "—"}</span></div>
                              <div className="ng-row !py-1"><span className="ng-row__k">Milestones</span><span className="ng-row__v font-normal">{p.milestones.released}/{p.milestones.total} released</span></div>
                              {p.build?.proof && <div className="ng-row !py-1"><span className="ng-row__k">Proof of build</span><span className="ng-row__v max-w-[55%] truncate font-normal text-ink-dim">{p.build.proof}</span></div>}
                              <div className="ng-row !py-1"><span className="ng-row__k">From Grid</span><Link href={`/grid/${p.grid.slug}`} className="font-normal text-neon hover:underline">{p.grid.name}</Link></div>
                              {p.subgrid && <div className="ng-row !py-1"><span className="ng-row__k">Team (SubGrid)</span><span className="ng-row__v font-normal">{p.subgrid.name}</span></div>}
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] italic text-ink-faint">Merit over connections — every claim here is earned + verifiable. This is the anti-VC track record, surfaced at the point of trade.</p>
                      </div>
                    );
                  })() : <p className="text-xs text-ink-dim">No provenance data.</p>)}

                  {activeTab === "Roadmap" && (d.roadmap.length ? (() => {
                    const ms = [...d.roadmap].sort((a, b) => a.order - b.order);
                    const total = ms.reduce((s, m) => s + (m.amount || 0), 0);
                    const released = ms.filter((m) => m.status === "released").reduce((s, m) => s + (m.amount || 0), 0);
                    return (
                      <div className="space-y-3">
                        <div className="border-b border-line pb-3">
                          <div className="mb-1 flex items-center justify-between text-[10px]"><span className="ng-label !text-[10px]">Milestone tranches → ask</span><span className="text-ink-faint">{money(released)} released / {money(total)}</span></div>
                          <Waterfall steps={ms.map((m) => ({ value: m.amount, kind: "delta" as const }))} h={92} />
                        </div>
                        <div className="space-y-2">{ms.map((m, i) => <div key={i} className="flex items-center gap-3 text-[11px]"><span className={`grid h-5 w-5 shrink-0 place-items-center text-[9px] ${m.status === "released" ? "bg-neon/15 text-neon" : "bg-neon/5 text-ink-faint"}`}>{m.status === "released" ? "✓" : i + 1}</span><span className="flex-1 text-ink">{m.title}</span><Mark plain className="!text-[10px]">{money(m.amount)}</Mark><span className="w-16 text-right text-[10px] capitalize text-ink-faint">{m.status}</span></div>)}</div>
                      </div>
                    );
                  })() : <p className="text-xs text-ink-dim">No roadmap milestones.</p>)}
                </div>
              </Panel>
            </>
          )}
        </main>

        {/* RIGHT — stage-aware trade panel */}
        <OrbPanel side="right" label="Trade" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title={rPanel === "chat" ? "COMMUNITY" : rPanel === "agent" ? "AGENT MODE" : "TRADE"} icon={rPanel === "chat" ? <IconUser className="h-4 w-4" /> : rPanel === "agent" ? <IconBolt className="h-4 w-4" /> : <IconCoins className="h-4 w-4" />} bodyClass="p-3.5">
            {m && d && (
              <>
                <div className="mb-3 flex gap-5 border-b border-line">
                  {(["trade", "agent", "chat"] as const).map((t) => <button key={t} onClick={() => setRPanel(t)} className={`-mb-px flex items-center gap-1 border-b-2 pb-2 text-[12px] transition ${rPanel === t ? "border-neon text-neon" : "border-transparent text-ink-dim hover:text-neon"}`}>{t === "chat" ? `Chat${chatMsgs.length ? ` · ${chatMsgs.length}` : ""}` : t === "agent" ? "Agent" : "Trade"}{t === "agent" && agentActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon" />}</button>)}
                </div>
                {rPanel === "agent" ? (
                  <AgentPanel state={agentState} stage={stage} maxLeverage={d.maxLeverage} onArm={armAgent} onStop={stopAgent} busy={busy} />
                ) : rPanel === "chat" ? (
                  <ChatPanel messages={chatMsgs} onSend={sendChat} onLike={likeChat} busy={busy} />
                ) : prog && st ? (
                <>
                <div className="grid grid-cols-3 gap-1">
                  {STAGE_ORDER.map((s) => { const locked = STAGE_ORDER.indexOf(s) > STAGE_ORDER.indexOf(stage); return <div key={s} className={`flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-[11px] capitalize ${s === stage ? "border-neon/50 bg-neon/10 text-neon" : locked ? "border-line text-ink-faint" : "border-line text-ink-dim"}`}>{s}{locked && <IconLock className="h-3 w-3" />}</div>; })}
                </div>

                {/* FUTURES — perp panel */}
                {stage === "futures" ? (
                  <div className="mt-3">
                    {/* leverage — notched slider track, exchange-style */}
                    <div className="flex items-center justify-between text-[10px] text-ink-faint"><span>Leverage</span><span className="text-[15px] font-bold text-neon tnum">{lev}×</span></div>
                    <div className="mt-1.5 flex items-center gap-0">
                      {LEV.map((l, i) => (
                        <button key={l} onClick={() => setLev(l)} className="group flex flex-1 flex-col items-center gap-1" aria-label={`${l}× leverage`}>
                          <span className={`h-[5px] w-full transition ${LEV.indexOf(lev) >= i ? "bg-neon" : "bg-neon/15 group-hover:bg-neon/30"}`} />
                          <span className={`text-[10px] tnum transition ${lev === l ? "text-neon" : "text-ink-faint group-hover:text-neon"}`}>{l}×</span>
                        </button>
                      ))}
                    </div>
                    {/* margin — input + balance slider */}
                    <div className="mt-3 flex items-center justify-between text-[10px] text-ink-faint"><span>Margin (USDC)</span><span>Bal {money(d.wallet.usdc)}</span></div>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="ng-input mt-1 !py-2 text-xs" />
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="range" min={0} max={100} step={5}
                        value={d.wallet.usdc > 0 ? Math.min(100, Math.round((collateral / d.wallet.usdc) * 100)) : 0}
                        onChange={(e) => setAmount(String(+(d.wallet.usdc * (Number(e.target.value) / 100)).toFixed(2)))}
                        className="h-1 flex-1 cursor-pointer appearance-none bg-neon/15"
                        style={{ accentColor: "#00ff00" }}
                        aria-label="Margin as percent of balance"
                      />
                      <span className="w-9 text-right text-[10px] text-ink-dim tnum">{d.wallet.usdc > 0 ? Math.min(100, Math.round((collateral / d.wallet.usdc) * 100)) : 0}%</span>
                    </div>
                    {/* advanced — limit entry + TP/SL/Trail, tucked away until needed */}
                    <details className="mt-2 group">
                      <summary className="cursor-pointer list-none text-[10px] text-ink-dim transition hover:text-neon">▸ Advanced — limit entry · TP / SL / Trail</summary>
                      <div className="mt-1.5 space-y-1.5">
                        <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder={`Limit $ (blank = mark $${(m.price ?? 0).toFixed(4)})`} className="ng-input !py-1.5 text-[11px]" />
                        <div className="grid grid-cols-3 gap-1">
                          <input value={tpIn} onChange={(e) => setTpIn(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="TP $" className="ng-input !py-1.5 text-[11px]" />
                          <input value={slIn} onChange={(e) => setSlIn(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="SL $" className="ng-input !py-1.5 text-[11px]" />
                          <input value={trailIn} onChange={(e) => setTrailIn(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Trail %" className="ng-input !py-1.5 text-[11px]" />
                        </div>
                      </div>
                    </details>
                    {/* order readout — open type + the liquidation buffer bar */}
                    <div className="mt-3 grid grid-cols-3 divide-x divide-line text-center">
                      <div className="px-1"><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Size</div><div className="mt-0.5 text-[14px] font-bold leading-none text-ink tnum">{compact(perpSize)}</div></div>
                      <div className="px-1"><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Notional</div><div className="mt-0.5 text-[14px] font-bold leading-none text-ink tnum">{money(collateral * lev)}</div></div>
                      <div className="px-1"><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Liq (long)</div><div className="mt-0.5 text-[14px] font-bold leading-none text-amber tnum">${(((m.price ?? 0) * (1 - 1 / lev + 0.005)) || 0).toFixed(2)}</div></div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[9px] text-ink-faint">
                      <span className="shrink-0">Liq buffer</span>
                      <span className="h-[5px] flex-1 bg-danger/25"><span className="block h-full bg-neon/80" style={{ width: `${Math.max(2, Math.min(100, (1 / lev - 0.005) * 100 * 4))}%` }} /></span>
                      <span className="shrink-0 text-ink-dim tnum">~{((1 / lev - 0.005) * 100).toFixed(1)}% to liq</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      <button onClick={async () => { const lp = Number(limitPrice); const ok = await act(`/api/markets/${id}/perp`, { action: "open", side: "long", collateral, leverage: lev, ...(lp > 0 ? { limit_price: lp } : {}), ...(Number(tpIn) > 0 ? { take_profit: Number(tpIn) } : {}), ...(Number(slIn) > 0 ? { stop_loss: Number(slIn) } : {}), ...(Number(trailIn) > 0 ? { trailing_pct: Number(trailIn) } : {}) }, lp > 0 ? "Long entry resting" : "Long opened"); if (ok) { setAmount(""); setLimitPrice(""); setTpIn(""); setSlIn(""); setTrailIn(""); } }} disabled={busy || !(collateral > 0)} className="ng-btn ng-btn-primary !py-2.5 !text-[13px] font-bold disabled:opacity-40">{Number(limitPrice) > 0 ? "Limit Long ↗" : "Long ↗"}</button>
                      <button onClick={async () => { const lp = Number(limitPrice); const ok = await act(`/api/markets/${id}/perp`, { action: "open", side: "short", collateral, leverage: lev, ...(lp > 0 ? { limit_price: lp } : {}), ...(Number(tpIn) > 0 ? { take_profit: Number(tpIn) } : {}), ...(Number(slIn) > 0 ? { stop_loss: Number(slIn) } : {}), ...(Number(trailIn) > 0 ? { trailing_pct: Number(trailIn) } : {}) }, lp > 0 ? "Short entry resting" : "Short opened"); if (ok) { setAmount(""); setLimitPrice(""); setTpIn(""); setSlIn(""); setTrailIn(""); } }} disabled={busy || !(collateral > 0)} className="ng-btn ng-btn-danger !py-2.5 !text-[13px] font-bold disabled:opacity-40">{Number(limitPrice) > 0 ? "Limit Short ↘" : "Short ↘"}</button>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer list-none text-[9px] text-ink-faint transition hover:text-neon">ⓘ how margin works</summary>
                      <p className="mt-1 text-[9.5px] leading-relaxed text-ink-faint">Mark = spot AMM · margin in USDC · auto-liquidation past the liq price · max {d.maxLeverage}× · a limit entry opens when the mark reaches your price (long at-or-below, short at-or-above).</p>
                    </details>
                  </div>
                ) : (
                  /* ALPHA + SPOT — buy / sell */
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-1"><button onClick={() => setSide("buy")} className={`rounded py-2.5 text-[13px] font-bold transition ${side === "buy" ? "bg-neon text-bg" : "border border-line text-ink-dim hover:text-neon"}`}>Buy ↗</button><button onClick={() => setSide("sell")} className={`rounded py-2.5 text-[13px] font-bold transition ${side === "sell" ? "bg-danger text-bg" : "border border-line text-ink-dim hover:text-danger"}`}>Sell ↘</button></div>
                    {stage === "spot" && (
                      <div className="mt-2 flex gap-3 text-[11px]">{(["market", "limit"] as const).map((o) => <button key={o} onClick={() => setOt(o)} className={`capitalize transition ${ot === o ? "text-neon" : "text-ink-dim hover:text-neon"}`}>{o}{ot === o && <span className="ml-1 text-neon/60">●</span>}</button>)}</div>
                    )}
                    {stage === "spot" && ot === "limit" && (
                      <><div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span>Price (USDC)</span></div><input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder={(m.price ?? 0).toFixed(5)} className="ng-input mt-1 !py-1.5 text-xs" /></>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span>Amount ({stage === "spot" && ot === "limit" ? m.base_symbol : side === "buy" ? m.quote_symbol : m.base_symbol})</span><span>{side === "buy" ? `Bal ${money(d.wallet.usdc)}` : `Bal ${(d.holding ?? 0).toFixed(0)}`}</span></div>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="ng-input mt-1 !py-2 text-xs" />
                    <div className="mt-1.5 grid grid-cols-4 gap-1">{(side === "buy" && !(stage === "spot" && ot === "limit") ? [10, 100, 1000] : [25, 50, 75, 100]).map((q) => <button key={q} onClick={() => setAmount(String(side === "buy" && !(stage === "spot" && ot === "limit") ? q : +((d.holding ?? 0) * (q / 100)).toFixed(2)))} className="rounded border border-line py-1 text-[10px] text-ink-dim transition hover:border-neon/40 hover:text-neon">{side === "buy" && !(stage === "spot" && ot === "limit") ? q : `${q}%`}</button>)}</div>
                    {stage === "spot" && ot === "limit" && <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span>Total</span><span className="text-ink">{money((Number(limitPrice) || 0) * (Number(amount) || 0))} USDC</span></div>}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span>Trading fee</span><span>1.00%</span></div>
                    <button
                      onClick={async () => {
                        const a = Number(amount);
                        let ok = false;
                        if (stage === "spot" && ot === "limit") { const p = Number(limitPrice); if (p > 0 && a > 0) ok = await act(`/api/markets/${id}/order`, { action: "place", side, price: p, qty: a }, "Order placed"); }
                        else ok = await tradeMkt(side, a, side === "buy" ? "Bought" : "Sold");
                        if (ok) setAmount("");
                      }}
                      disabled={busy || !(Number(amount) > 0)}
                      className={`ng-btn ng-btn--block mt-2 disabled:opacity-40 ${side === "buy" ? "ng-btn-primary" : "ng-btn-danger"}`}
                    >{side === "buy" ? "Buy" : "Sell"} {m.base_symbol}</button>
                  </div>
                )}

                {/* ASCENSION ARC */}
                {stage !== "futures" && (
                  <div className="mt-5 border-t border-line pt-3">
                    <div className="flex items-center justify-between"><div className="ng-label !text-ink-dim">{stage === "spot" ? "Futures listing" : "Ascension Arc"} → {prog.next}</div><Mark plain accent={STAGE_ACCENT[stage]} className="!text-[9px]">{prog.capPct}%</Mark></div>
                    <div className="flex justify-center"><Gauge percent={prog.capPct} w={160} /></div>
                    <div className="-mt-1 flex justify-between px-2 text-[9px] text-ink-faint"><span>$0</span><span>{money(prog.capTarget / 2)}</span><span>{money(prog.capTarget)}</span></div>
                    <div className="mt-1 text-center text-[11px] text-ink-dim">{money(prog.marketcap)} cap · liquidity {prog.liqOk ? <span className="text-neon">met ✓</span> : <span className="text-amber">{money(prog.liquidity)}/{money(prog.liqFloor)}</span>}</div>
                  </div>
                )}

                {/* flow — the long/short pressure bar, exchange-style */}
                <div className="mt-3">
                  <div className="relative flex h-[18px] overflow-hidden">
                    <span className="flex h-full items-center bg-neon/80 pl-1.5 text-[9px] font-bold text-bg transition-all duration-500" style={{ width: `${st.buyVol + st.sellVol > 0 ? (st.buyVol / (st.buyVol + st.sellVol)) * 100 : 50}%` }}>{st.buyVol + st.sellVol > 0 ? `${Math.round((st.buyVol / (st.buyVol + st.sellVol)) * 100)}%` : ""}</span>
                    <span className="flex h-full flex-1 items-center justify-end bg-danger/60 pr-1.5 text-[9px] font-bold text-bg" >{st.buyVol + st.sellVol > 0 ? `${Math.round((st.sellVol / (st.buyVol + st.sellVol)) * 100)}%` : ""}</span>
                    <span className="absolute left-1/2 top-0 h-full w-px bg-black/60" />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px]"><span className="text-neon">Buy {money(st.buyVol)} · {st.buys}×</span><span className="text-danger">{st.sells}× · Sell {money(st.sellVol)}</span></div>
                </div>

                {/* BACKER ALLOCATION — the upside side of backing the raise */}
                {d.allocation && (
                  <div className="mt-5 border-t border-line pt-3">
                    <div className="ng-label mb-1 flex items-center gap-2 !text-cyan"><IconCheck className="h-3.5 w-3.5" />Backer allocation</div>
                    <p className="text-[10px] leading-relaxed text-ink-dim">Your share of {m.base_symbol} for backing the raise — {d.allocation.upfront_bps / 100}% unlocked at launch, the rest vesting over {d.allocation.vest_days} days. Claimed tokens become a real, tradable holding.</p>
                    <div className="mt-2 divide-y divide-line text-[11px]">
                      <div className="ng-row !py-1"><span className="ng-row__k">Total</span><Mark plain className="!text-[11px]">{Math.round(d.allocation.total).toLocaleString()} {m.base_symbol}</Mark></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Vested</span><span className="ng-row__v font-normal">{Math.round(d.allocation.vested).toLocaleString()}</span></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Claimed</span><span className="ng-row__v font-normal text-ink-dim">{Math.round(d.allocation.claimed).toLocaleString()}</span></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Claimable</span><Mark plain accent="cyan" className="!text-[11px]">{Math.floor(d.allocation.claimable).toLocaleString()}</Mark></div>
                    </div>
                    <button onClick={() => act(`/api/markets/${id}/claim-allocation`, {}, `Claimed ${Math.floor(d.allocation?.claimable ?? 0).toLocaleString()} ${m.base_symbol}`, { nothing_vested: "Nothing vested yet — check back as the schedule unlocks" })} disabled={busy || (d.allocation.claimable ?? 0) < 1} className="ng-btn ng-btn-cyan ng-btn--block mt-2 disabled:opacity-40"><IconBolt className="h-3.5 w-3.5" /> Claim vested {m.base_symbol}</button>
                  </div>
                )}

                {/* FOUNDER ALLOCATION — market success returns to the maker */}
                {d.founder_allocation && (
                  <div className="mt-5 border-t border-line pt-3">
                    <div className="ng-label mb-1 flex items-center gap-2 !text-neon"><IconBolt className="h-3.5 w-3.5" />Founder allocation</div>
                    <p className="text-[10px] leading-relaxed text-ink-dim">You built this — your carve of {m.base_symbol}: {d.founder_allocation.upfront_bps / 100}% unlocked at launch, the rest vesting over {d.founder_allocation.vest_days} days. Claimed tokens become a real, tradable holding.</p>
                    <div className="mt-2 divide-y divide-line text-[11px]">
                      <div className="ng-row !py-1"><span className="ng-row__k">Total</span><Mark plain className="!text-[11px]">{Math.round(d.founder_allocation.total).toLocaleString()} {m.base_symbol}</Mark></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Vested</span><span className="ng-row__v font-normal">{Math.round(d.founder_allocation.vested).toLocaleString()}</span></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Claimed</span><span className="ng-row__v font-normal text-ink-dim">{Math.round(d.founder_allocation.claimed).toLocaleString()}</span></div>
                      <div className="ng-row !py-1"><span className="ng-row__k">Claimable</span><Mark plain className="!text-[11px]">{Math.floor(d.founder_allocation.claimable).toLocaleString()}</Mark></div>
                    </div>
                    <button onClick={() => act(`/api/markets/${id}/claim-allocation`, {}, `Claimed ${Math.floor(d.founder_allocation?.claimable ?? 0).toLocaleString()} ${m.base_symbol}`, { nothing_vested: "Nothing vested yet — check back as the schedule unlocks" })} disabled={busy || (d.founder_allocation.claimable ?? 0) < 1} className="ng-btn ng-btn-primary ng-btn--block mt-2 disabled:opacity-40"><IconBolt className="h-3.5 w-3.5" /> Claim vested {m.base_symbol}</button>
                  </div>
                )}

                {/* STAKE TO LIST */}
                {d.stake && (
                  <div className="mt-5 border-t border-line pt-3">
                    <div className="ng-label mb-1 flex items-center gap-2 !text-neon"><IconBolt className="h-3.5 w-3.5" />Stake to list · {d.stake.stage}</div>
                    <p className="text-[10px] leading-relaxed text-ink-dim">Lock GRID to vouch for {m.base_symbol} + unlock {d.stake.stage}. The stake is the listing vote — earns a fee share, ~2-yr lock, and is <span className="text-danger/80">slashable if the project is found fraudulent</span>.</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Ring percent={d.stake.pct} value={`${d.stake.pct}%`} label="staked" size={76} stroke={5} color="#ffb020" />
                      <div className="flex-1 text-[11px]"><div className="ng-row !py-0.5"><span className="ng-row__k">Staked</span><Mark plain className="!text-[11px]">{d.stake.staked.toLocaleString()}</Mark></div><div className="ng-row !py-0.5"><span className="ng-row__k">Required</span><span className="ng-row__v font-normal">{d.stake.required.toLocaleString()}</span></div><div className="ng-row !py-0.5"><span className="ng-row__k">Backers</span><span className="ng-row__v font-normal">{d.stake.backers}</span></div></div>
                    </div>
                    {!d.stake.met && <form onSubmit={(e) => { e.preventDefault(); const a = Number(new FormData(e.currentTarget).get("g")); if (a > 0) act(`/api/markets/${id}/stake`, { amount: a }, "GRID staked"); }} className="mt-2 flex gap-1.5"><input name="g" inputMode="decimal" placeholder={`GRID (bal ${Math.round(d.wallet.grid)})`} className="ng-input !py-1.5 text-xs" /><button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Stake</button></form>}
                    {d.graduation.ok ? <button disabled={busy} onClick={() => act(`/api/markets/${id}/graduate`, {}, `Graduated to ${d.graduation.next}`)} className="ng-btn ng-btn-primary ng-btn--block mt-2 disabled:opacity-50"><IconBolt className="h-3.5 w-3.5" /> Graduate to {d.graduation.next} →</button> : d.stake.met ? <div className="mt-2 flex items-center justify-center gap-1.5 rounded border border-neon/20 bg-neon/[0.05] py-1.5 text-[10px] text-neon"><IconCheck className="h-3 w-3" />Stake met — {d.graduation.reason}</div> : null}
                  </div>
                )}

                {/* YOUR LISTING STAKE — fees earned + unstake */}
                {(d.my_stakes ?? []).filter((s) => !s.released).length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="ng-label mb-2 flex items-center justify-between !text-ink-dim"><span>Your listing stake</span>{(d.staker_fees ?? 0) > 0 && <span className="text-neon">+{money(d.staker_fees ?? 0)} earned</span>}</div>
                    <div className="space-y-2">
                      {(d.my_stakes ?? []).filter((s) => !s.released).map((s) => (
                        <div key={s.stake_id} className="rounded border border-line p-2 text-[11px]">
                          <div className="flex items-center justify-between"><span className="font-semibold text-ink">{s.amount.toLocaleString()} GRID</span><Mark plain accent="cyan" className="!text-[10px]">+{money(s.fees_earned)} fees</Mark></div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
                            <span className="capitalize">{s.stage} · {s.matured ? "unlocked" : `locked → ${new Date(s.locked_until).getFullYear()}`}</span>
                            <button onClick={() => act(`/api/markets/${id}/stake`, { action: "unstake", stake_id: s.stake_id }, "Unstaked")} disabled={busy || !s.matured} className="text-neon transition hover:underline disabled:opacity-40">{s.matured ? "Unstake" : "Locked"}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">Stakers earn 40% of every trade fee, pro-rata by stake. GRID unlocks after the ~2-yr commitment.</p>
                  </div>
                )}

                {/* SLASHED STAKES — forfeited on a fraud finding */}
                {(d.my_stakes ?? []).filter((s) => s.slashed).length > 0 && (
                  <div className="mt-3 rounded border border-danger/30 bg-danger/[0.05] p-2 text-[10px] text-danger">
                    <div className="mb-1 flex items-center gap-1.5 font-semibold"><IconShield className="h-3.5 w-3.5" />Slashed</div>
                    {(d.my_stakes ?? []).filter((s) => s.slashed).map((s) => (
                      <div key={s.stake_id} className="flex items-center justify-between"><span>{s.amount.toLocaleString()} GRID</span><span className="text-danger/70 capitalize">forfeited · {s.stage}</span></div>
                    ))}
                    <p className="mt-1 leading-relaxed text-danger/70">Slashed on a fraud finding — the locked GRID is forfeited, not returned.</p>
                  </div>
                )}

                {stage === "futures" && (
                  <div className="mt-5 border-t border-line pt-3">
                    <div className="ng-label mb-2 flex items-center gap-2 !text-cyan"><IconShield className="h-3.5 w-3.5" />Margin</div>
                    <div className="grid grid-cols-2 gap-y-3">
                      <div><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Maint. rate</div><div className="mt-0.5 text-[15px] font-bold leading-none text-ink tnum">0.50%</div></div>
                      <div className="text-right"><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Max leverage</div><div className="mt-0.5 text-[15px] font-bold leading-none text-ink tnum">{d.maxLeverage}×</div></div>
                      <div><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Mark source</div><div className="mt-0.5 text-[15px] font-bold leading-none text-ink">spot AMM</div></div>
                      <div className="text-right"><div className="text-[8.5px] uppercase tracking-wide text-ink-faint">Funding / {d.funding.interval_hours}h</div><div className={`mt-0.5 text-[15px] font-bold leading-none tnum ${d.funding.pays === "long" ? "text-danger" : d.funding.pays === "short" ? "text-neon" : "text-ink"}`}>{(d.funding.rate * 100).toFixed(3)}%</div><div className="mt-0.5 text-[8px] text-ink-faint">{d.funding.pays === "none" ? "balanced" : `${d.funding.pays}s pay`}</div></div>
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer list-none text-[9px] text-ink-faint transition hover:text-neon">ⓘ how funding works</summary>
                      <p className="mt-1 text-[9px] leading-relaxed text-ink-faint">Funding = a skew carry: when open interest is one-sided, the crowded side pays the insurance fund, nudging the book back to balance.</p>
                    </details>
                  </div>
                )}
                </>
                ) : null}
              </>
            )}
          </Panel>
        </OrbPanel>
      </div>

      {/* floating quick-trade bar */}
      {m && d && (
        <div className="fixed bottom-[68px] left-1/2 z-40 flex w-[min(960px,94vw)] -translate-x-1/2 items-center gap-3 overflow-x-auto rounded-lg border border-neon/20 bg-black/85 px-3 py-2 text-[11px] backdrop-blur" style={{ boxShadow: "0 0 24px rgba(0,255,0,0.12)" }}>
          <span className="flex items-center gap-1.5 font-bold text-neon"><IconActivity className="h-3.5 w-3.5" />${(m.price ?? 0).toFixed(5)}</span>
          <span className="text-ink-faint">Holding <span className="text-ink">{(d.holding ?? 0).toFixed(0)}</span></span>
          <span className="text-ink-faint">Value <span className="text-ink">{money(posValue)}</span></span>
          <span className="ml-auto flex items-center gap-1"><span className="text-[10px] text-ink-faint">Buy</span>{[10, 100].map((q) => <button key={q} onClick={() => tradeMkt("buy", q, "Bought")} disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm !py-1 disabled:opacity-40">+{q}</button>)}</span>
          <span className="flex items-center gap-1"><span className="text-[10px] text-ink-faint">Sell</span>{[50, 100].map((q) => <button key={q} onClick={() => tradeMkt("sell", +((d.holding ?? 0) * (q / 100)).toFixed(2), "Sold")} disabled={busy || !(d.holding > 0)} className="ng-btn ng-btn-danger ng-btn--sm !py-1 disabled:opacity-40">{q}%</button>)}</span>
        </div>
      )}
      {toast && <div className="fixed bottom-28 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
      <TerminalFooter items={allMarkets} />
    </div>
  );
}
