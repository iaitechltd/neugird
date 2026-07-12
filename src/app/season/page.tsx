"use client";

/**
 * /season — the earning SEASON: a live countdown + the leaderboard people race
 * up. Points = reward allocation earned inside the window (the same merit ledger,
 * scoped to now). The clock + the scoreboard are the pre-token growth loop.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Bracket, Mark, Tag, IconBolt, IconActivity, IconTarget, IconRocket, IconCoins, IconChevronDown } from "@/components/app/ui";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { CountUp } from "@/components/app/typefx";
import { Rise } from "@/components/app/motionfx";
import { Bars, Ring } from "@/components/app/charts";

type Racer = { rank: number; id: string; username: string; points: number };
type SeasonData = {
  season: { number: number; started_at: string; ends_at: string; days_left: number; pct_elapsed: number; ended: boolean };
  leaderboard: Racer[];
  standing: { points: number; rank: number | null; racers: number };
  cadence: { day: string; points: number }[];
  me: string;
};

function useCountdown(endsAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!endsAt) return { d: 0, h: 0, m: 0, s: 0, done: true };
  const left = Math.max(0, Date.parse(endsAt) - now);
  return {
    d: Math.floor(left / 86_400_000),
    h: Math.floor((left % 86_400_000) / 3_600_000),
    m: Math.floor((left % 3_600_000) / 60_000),
    s: Math.floor((left % 60_000) / 1000),
    done: left <= 0,
  };
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <div className="ng-stat__v !text-4xl leading-none text-neon tnum sm:!text-5xl">{String(n).padStart(2, "0")}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>
    </div>
  );
}

export default function SeasonPage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [d, setD] = useState<SeasonData | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/season").then((r) => r.json()).then((x) => setD(x)).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  const c = useCountdown(d?.season.ends_at);

  const board = d?.leaderboard ?? [];
  const maxPts = Math.max(1, ...board.map((r) => r.points));
  const cadence = d?.cadence ?? [];
  const st = d?.standing;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-3">
        {/* LEFT — your standing */}
        <OrbPanel side="left" label="You" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="YOUR SEASON" icon={<IconBolt className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <div className="ng-card p-4 text-center">
              <div className="ng-label !text-ink-dim">Your rank</div>
              <div className="ng-stat__v !text-4xl leading-none text-neon">{st?.rank ? `#${st.rank}` : "—"}</div>
              <div className="mt-1 text-[10px] text-ink-faint">{st?.racers ? `of ${st.racers} racers` : "score to get on the board"}</div>
              <div className="mt-3 border-t border-line pt-3">
                <div className="ng-stat__v !text-2xl text-neon tnum"><CountUp key={st?.points ?? 0} value={st?.points ?? 0} /></div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">season points</div>
              </div>
            </div>
            <div className="mt-4 flex justify-center"><Ring percent={d?.season.pct_elapsed ?? 0} value={`${d?.season.pct_elapsed ?? 0}%`} label="elapsed" size={120} stroke={7} /></div>

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Climb the board</div>
            <div className="space-y-2">
              <Link href="/echo" className="ng-card flex items-center gap-2.5 p-2.5 transition hover:!border-neon/40"><IconRocket className="h-4 w-4 text-neon/70" /><span className="text-[11px] text-ink">Ship a build with Echo</span></Link>
              <Link href="/jobs" className="ng-card flex items-center gap-2.5 p-2.5 transition hover:!border-neon/40"><IconActivity className="h-4 w-4 text-neon/70" /><span className="text-[11px] text-ink">Deliver an open job</span></Link>
              <Link href="/genesis/board" className="ng-card flex items-center gap-2.5 p-2.5 transition hover:!border-neon/40"><IconCoins className="h-4 w-4 text-neon/70" /><span className="text-[11px] text-ink">Back a raise that delivers</span></Link>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Points = the reward allocation you earn this season. Every verified action counts. The board snapshots when the clock hits zero.</p>
          </Panel>
        </OrbPanel>

        {/* CENTER — the clock + the board */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Rise>
          <Bracket className="ng-panel p-6 text-center">
            <div className="flex items-center justify-center gap-2">
              <Tag accent="cyan" className="!text-[10px]">LIVE</Tag>
              <span className="ng-title text-2xl font-bold text-neon">SEASON {d?.season.number ?? 0}</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-dim">Earn, and climb. The board snapshots at zero — no token, just the clock and the scoreboard.</p>
            <div className="mt-5 flex items-center justify-center gap-4 sm:gap-7">
              <Unit n={c.d} label="days" />
              <span className="ng-stat__v !text-3xl text-ink-faint sm:!text-4xl">:</span>
              <Unit n={c.h} label="hrs" />
              <span className="ng-stat__v !text-3xl text-ink-faint sm:!text-4xl">:</span>
              <Unit n={c.m} label="min" />
              <span className="ng-stat__v !text-3xl text-ink-faint sm:!text-4xl">:</span>
              <Unit n={c.s} label="sec" />
            </div>
            <div className="mx-auto mt-5 h-1.5 max-w-md overflow-hidden bg-neon/10">
              <div className="h-full bg-neon transition-all" style={{ width: `${d?.season.pct_elapsed ?? 0}%` }} />
            </div>
            <div className="mt-1.5 text-[10px] text-ink-faint">{c.done ? "season ended — snapshot taken" : `${d?.season.days_left ?? 0} days left · ${d?.season.pct_elapsed ?? 0}% elapsed`}</div>
          </Bracket>
          </Rise>

          {/* points-per-day cadence */}
          {cadence.some((x) => x.points > 0) && (
            <Rise>
            <div className="ng-panel p-4">
              <div className="ng-label mb-2 !text-ink-dim">[ SEASON CADENCE · POINTS / DAY ]</div>
              <Bars data={cadence.map((x) => x.points)} w={640} h={70} />
            </div>
            </Rise>
          )}

          {/* the leaderboard */}
          <div className="ng-label mb-1 mt-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconTarget className="h-3.5 w-3.5" /></span>The Board · {board.length} racers</div>
          {board.length ? (
            <div className="space-y-2">
              {board.map((r) => {
                const mine = r.id === d?.me;
                return (
                  <Rise key={r.id}>
                  <Link href={`/talent/${r.id}`} className={`ng-card group flex items-center gap-3 p-3 transition hover:!border-neon/50 ${mine ? "!border-neon/50 bg-neon/[0.04]" : ""}`}>
                    <span className={`ng-stat__v w-10 shrink-0 text-center !text-xl ${r.rank <= 3 ? "text-neon" : "text-ink-dim"}`}>{r.rank}</span>
                    <MatrixAvatar seed={r.username} size={34} shape="square" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-[13px] font-bold text-ink transition group-hover:text-neon">{r.username}{mine && <Mark plain accent="cyan" className="!text-[8px]">YOU</Mark>}</div>
                      <div className="mt-1 h-1 w-full overflow-hidden bg-neon/10"><div className="h-full bg-neon" style={{ width: `${Math.round((r.points / maxPts) * 100)}%` }} /></div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="ng-stat__v !text-lg leading-none text-neon tnum">{r.points.toLocaleString()}</div>
                      <div className="text-[9px] uppercase tracking-wide text-ink-faint">points</div>
                    </div>
                  </Link>
                  </Rise>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-ink-dim">{loaded ? "No one's on the board yet — be the first. Ship something and your points land here." : "—"}</p>
          )}
        </main>

        {/* RIGHT — how it works */}
        <OrbPanel label="Season" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="THE RULES" icon={<IconTarget className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <div className="ng-card p-3.5 text-[11.5px] leading-relaxed text-ink-dim">
              <p><span className="text-neon">Points = merit.</span> Every point is real reward allocation you earned by shipping, delivering, backing winners, or reviewing — the same soulbound ledger, scoped to this window.</p>
              <p className="mt-2"><span className="text-neon">The clock is the point.</span> When it hits zero the board snapshots. Where you land is your season standing — a number you can screenshot and race back up next season.</p>
              <p className="mt-2"><span className="text-neon">No pay-to-win.</span> You can&#39;t buy rank. Merit is the only ticket.</p>
            </div>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Top 3 · this season</div>
            {board.slice(0, 3).map((r) => (
              <div key={r.id} className="ng-row flex items-center !py-2 text-[12px]"><span className="ng-row__k flex items-center gap-2 text-ink"><span className="text-neon">{r.rank}</span>{r.username}</span><span className="ng-row__v tnum text-neon">{r.points.toLocaleString()}</span></div>
            ))}
            {!board.length && <p className="text-[11px] text-ink-faint">The podium is empty — claim it.</p>}
            <Link href="/leaderboard" className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-4">All-time leaderboard →</Link>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
