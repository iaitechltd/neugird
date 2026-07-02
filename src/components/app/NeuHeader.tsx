"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import NeuGridMark from "@/components/NeuGridMark";
import PulseMonitor from "./PulseMonitor";
import StartNewButton from "./StartNewButton";
import UserMenu from "./UserMenu";
import { IconActivity, IconBell, IconChart, IconCheck, IconConnect, IconMessage, IconSearch, IconShield, IconUser } from "./ui";
import { Typewriter } from "./typefx";

/** Clean ghost icon button for the header (no background, neon on hover). */
export function HeaderIcon({ children, onClick, label, badge, active }: { children: ReactNode; onClick?: () => void; label: string; badge?: number; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative grid h-9 w-9 place-items-center transition ${active ? "text-neon" : "text-ink-dim hover:text-neon"}`}
    >
      {children}
      {badge ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[10px] font-bold text-bg">{badge}</span> : null}
    </button>
  );
}

const NAMES: Record<string, string> = {
  "/home": "Home", "/tradex": "TradeX", "/echo": "Echo", "/me": "Profile",
  "/profile": "Dashboard", "/grids": "Grids", "/agents": "Agents",
  "/talentx": "TalenX", "/campaignx": "CampaignX", "/gridx": "GridX", "/genesis": "GenesisX",
};
export function pageName(path: string) {
  if (NAMES[path]) return NAMES[path];
  if (path.startsWith("/agents/studio")) return "Studio";
  if (path.startsWith("/agents/")) return "Agent";
  if (path.startsWith("/trade/")) return "Trade";
  if (path.startsWith("/talent/")) return "Talent";
  if (path.startsWith("/campaignx/")) return "Campaign";
  if (path.startsWith("/gridx/")) return "GridX";
  if (path.startsWith("/genesis/")) return "Genesis";
  if (path.startsWith("/subgrid/")) return "SubGrid";
  if (path.startsWith("/post/")) return "Post";
  return "NeuGrid";
}

/* ------------------------------ global search ------------------------------ */

type Hit = { kind: string; title: string; sub: string; href: string };
const KIND_TINT: Record<string, string> = { grid: "text-neon", person: "text-cyan", agent: "text-cyan", job: "text-amber", market: "text-neon", build: "text-neon", raise: "text-amber", product: "text-neon" };

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function search(text: string) {
    setQ(text);
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) { setHits([]); return; }
    setBusy(true);
    timer.current = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(text.trim())}`)
        .then((r) => r.json())
        .then((d) => { setHits(d.hits ?? []); setBusy(false); })
        .catch(() => setBusy(false));
    }, 180);
  }
  function open(h: Hit) {
    onClose();
    if (h.href.startsWith("/d/")) window.open(h.href, "_blank");
    else router.push(h.href);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 mx-auto mt-[12vh] w-full max-w-xl px-4">
        <div className="overflow-hidden rounded-xl border border-neon/25 bg-[#040d07]">
          <div className="flex items-center gap-2.5 border-b border-neon/15 px-4 py-3">
            <IconSearch className="h-4 w-4 shrink-0 text-neon/80" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) open(hits[0]); }}
              placeholder="Search grids, people, agents, jobs, markets, builds…"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
            <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[9px] text-ink-faint">esc</kbd>
          </div>
          <div className="max-h-[46vh] overflow-y-auto p-1.5">
            {q.trim().length < 2 ? (
              <p className="px-3 py-4 text-[11px] text-ink-dim">Type at least two characters — search covers everything live on the grid.</p>
            ) : busy && hits.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-ink-dim">Searching…</p>
            ) : hits.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-ink-dim">Nothing on the grid matches &ldquo;{q}&rdquo;.</p>
            ) : (
              hits.map((h, i) => (
                <button key={`${h.href}-${i}`} onClick={() => open(h)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-neon/[0.07]">
                  <span className={`w-14 shrink-0 text-[9px] uppercase tracking-wider ${KIND_TINT[h.kind] ?? "text-ink-dim"}`}>{h.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{h.title}</span>
                    <span className="block truncate text-[10.5px] text-ink-faint">{h.sub}</span>
                  </span>
                  <span className="shrink-0 text-ink-faint">›</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ notifications ------------------------------ */

type Note = { kind: "message" | "review" | "applicants" | "governance" | "fill" | "position" | "market" | "social"; text: string; sub?: string; href: string };
const NOTE_ICON: Record<Note["kind"], (p: { className?: string }) => React.JSX.Element> = { message: IconMessage, review: IconCheck, applicants: IconUser, governance: IconShield, fill: IconChart, position: IconActivity, market: IconChart, social: IconUser };

function BellDropdown({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  const router = useRouter();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-xl border border-neon/25 bg-[#040d07]">
        <div className="border-b border-neon/15 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neon/80">Notifications</div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {notes.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-ink-dim">You&rsquo;re all caught up — nothing needs you right now.</p>
          ) : (
            notes.map((n, i) => {
              const Ico = NOTE_ICON[n.kind] ?? IconCheck; // unknown kinds must never crash the bell
              return (
                <button key={i} onClick={() => { onClose(); router.push(n.href); }} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition hover:bg-neon/[0.07]">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded ${n.kind === "message" ? "bg-cyan/10 text-cyan" : "bg-neon/10 text-neon"}`}><Ico className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] leading-snug text-ink">{n.text}</span>
                    {n.sub && <span className="block truncate text-[10.5px] text-ink-faint">{n.sub}</span>}
                  </span>
                  <span className="mt-0.5 shrink-0 text-ink-faint">›</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The single shared NeuGrid app header.
 * Logo (→ landing) · page name typewritten · live Pulse · real search (⌘K) ·
 * real notifications · Start New. `onSearch`/`onBell` are accepted for backwards
 * compatibility but the header now handles both itself.
 */
export default function NeuHeader(props: {
  pulse?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** deprecated — the header opens its own search/notifications now */
  onSearch?: () => void;
  /** deprecated — the header opens its own search/notifications now */
  onBell?: () => void;
  title?: string;
}) {
  const { pulse = 872, collapsed, onToggleCollapse, title } = props;
  const pathname = usePathname() || "";
  const name = title || pageName(pathname);

  // Live Pulse from the current identity (/api/me); refreshes on demand so an
  // action like creating a Grid makes the number tick up immediately.
  const [livePulse, setLivePulse] = useState(pulse);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => { if (alive && typeof d?.pulse === "number") setLivePulse(d.pulse); })
        .catch(() => {});
    const loadNotes = () =>
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((d) => { if (alive) { setNotes(d.notes ?? []); setBadge(d.badge ?? 0); } })
        .catch(() => {});
    load();
    loadNotes();
    const iv = window.setInterval(loadNotes, 30000);
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("neugrid:refresh-me", load);
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.clearInterval(iv); window.removeEventListener("neugrid:refresh-me", load); window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-neon/20 bg-black/55 backdrop-blur" style={{ boxShadow: "0 0 18px rgba(0,255,0,0.18)" }}>
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="NeuGrid — landing"><NeuGridMark size={30} /></Link>
          <span className="ng-title min-w-[7ch] text-xl font-bold tracking-tight text-neon"><Typewriter key={name} text={name} cursor /></span>
        </div>

        <div className="hidden lg:block">
          <PulseMonitor value={livePulse} />
        </div>

        <div className="flex items-center gap-1.5">
          <StartNewButton />
          {onToggleCollapse && (
            <HeaderIcon active={collapsed} onClick={onToggleCollapse} label="Collapse panels">
              <IconConnect className="h-4 w-4" />
            </HeaderIcon>
          )}
          <HeaderIcon onClick={() => setSearchOpen(true)} label="Search (⌘K)"><IconSearch className="h-4 w-4" /></HeaderIcon>
          <div className="relative">
            <HeaderIcon active={bellOpen} onClick={() => setBellOpen((v) => !v)} label="Notifications" badge={badge}><IconBell className="h-4 w-4" /></HeaderIcon>
            {bellOpen && <BellDropdown notes={notes} onClose={() => setBellOpen(false)} />}
          </div>
          <UserMenu />
        </div>
      </div>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
