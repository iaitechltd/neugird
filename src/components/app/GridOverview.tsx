/**
 * "Grid Overview" right-panel tab — rebuilt in the NeuGrid v2 language
 * (flat thin-stroke cards, neon line icons, highlighted text, fitting charts).
 */

import { Mark } from "./ui";
import {
  IconGlobe, IconBolt, IconUser, IconStar, IconCoins, IconShield,
  IconPlus, IconLayers, IconRocket, IconChart,
} from "./ui";
import { Spark, Bars, Ring } from "./charts";

const globalStats: [string, string][] = [
  ["Total Grids", "1,247"], ["SubGrids", "3,892"], ["GridX Apps", "456"],
  ["Revenue", "$2.4M"], ["Pulse", "12.8M"], ["Users", "45.2K"],
];
const trending: [string, string, string, number[]][] = [
  ["AI Research Hub", "+45%", "892 members", [20, 28, 24, 36, 32, 48, 44, 60]],
  ["DeFi Protocol", "+32%", "1.2K members", [30, 34, 31, 40, 38, 46, 50, 58]],
];
const ecosystem: [string, string, boolean][] = [
  ["My Grids", "3", false], ["My SubGrids", "12", false], ["GridX Projects", "2", false],
  ["My Ranking", "#247", true], ["Total Earnings", "2,450", true],
];
const topGrids: [string, string, string, string][] = [
  ["1", "Neural Network", "5.2K", "+89%"],
  ["2", "Quantum AI", "4.8K", "+67%"],
  ["3", "Web3 Builders", "3.8K", "+45%"],
];
const economy: [string, string][] = [
  ["Pulse Circulation", "12.8M"], ["NeuroBits Minted", "456K"], ["Top Earners", "$89K/week"],
];
const quickActions: { icon: React.ReactNode; label: string }[] = [
  { icon: <IconPlus className="h-3.5 w-3.5" />, label: "Create New Grid" },
  { icon: <IconLayers className="h-3.5 w-3.5" />, label: "Create SubGrid" },
  { icon: <IconRocket className="h-3.5 w-3.5" />, label: "Launch GridX Project" },
  { icon: <IconChart className="h-3.5 w-3.5" />, label: "View Analytics" },
];

function Sec({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="ng-card mt-3 p-3.5">
      <div className="ng-label mb-2.5 flex items-center gap-2 !text-ink-dim">
        <span className="text-neon">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

export default function GridOverview({ onNotify }: { onNotify: (m: string) => void }) {
  return (
    <div>
      <button onClick={() => onNotify("Create New Grid")} className="ng-btn ng-btn-primary ng-btn--block mt-3"><IconPlus className="h-3.5 w-3.5" /> Create New Grid</button>

      <Sec icon={<IconGlobe className="h-3.5 w-3.5" />} title="Global Stats">
        <Spark data={[40, 52, 48, 64, 60, 78, 72, 96]} gid="goGrowth" w={260} h={32} />
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
          {globalStats.map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] text-ink-dim">{k}</div>
              <div className="text-sm font-bold text-neon tnum">{v}</div>
            </div>
          ))}
        </div>
      </Sec>

      <Sec icon={<IconBolt className="h-3.5 w-3.5" />} title="Trending Now">
        <div className="divide-y divide-line">
          {trending.map(([name, pct, members, data]) => (
            <div key={name} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-ink">{name}</span><Mark plain>{pct}</Mark></div>
                <div className="text-[10px] text-ink-dim">{members}</div>
              </div>
              <Spark data={data} gid={`go-${name.replace(/\s/g, "")}`} w={48} h={24} />
            </div>
          ))}
        </div>
      </Sec>

      <Sec icon={<IconUser className="h-3.5 w-3.5" />} title="My Ecosystem">
        <div className="divide-y divide-line">
          {ecosystem.map(([k, v, hi]) => (
            <div key={k} className="ng-row !py-2">
              <span className="ng-row__k">{k}</span>
              {hi ? <Mark plain accent="cyan">{v}</Mark> : <span className="ng-row__v">{v}</span>}
            </div>
          ))}
        </div>
      </Sec>

      <Sec icon={<IconStar className="h-3.5 w-3.5" />} title="Top Grids">
        <Bars data={[5.2, 4.8, 3.8]} h={40} />
        <div className="mt-2 divide-y divide-line">
          {topGrids.map(([rank, name, val, pct]) => (
            <div key={name} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-4 font-bold text-neon/50">{rank}</span>
              <span className="flex-1 truncate text-ink">{name}</span>
              <span className="text-ink-dim tnum">{val}</span>
              <Mark plain>{pct}</Mark>
            </div>
          ))}
        </div>
      </Sec>

      <Sec icon={<IconCoins className="h-3.5 w-3.5" />} title="Economy">
        <div className="divide-y divide-line">
          {economy.map(([k, v]) => (
            <div key={k} className="ng-row !py-2"><span className="ng-row__k">{k}</span><Mark plain>{v}</Mark></div>
          ))}
        </div>
      </Sec>

      <Sec icon={<IconShield className="h-3.5 w-3.5" />} title="Governance">
        <div className="flex items-center gap-4">
          <Ring percent={68} value="7" label="Active" size={74} />
          <div className="flex-1 space-y-1.5 text-[11px]">
            <div className="flex justify-between"><span className="text-ink-dim">Voting ends</span><span className="text-ink">2d 14h</span></div>
            <div className="flex justify-between"><span className="text-ink-dim">DAO Treasury</span><Mark plain accent="cyan">$2.4M</Mark></div>
            <button onClick={() => onNotify("Governance center")} className="ng-btn ng-btn--sm ng-btn--block mt-1">Vote Now</button>
          </div>
        </div>
      </Sec>

      <Sec icon={<IconBolt className="h-3.5 w-3.5" />} title="Quick Actions">
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((a, i) => (
            <button key={a.label} onClick={() => onNotify(a.label)} className={`ng-btn ng-btn--sm justify-start ${i === 0 ? "ng-btn-primary" : "ng-btn-ghost"}`}>
              {a.icon}<span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>
      </Sec>
    </div>
  );
}
