"use client";

/**
 * THE RACK — the builder's TOOLBOX, on the Echo hub (Phase 6b+). One `[ TOOLBOX ]`
 * pane with a RACK ⇄ CATALOG toggle. Set your gear up ONCE here — it flows into
 * every workshop you open. Each item kind reads as a distinct object, never a text
 * list: SKILLS are cartridges (a glyph identity), PLUGINS are magazines (bundles,
 * cyan), PORTS are patch-bay rows (live services). A continuous accent rail down
 * the left of the gear bands means "current flows into every build."
 *
 * Design: the "THE RACK" direction (workflow judge synthesis, 2026-07-19). Pure
 * phosphor, radius 0, flat (ring={false} on every glyph), green voice + cyan for
 * plugins/money + amber/red for degraded/down ports. No fourth hue. Secrets are
 * entered here but never echoed — the server returns only masked key-names.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Panel, Mark, IconBolt, IconLayers, IconCode, IconActivity } from "@/components/app/ui";
import { PulseDot } from "@/components/app/venture-ui";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";

type Conn = { name: string; kind: string; command: string; secret: string | null; added_at: string };
type Skill = { published_id: string; name: string; title: string; at: string };
type Plug = { published_id: string; name: string; title: string; files: number; at: string };
type StoreItem = { published_id: string; title: string; summary?: string; price_grid: number; installs: number; author: string; installed: boolean; mine: boolean; files?: number };
type Cat = { kind: string; label: string; desc: string; needs: { label: string; placeholder: string } | null };
type View = { connections: Conn[]; skills: Skill[]; plugins: Plug[]; skill_store: StoreItem[]; plugin_store: StoreItem[]; mcp_catalog: Cat[] };

const HAIR = "rgba(0,255,0,0.16)";

export default function BuilderToolbox({ wide = false }: { wide?: boolean } = {}) {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"rack" | "catalog">("rack");
  const [filter, setFilter] = useState<"all" | "skills" | "plugins" | "free">("all");
  const [connOpen, setConnOpen] = useState(false);
  const [conn, setConn] = useState({ kind: "remote", value: "", command: "", args: "", url: "", header: "" });
  const [wired, setWired] = useState<string | null>(null); // transient "✓ wired" note — the form stays open for the next one

  const load = useCallback(() => { fetch("/api/toolbox").then((r) => (r.ok ? r.json() : null)).then((j) => j && setV(j)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>) => {
    if (busy) return null;
    setBusy(true);
    const r = await fetch("/api/toolbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.view) setV(r.view); else load();
    return r;
  };
  const connectGo = async () => {
    const r = await act({ action: "mcp_add", kind: conn.kind, value: conn.value, command: conn.command, args: conn.args, url: conn.url, header: conn.header });
    if (r?.ok) {
      // stay open — wiring several services in a row is the normal case
      setConn({ kind: "remote", value: "", command: "", args: "", url: "", header: "" });
      setWired("wired ✓ — it now reaches every workshop. Add another?");
      setTimeout(() => setWired(null), 5000);
    }
  };
  const openWire = () => { setTab("rack"); setConnOpen(true); };
  const browse = (f: "skills" | "plugins") => { setTab("catalog"); setFilter(f); };

  const skills = v?.skills ?? [];
  const plugins = v?.plugins ?? [];
  const ports = v?.connections ?? [];
  const rackEmpty = skills.length + plugins.length + ports.length === 0;
  const store = [
    ...(filter === "plugins" ? [] : (v?.skill_store ?? []).map((p) => ({ ...p, kind: "skill" as const }))),
    ...(filter === "skills" ? [] : (v?.plugin_store ?? []).map((p) => ({ ...p, kind: "plugin" as const }))),
  ].filter((p) => (filter === "free" ? p.price_grid === 0 : true) && !p.installed)
    .sort((a, b) => b.installs - a.installs);

  return (
    <Panel title={wide ? `TOOLBOX — THE RACK · ${skills.length + plugins.length + ports.length} loaded` : `TOOLBOX ·${skills.length + plugins.length + ports.length}`} icon={<IconBolt className="h-4 w-4" />}
      className={wide ? "" : "!border-neon/30"} bodyClass={wide ? "p-4" : "p-3.5"}
      action={
        <span className="pointer-events-auto flex border border-neon/25 text-[9px] tracking-wider">
          {(["rack", "catalog"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2 py-0.5 transition-colors ${tab === t ? "bg-neon/15 text-neon" : "text-ink-faint hover:text-ink-dim"}`}>
              {t === "rack" ? "RACK" : "CATALOG"}
            </button>
          ))}
        </span>
      }>

      {/* ═══ RACK — the gear you've equipped, flowing into every workshop.
           Every band ALWAYS renders and ALWAYS carries its door — an empty band
           is an invitation, not a blank (founder: "how do I connect?!"). ═══ */}
      {wide
        ? <p className="-mt-0.5 mb-3 text-[12px] leading-relaxed text-ink-dim">One rack for everything you build with — <span className="text-neon">skills</span>, <span className="text-cyan">plugin bundles</span>, and <span className="text-neon">live service ports</span> (GitHub · databases · search · email &amp; 7,000+ apps). Load it once here; it flows into every workshop and Studio room automatically.</p>
        : <p className="-mt-0.5 mb-2.5 text-[10px] leading-relaxed text-ink-dim"><span className="text-neon">Skills</span> · <span className="text-cyan">plugins</span> · <span className="text-neon">service ports</span> — loaded once, they flow into every workshop.</p>}
      {tab === "rack" && (
        <div className="space-y-3">
          {rackEmpty && <p className="text-[11px] text-ink-dim">Empty rack — everything you load here flows into every workshop you open.</p>}
          {/* SKILLS + PLUGINS share a left "bus rail" — current flows into every build */}
          {(
            <div className="relative pl-2.5">
              <span className="absolute bottom-1 left-0 top-1 w-0.5 bg-neon/50" aria-hidden />

              <Band label="skills" n={skills.length} action={
                <button onClick={() => browse("skills")} className="border border-neon/40 px-1.5 py-px text-[9px] tracking-wider text-neon transition-colors hover:bg-neon/10">+ load</button>
              } />
              {skills.length === 0 && (
                <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">
                  none loaded — <button onClick={() => browse("skills")} className="text-neon hover:underline">pick from the catalog</button> or <Link href="/skills" className="text-neon hover:underline">write your own ›</Link>
                </p>
              )}
              {skills.length > 0 && (
                <div className={`mb-1 grid gap-2 ${wide ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2"}`}>
                  {skills.map((s) => (
                    <div key={s.published_id} className="group relative border-l-2 border-neon/60 bg-neon/[0.03] p-2" style={{ border: `1px solid ${HAIR}`, borderLeftWidth: 2, borderLeftColor: "#00ff00" }}>
                      <MatrixAvatar seed={s.name} size={34} shape="square" ring={false} />
                      <div className="mt-1.5 truncate text-[11px] text-neon" title={s.title}>{s.title}</div>
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-ink-faint">
                        <span title="flows into every workshop">⌂</span>
                        <PulseDot tone="neon" size={5} /><span className="ml-auto">in rack</span>
                        <button onClick={() => void act({ action: "skill_remove", published_id: s.published_id })} disabled={busy}
                          className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100" title="eject">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Band label="plugins" n={plugins.length} accent="cyan" action={
                <button onClick={() => browse("plugins")} className="border border-cyan/40 px-1.5 py-px text-[9px] tracking-wider text-cyan transition-colors hover:bg-cyan/10">+ load</button>
              } />
              {plugins.length === 0 && (
                <p className="mb-1 text-[10px] leading-relaxed text-ink-faint">
                  none — <button onClick={() => browse("plugins")} className="text-cyan hover:underline">pick a bundle</button> or <Link href="/skills" className="text-cyan hover:underline">bundle your own ›</Link>
                </p>
              )}
              <div className={wide ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" : "contents"}>
              {plugins.map((p) => (
                <div key={p.published_id} className="group mb-1 bg-cyan/[0.03] p-2" style={{ border: `1px solid ${HAIR}`, borderLeftWidth: 2, borderLeftColor: "#48f5ff" }}>
                  <div className="flex items-center gap-2">
                    <MatrixAvatar seed={p.name} size={24} shape="square" ring={false} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-cyan" title={p.title}>{p.title}</span>
                    <Mark plain accent="cyan" className="!text-[9px]">BUNDLE</Mark>
                  </div>
                  <div className="mt-1.5 flex items-end gap-2">
                    {/* the "magazine" — component count made physical */}
                    <span className="flex items-end gap-0.5" title={`${p.files} components`}>
                      {Array.from({ length: Math.min(p.files, 8) }).map((_, i) => (
                        <span key={i} className="w-0.5 bg-cyan/70" style={{ height: 6 + (i % 3) * 3 }} />
                      ))}
                    </span>
                    <span className="text-[9px] text-ink-faint">{p.files} components</span>
                    <span className="ml-auto flex items-center gap-1 text-[9px] text-ink-faint">
                      <span title="flows into every workshop">⌂</span>
                      <button onClick={() => void act({ action: "plugin_remove", published_id: p.published_id })} disabled={busy}
                        className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100" title="eject">✕</button>
                    </span>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* PORTS — live services (patch-bay rows, not cards, no bus rail) */}
          <div>
            <Band label="ports · live services" n={ports.length} action={
              <button onClick={() => setConnOpen((o) => !o)} className="border border-neon/40 px-1.5 py-px text-[9px] tracking-wider text-neon transition-colors hover:bg-neon/10">+ wire a port</button>
            } />
            {ports.length === 0 && !connOpen && (
              <p className="text-[10px] leading-relaxed text-ink-faint">
                nothing wired — GitHub · databases · web search · Notion · Maps, or <button onClick={() => setConnOpen(true)} className="text-neon hover:underline">email &amp; 7,000+ apps by MCP URL ›</button>
              </p>
            )}
            <div className={wide ? "grid grid-cols-1 gap-x-6 sm:grid-cols-2" : "contents"}>
            {ports.map((c) => (
              <div key={c.name} className="group flex items-center gap-2 py-1 text-[11px]">
                <PulseDot tone="neon" size={6} />
                <IconCode className="h-3.5 w-3.5 shrink-0 text-ink-dim" />
                <span className="min-w-0 flex-1 truncate text-ink" title={c.command}>{c.name} <span className="text-ink-faint">· {c.kind}</span></span>
                {c.secret && <span className="ng-tag !text-[8px] !text-ink-faint" title="secret held server-side">🔒 {c.secret}</span>}
                <button onClick={() => void act({ action: "mcp_remove", name: c.name })} disabled={busy}
                  className="shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100" title="unwire">✕</button>
              </div>
            ))}
            </div>
            {wired && <p className="mt-1 text-[10px] text-neon">{wired}</p>}
            {connOpen && <ConnectForm v={v} conn={conn} setConn={setConn} onGo={() => void connectGo()} onClose={() => setConnOpen(false)} busy={busy} />}
          </div>
        </div>
      )}

      {/* ═══ CATALOG — the community SHELF. Same physical-object grammar as the
           RACK (founder: "improve that tab too"): items are cartridges on a shelf
           with a visible PRICE row and a real install button, filters are a
           segmented control, live services get their own band. ═══ */}
      {tab === "catalog" && (
        <div className="space-y-3">
          <p className="-mt-0.5 text-[10px] leading-relaxed text-ink-dim">The community shelf — <span className="text-neon">install</span> what others built, <span className="text-neon">publish</span> yours and earn GRID on every install.</p>

          {/* segmented filter — a proper control, not loose chips */}
          <div className="flex border border-neon/25 text-[9px] tracking-wider">
            {(["all", "skills", "plugins", "free"] as const).map((f, i) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 px-1 py-1 uppercase transition-colors ${i > 0 ? "border-l border-neon/15" : ""} ${filter === f ? "bg-neon/15 text-neon" : "text-ink-faint hover:text-ink-dim"}`}>{f}</button>
            ))}
          </div>

          {/* THE SHELF */}
          <div>
            <Band label="the shelf" n={store.length} />
            {store.length === 0 && <p className="py-1.5 text-[11px] leading-relaxed text-ink-dim">Nothing here{filter !== "all" ? " under this filter" : " yet"} — <Link href="/skills" className="text-neon hover:underline">write a skill or bundle a plugin ›</Link> and earn GRID per install.</p>}
            <div className={wide ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
              {store.map((p) => (
                <div key={p.published_id} className={`group p-2.5 transition-colors ${p.kind === "plugin" ? "bg-cyan/[0.03] hover:!border-cyan/40" : "bg-neon/[0.03] hover:!border-neon/40"}`}
                  style={{ border: `1px solid ${HAIR}`, borderLeftWidth: 2, borderLeftColor: p.kind === "plugin" ? "#48f5ff" : "#00ff00" }}>
                  <div className="flex items-center gap-2.5">
                    <MatrixAvatar seed={p.title} size={34} shape="square" ring={false} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[12px] ${p.kind === "plugin" ? "text-cyan" : "text-neon"}`} title={p.title}>{p.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink-faint">
                        <MatrixAvatar seed={p.author} size={11} shape="circle" ring={false} />
                        <span className="truncate">{p.author}</span>
                        <span className="tnum shrink-0">· ⇧ {p.installs} install{p.installs === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <Mark plain accent={p.kind === "plugin" ? "cyan" : undefined} className="!text-[8px] shrink-0">{p.kind === "plugin" ? `BUNDLE·${p.files ?? 0}` : "SKILL"}</Mark>
                  </div>
                  {p.summary && <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-ink-dim">{p.summary}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-neon/10 pt-2">
                    <span className={`text-[11px] tnum ${p.price_grid > 0 ? "text-neon" : "text-ink-faint"}`}>{p.mine ? "yours — free" : p.price_grid > 0 ? `${p.price_grid} GRID` : "FREE"}</span>
                    <button onClick={() => void act({ action: p.kind === "plugin" ? "plugin_install" : "skill_install", published_id: p.published_id })} disabled={busy}
                      className={`ng-btn ng-btn--sm !px-2.5 disabled:opacity-40 ${p.kind === "plugin" ? "ng-btn-cyan" : "ng-btn-primary"}`}>
                      <IconLayers className="h-3 w-3" /> Load it
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LIVE SERVICES — wired, not bought (its own band, mirroring the rack) */}
          <div>
            <Band label="live services" n={ports.length} action={
              <button onClick={openWire} className="border border-neon/40 px-1.5 py-px text-[9px] tracking-wider text-neon transition-colors hover:bg-neon/10">+ wire a port</button>
            } />
            <p className="text-[10px] leading-relaxed text-ink-faint">wired, not bought — GitHub · databases · search · Notion · Maps, or email &amp; 7,000+ apps by MCP URL.</p>
          </div>

          <div className="flex gap-2 border-t border-neon/10 pt-2">
            <Link href="/skills" className="ng-btn ng-btn-ghost ng-btn--sm flex-1 justify-center !text-[10px]"><IconBolt className="h-3 w-3" /> Write a skill</Link>
            <Link href="/skills" className="ng-btn ng-btn-ghost ng-btn--sm flex-1 justify-center !text-[10px]"><IconLayers className="h-3 w-3" /> Bundle a plugin</Link>
          </div>
          <p className="!mt-1.5 text-center text-[9px] text-ink-faint">yours to sell — earn GRID on every install</p>
        </div>
      )}
    </Panel>
  );
}

/** A band sub-label: `SKILLS ·N` with an optional right action. */
function Band({ label, n, accent, action }: { label: string; n: number; accent?: "cyan"; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-0.5 flex items-center gap-1.5">
      <span className={`ng-label !text-[9px] ${accent === "cyan" ? "!text-cyan/70" : "!text-ink-dim"}`}>{label}</span>
      <span className="text-[9px] text-ink-faint">·{n}</span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** The service-connect picker (MCP ports are wired, not bought). */
function ConnectForm({ v, conn, setConn, onGo, onClose, busy }: {
  v: View | null; conn: { kind: string; value: string; command: string; args: string; url: string; header: string };
  setConn: (c: { kind: string; value: string; command: string; args: string; url: string; header: string }) => void;
  onGo: () => void; onClose: () => void; busy: boolean;
}) {
  const options = [
    { kind: "remote", label: "Any MCP server (URL)", desc: "email, calendars & 7,000+ apps — Zapier/Composio and most services expose an MCP URL; paste it" },
    ...(v?.mcp_catalog ?? []),
    { kind: "custom", label: "Custom command", desc: "run a local MCP server" },
  ];
  return (
    <div className="mt-2 space-y-1.5 border-t border-neon/10 pt-2">
      {options.map((c) => (
        <button key={c.kind} onClick={() => setConn({ ...conn, kind: c.kind })}
          className={`flex w-full items-start gap-2 border p-1.5 text-left transition-colors ${conn.kind === c.kind ? "border-neon/60 bg-neon/[0.06]" : "border-neon/12 hover:border-neon/30"}`}>
          <span className={`mt-0.5 text-[9px] ${conn.kind === c.kind ? "text-neon" : "text-ink-faint"}`}>{conn.kind === c.kind ? "◉" : "○"}</span>
          <span className="min-w-0"><span className={`block text-[10px] ${conn.kind === c.kind ? "text-neon" : "text-ink"}`}>{c.label}</span><span className="block text-[9px] leading-snug text-ink-faint">{c.desc}</span></span>
        </button>
      ))}
      {conn.kind === "remote" && <>
        <input value={conn.url} onChange={(e) => setConn({ ...conn, url: e.target.value })} placeholder="https://mcp.zapier.com/… or any MCP server URL" className="ng-input w-full !py-1.5 text-[11px]" />
        <input value={conn.header} onChange={(e) => setConn({ ...conn, header: e.target.value })} placeholder="auth header (optional)" className="ng-input w-full !py-1.5 text-[11px]" />
      </>}
      {conn.kind === "custom" && <>
        <input value={conn.command} onChange={(e) => setConn({ ...conn, command: e.target.value })} placeholder="command — e.g. npx" className="ng-input w-full !py-1.5 text-[11px]" />
        <input value={conn.args} onChange={(e) => setConn({ ...conn, args: e.target.value })} placeholder="arguments" className="ng-input w-full !py-1.5 font-mono text-[10px]" />
      </>}
      {conn.kind !== "remote" && conn.kind !== "custom" && (() => {
        const cat = v?.mcp_catalog.find((c) => c.kind === conn.kind);
        return cat?.needs ? <input value={conn.value} onChange={(e) => setConn({ ...conn, value: e.target.value })} placeholder={`${cat.needs.label} — ${cat.needs.placeholder}`} type="password" className="ng-input w-full !py-1.5 text-[11px]" /> : <p className="text-[10px] text-ink-faint">no credentials needed.</p>;
      })()}
      <div className="flex items-center gap-2">
        <button onClick={onGo} disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-35"><IconActivity className="h-3 w-3" /> Wire it in</button>
        <button onClick={onClose} className="ng-btn ng-btn-ghost ng-btn--sm !px-2 !py-0.5">cancel</button>
      </div>
      <p className="text-[9px] leading-relaxed text-ink-faint">🔒 secrets stay on the server · runs inside the kernel jail</p>
    </div>
  );
}
