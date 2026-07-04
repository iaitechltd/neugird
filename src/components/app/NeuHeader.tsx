"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import NeuGridMark from "@/components/NeuGridMark";
import PulseMonitor from "./PulseMonitor";
import StartNewButton from "./StartNewButton";
import UserMenu from "./UserMenu";
import WalletConnect from "./WalletConnect";
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
  "/home": "Home", "/tradex": "Trade", "/echo": "Echo", "/me": "Profile",
  "/profile": "Dashboard", "/grids": "Grids", "/agents": "Agents",
  "/talentx": "Talent", "/campaignx": "Campaign", "/gridx": "GridX", "/genesis": "Fund",
};
export function pageName(path: string) {
  if (NAMES[path]) return NAMES[path];
  if (path.startsWith("/agents/studio")) return "Studio";
  if (path.startsWith("/agents/")) return "Agent";
  if (path.startsWith("/trade/")) return "Trade";
  if (path.startsWith("/talent/")) return "Talent";
  if (path.startsWith("/campaignx/")) return "Campaign";
  if (path.startsWith("/gridx/")) return "GridX";
  if (path.startsWith("/genesis/")) return "Fund";
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
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative z-10 mx-auto mt-[12vh] w-full max-w-xl px-4 font-mono">
        <div className="border border-neon/16 bg-black">
          {/* prompt input line */}
          <div className="flex items-center gap-2 border-b border-neon/10 px-3 py-2.5">
            <span className="shrink-0 text-[13px] text-neon">grid<span className="text-ink-faint">://</span>search</span>
            <span className="shrink-0 text-neon">»</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) open(hits[0]); }}
              placeholder="grids · people · agents · jobs · markets · builds"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
            {busy && <span className="ng-tcursor shrink-0">█</span>}
            <kbd className="shrink-0 border border-line px-1.5 py-0.5 text-[9px] text-ink-faint">esc</kbd>
          </div>
          <div className="max-h-[46vh] overflow-y-auto py-1 text-[12px]">
            {q.trim().length < 2 ? (
              <p className="px-3 py-3 text-[11px] text-ink-dim">{"// type ≥2 chars — searches everything live on the grid"}</p>
            ) : busy && hits.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-ink-dim">{"// searching…"}</p>
            ) : hits.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-ink-dim">{"// no matches for "}&ldquo;{q}&rdquo;</p>
            ) : (
              hits.map((h, i) => (
                <button key={`${h.href}-${i}`} onClick={() => open(h)} className="thl flex w-full items-baseline gap-2.5 px-3 py-1.5 text-left">
                  <span className={`w-14 shrink-0 text-[9px] uppercase tracking-wider ${KIND_TINT[h.kind] ?? "text-ink-dim"}`}>{h.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{h.title}</span>
                  <span className="hidden max-w-[40%] shrink truncate text-[10px] text-ink-faint sm:block">{h.sub}</span>
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
      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[326px] border border-neon/16 bg-black font-mono">
        <div className="flex items-center justify-between border-b border-neon/10 px-3 py-2">
          <span className="ng-label !text-[10px]">notifications</span>
          <span className="text-[9px] text-ink-faint">{notes.length} pending</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {notes.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-ink-dim">{"// all caught up — nothing needs you"}</p>
          ) : (
            notes.map((n, i) => {
              const Ico = NOTE_ICON[n.kind] ?? IconCheck; // unknown kinds must never crash the bell
              return (
                <button key={i} onClick={() => { onClose(); router.push(n.href); }} className="thl flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[12px]">
                  <span className={`shrink-0 ${n.kind === "message" ? "text-cyan" : "text-neon"}`}><Ico className="h-3.5 w-3.5 translate-y-0.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug text-ink">{n.text}</span>
                    {n.sub && <span className="block truncate text-[10px] text-ink-faint">{n.sub}</span>}
                  </span>
                  <span className="shrink-0 text-ink-faint">›</span>
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

  // Referral capture: a ?ref=<code> on ANY page sets a 30-day cookie; SIWS
  // signup binds it (nothing pays until the referred user does verified work).
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[a-z0-9_.-]{2,40}$/i.test(ref)) {
      document.cookie = `ng_ref=${encodeURIComponent(ref)}; path=/; max-age=${30 * 86400}; samesite=lax`;
    }
  }, []);

  // Live Pulse from the current identity (/api/me); refreshes on demand so an
  // action like creating a Grid makes the number tick up immediately.
  const [livePulse, setLivePulse] = useState(pulse);
  const [operator, setOperator] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => { if (alive && typeof d?.pulse === "number") setLivePulse(d.pulse); if (alive && d?.username) setOperator(String(d.username)); })
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
    <header className="sticky top-0 z-40 shrink-0 border-b border-neon/20 bg-black">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="NeuGrid — landing"><NeuGridMark size={30} /></Link>
          <span className="min-w-[16ch] text-[13px]">
            <span className="text-ink-dim">{operator || "guest"}@neugrid</span>
            <span className="text-ink-faint">:~$ </span>
            <span className="font-bold text-neon"><Typewriter key={name} text={name.toLowerCase()} cursor /></span>
          </span>
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
          <WalletConnect align="right" />
          <UserMenu />
        </div>
      </div>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
