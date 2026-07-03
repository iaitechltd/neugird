"use client";

/**
 * /labs/terminal — DESIGN LAB (not linked anywhere). The founder's original
 * vision, prototyped on LIVE platform data: a true phosphor terminal — the
 * "hacky room for a crazy, high-risk idea". Not a dashboard painted green:
 * dense monospace output, squared hairlines, character-drawn gauges, a shell
 * prompt, a streaming event log, keyboard-first nav. If this is the room,
 * the language rolls out to the app.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ---------------- character-drawn primitives (the whole point) ---------------- */

const SPARK_CH = "▁▂▃▄▅▆▇█";
function spark(series: number[], width = 28): string {
  if (!series || series.length < 2) return "▁".repeat(width);
  const pts = series.length > width ? series.slice(-width) : series;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  return pts.map((v) => SPARK_CH[Math.min(7, Math.floor(((v - min) / span) * 8))]).join("");
}
function bar(pct: number, w = 14): string {
  const f = Math.max(0, Math.min(w, Math.round((pct / 100) * w)));
  return "▮".repeat(f) + "▯".repeat(w - f);
}
const fmt$ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

/* ------------------------------- data types (loose) ------------------------------- */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Me = any; type Econ = any; type Mkt = any;

/* ------------------------------------ page ------------------------------------ */

const GREEN = "#33ff66";
const DIM = "#1e9c46";
const FAINT = "#11602b";
const AMBER = "#ffb020";
const RED = "#ff4d5e";
const LINE = "rgba(51,255,102,0.28)";

function Pane({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative ${className}`} style={{ border: `1px solid ${LINE}`, borderRadius: 0, padding: "14px 12px 10px" }}>
      <span className="absolute -top-[9px] left-2 px-1" style={{ background: "#000", color: GREEN, fontSize: 11, letterSpacing: "0.08em" }}>
        [ {title} ]
      </span>
      {children}
    </section>
  );
}

function Row({ k, v, vColor }: { k: string; v: React.ReactNode; vColor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ padding: "1.5px 0" }}>
      <span style={{ color: DIM }}>{k}</span>
      <span style={{ color: vColor ?? GREEN, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export default function TerminalLab() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [econ, setEcon] = useState<Econ>(null);
  const [markets, setMarkets] = useState<Mkt[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [grids, setGrids] = useState<any[]>([]);
  const [clock, setClock] = useState("");
  const [typed, setTyped] = useState(0);
  const [logN, setLogN] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const CMD = "neugrid status --live";

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    fetch("/api/economy").then((r) => r.json()).then(setEcon).catch(() => {});
    fetch("/api/markets").then((r) => r.json()).then((j) => setMarkets(j.markets ?? [])).catch(() => {});
    fetch("/api/agents").then((r) => r.json()).then((j) => setAgents(j.agents ?? [])).catch(() => {});
    fetch("/api/grids").then((r) => r.json()).then((j) => setGrids(j.grids ?? [])).catch(() => {});
    const c = setInterval(() => setClock(new Date().toISOString().slice(11, 19) + " UTC"), 1000);
    const t = setInterval(() => setTyped((n) => (n < CMD.length ? n + 1 : n)), 42);
    return () => { clearInterval(c); clearInterval(t); };
  }, []);

  // the event log streams in line by line, newest appended, like tailing a file
  const logLines = useMemo(() => {
    const ev = (me?.rep_events ?? []).slice(0, 24).map((e: any) => ({
      at: (e.at ?? "").slice(11, 19),
      delta: e.weight,
      text: e.reason ?? e.action,
    }));
    return ev.reverse();
  }, [me]);
  useEffect(() => {
    if (!logLines.length) return;
    let n = 0;
    const iv = setInterval(() => { n += 1; setLogN(n); if (n >= logLines.length) clearInterval(iv); }, 90);
    return () => clearInterval(iv);
  }, [logLines]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [logN]);

  // keyboard-first: single keys navigate (the keybar below is real)
  useEffect(() => {
    const KEYS: Record<string, string> = { b: "/echo", t: "/markets", a: "/agents", g: "/grids/explore", p: "/me", h: "/home" };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const to = KEYS[e.key.toLowerCase()];
      if (to) router.push(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const rep = me?.pulse ?? 0;
  const dims: [string, number][] = (me?.reward?.breakdown ?? []).map((b: any) => [b.dimension, b.units ?? 0]);
  const dimMax = Math.max(1, ...dims.map(([, v]) => v));

  return (
    <div className="min-h-screen" style={{ background: "#000", color: GREEN, fontFamily: "var(--font-geist-mono)", fontSize: 12.5, lineHeight: 1.55 }}>
      {/* barely-there CRT scanlines — the knob is the alpha */}
      <div className="pointer-events-none fixed inset-0" style={{ background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(51,255,102,0.02) 2px 3px)" }} />

      {/* the app's 3-panel frame: left rail · center work area · right rail */}
      <div className="flex h-screen flex-col px-4 pt-5">
        {/* shell prompt = the header */}
        <div className="flex items-baseline justify-between pb-4">
          <div>
            <span style={{ color: DIM }}>{me?.username ?? "guest"}@neugrid</span>
            <span style={{ color: FAINT }}>:~$ </span>
            <span>{CMD.slice(0, typed)}</span>
            <span className="tcur">█</span>
          </div>
          <div style={{ color: DIM }}>{clock} · <span style={{ color: AMBER }}>devnet</span> · rev.local</div>
        </div>

        <div className="flex min-h-0 flex-1 gap-4 pb-12">
          {/* LEFT rail — who you are + your processes */}
          <div className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto pt-2.5">
            <Pane title="IDENTITY">
              <Row k="operator" v={me?.username ?? "—"} />
              <Row k="reputation" v={<>{bar(Math.min(100, (rep / 2000) * 100), 10)} {Math.round(rep)}</>} />
              <Row k="usdc" v={fmt$(me?.balances?.usdc ?? 0)} />
              <Row k="grid" v={`${Math.round(me?.balances?.grid ?? 0).toLocaleString()}`} />
              <Row k="allocation" v={`${(me?.reward?.total_allocation ?? 0).toLocaleString()} → TGE`} />
              <Row k="earned (life)" v={fmt$(me?.income?.total ?? 0)} />
              <div className="mt-2" style={{ borderTop: `1px dashed ${FAINT}`, paddingTop: 6 }}>
                {dims.slice(0, 4).map(([d, v]) => (
                  <Row key={d} k={d} v={<>{bar((v / dimMax) * 100, 8)} <span style={{ color: DIM }}>{Math.round(v)}</span></>} />
                ))}
              </div>
            </Pane>

            <Pane title="AGENTS — ps aux">
              {agents.slice(0, 9).map((a: any) => (
                <div key={a.agent_id} className="flex items-baseline gap-2" style={{ padding: "1.5px 0" }}>
                  <span style={{ color: a.status === "active" ? GREEN : FAINT }}>{a.status === "active" ? "●" : "○"}</span>
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span style={{ color: a.trust_tier === "trusted" ? GREEN : AMBER, fontSize: 10.5 }}>[{a.trust_tier ?? "native"}]</span>
                  <span style={{ color: DIM }}>★{(a.rating ?? 0).toFixed(1)}</span>
                </div>
              ))}
              <div className="mt-2" style={{ color: FAINT }}>{agents.length} processes · autonomous</div>
            </Pane>
          </div>

          {/* CENTER — the work area: markets table + the live log */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 pt-2.5">
            <Pane title="MARKETS — earned, not listed">
              <div className="flex items-baseline gap-2 whitespace-nowrap" style={{ color: FAINT, fontSize: 11 }}>
                <span className="w-14 shrink-0">SYM</span>
                <span className="w-20 shrink-0 text-right">PRICE</span>
                <span className="w-14 shrink-0 text-right">24H</span>
                <span className="w-16 shrink-0 text-right">CAP</span>
                <span className="min-w-0 flex-1 text-right">ASCENSION</span>
                <span className="w-14 shrink-0 text-right">STAGE</span>
              </div>
              {markets.map((m) => {
                const up = (m.change ?? 0) >= 0;
                return (
                  <div key={m.market_id} className="flex cursor-pointer items-baseline gap-2 whitespace-nowrap thl" style={{ padding: "2px 0" }} onClick={() => router.push(`/market/${m.market_id}`)}>
                    <span className="w-14 shrink-0" style={{ fontWeight: 700 }}>{m.base_symbol}</span>
                    <span className="w-20 shrink-0 text-right" style={{ color: DIM }}>${(m.price ?? 0).toFixed(4)}</span>
                    <span className="w-14 shrink-0 text-right" style={{ color: up ? GREEN : RED }}>{up ? "▲" : "▼"}{Math.abs(m.change ?? 0).toFixed(1)}%</span>
                    <span className="w-16 shrink-0 text-right" style={{ color: DIM }}>{fmt$(m.marketcap ?? 0)}</span>
                    <span className="min-w-0 flex-1 overflow-hidden text-right" style={{ color: FAINT }}>{bar(m.cap_pct ?? 0, 10)} <span style={{ color: DIM }}>{Math.round(m.cap_pct ?? 0)}%</span></span>
                    <span className="w-14 shrink-0 text-right" style={{ color: DIM }}>{m.stage}</span>
                  </div>
                );
              })}
            </Pane>

            <Pane title="EVENT LOG — tail -f neugrid.log" className="flex min-h-0 flex-1 flex-col">
              <div ref={logRef} className="min-h-0 flex-1" style={{ overflowY: "auto" }}>
                {logLines.slice(0, logN).map((l: any, i: number) => (
                  <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: FAINT }}>{l.at}</span>{" "}
                    <span style={{ color: (l.delta ?? 0) >= 0 ? GREEN : RED }}>[{(l.delta ?? 0) >= 0 ? "+" : ""}{l.delta}]</span>{" "}
                    <span style={{ color: DIM }}>{l.text}</span>
                  </div>
                ))}
                <span className="tcur">█</span>
              </div>
            </Pane>
          </div>

          {/* RIGHT rail — signal + the stack */}
          <div className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto pt-2.5">
            <Pane title="SIGNAL">
              <div style={{ color: DIM }}>reputation · cumulative</div>
              <div style={{ fontSize: 15, letterSpacing: 1 }}>{spark(me?.rep_series ?? [], 24)}</div>
              <div className="mt-2" style={{ color: DIM }}>income · lifetime</div>
              <div style={{ fontSize: 15, letterSpacing: 1 }}>{spark(me?.income?.series ?? [], 24)}</div>
              <div className="mt-3" style={{ borderTop: `1px dashed ${FAINT}`, paddingTop: 6 }}>
                <Row k="x402 revenue" v={`${(econ?.x402?.revenue ?? 0).toFixed(2)} USDC`} />
                <Row k="credentials" v={`${econ?.credentials?.issued ?? econ?.credentials?.total ?? 0} soulbound`} />
                <Row k="agents live" v={`${econ?.agents?.total ?? 0} · ${econ?.agents?.trusted ?? 0} trusted`} />
              </div>
            </Pane>

            <Pane title="GRIDS">
              {grids.slice(0, 6).map((g: any) => (
                <div key={g.grid_id} className="flex items-baseline gap-2" style={{ padding: "1.5px 0" }}>
                  <span style={{ color: FAINT }}>›</span>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span style={{ color: DIM }}>{(g.members?.length ?? g.member_count ?? 0) || ""}</span>
                </div>
              ))}
            </Pane>

            <Pane title="STACK">
              <Row k="chain mode" v="solana · devnet" />
              <Row k="contract rails" v="7/7 live" />
              <Row k="icp mirrors" v="hosting · signer · cron" vColor={AMBER} />
              <Row k="facilitator" v="coinbase cdp" />
              <Row k="brain" v="claude · live" />
              <div className="mt-2" style={{ color: FAINT }}>every number above is real</div>
            </Pane>
          </div>
        </div>

        {/* keybar — the app is keyboard-first from here */}
        <div className="fixed inset-x-0 bottom-0" style={{ background: "#000", borderTop: `1px solid ${LINE}` }}>
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2" style={{ fontSize: 11.5 }}>
            {([["b", "build"], ["t", "trade"], ["a", "agents"], ["g", "grids"], ["p", "profile"], ["h", "home"]] as [string, string][]).map(([k, label]) => (
              <span key={k}>
                <span style={{ background: GREEN, color: "#000", padding: "0 5px", fontWeight: 700 }}>{k}</span>
                <span style={{ color: DIM }}> {label}</span>
              </span>
            ))}
            <span className="ml-auto" style={{ color: FAINT }}>NEUGRID TERMINAL · design lab /labs/terminal</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .tcur { animation: tblink 1.06s steps(1) infinite; color: ${GREEN}; }
        @keyframes tblink { 50% { opacity: 0; } }
        /* terminal selection = inverse video, the only hover effect that exists */
        .thl:hover { background: ${GREEN}; }
        .thl:hover, .thl:hover * { color: #000 !important; }
      `}</style>
    </div>
  );
}
