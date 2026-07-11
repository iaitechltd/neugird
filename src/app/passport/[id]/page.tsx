"use client";

/**
 * Reputation Passport — a compact machine-readable sovereign-identity document
 * for a human or an AI agent. Portable, verifiable, shareable. Portrait + data
 * page + soulbound "visa" stamps + a real scannable QR + an MRZ strip; one
 * cohesive security-scan animation (reduced-motion safe). Soulbound = un-launderable.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconShield, IconCheck, IconArrowRight } from "@/components/app/ui";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import ShareButton from "@/components/app/ShareButton";

type Cred = { schema: string; title: string; issued_at: string; onchain?: { mint?: string; tx?: string; cluster?: string } };
type Passport = {
  kind: "user" | "agent"; id: string; name: string; wallet?: string; joined_at?: string;
  reputation: { total: number; by_dimension: Record<string, number> };
  credentials: Cred[]; track_record: Record<string, number>; soulbound: boolean; verify_hash: string; issued_at: string;
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10).replace(/-/g, " ") : "—");
const pad = (s: string, n: number) => (s + "<".repeat(n)).slice(0, n);
const mrzText = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "<");
const label = (k: string) => k.replace(/_/g, " ").replace(/\bx10\b/, "");
const DIMS = ["builder", "creator", "backer", "reviewer", "agent"];

export default function PassportPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [p, setP] = useState<Passport | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/passport/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      setP(d?.passport ?? null); setQr(d?.qr_svg ?? null); setShareUrl(d?.share_url ?? "");
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id]);

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl || window.location.href).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }
  function copySnippet(key: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopiedKey(key); window.setTimeout(() => setCopiedKey(""), 1600); }).catch(() => {});
  }

  const kindCode = p?.kind === "agent" ? "AGENT" : "HUMAN";
  const docNo = (p?.id ?? "").replace(/^usr_|^agent_/, "").toUpperCase().slice(0, 12);
  const hashCore = (p?.verify_hash ?? "").replace("ngpp:sha256:", "").toUpperCase();
  const repMax = p ? Math.max(1, ...Object.values(p.reputation.by_dimension), 1) : 1;
  const nameM = mrzText(p?.name ?? "");
  const mrz1 = pad(`P<NGD${kindCode}<<${nameM}`, 40);
  const mrz2 = pad(`${pad(docNo, 12)}<NGD<${kindCode}<${pad(hashCore, 16)}`, 40);

  // embeddable badge — absolute URLs derived from the share_url origin
  const origin = shareUrl.replace(/\/passport\/[^/]*$/, "");
  const badgeUrl = origin ? `${origin}/api/passport/${id}/badge.svg` : "";
  const mdSnippet = `[![NeuGrid verified](${badgeUrl})](${shareUrl})`;
  const htmlSnippet = `<a href="${shareUrl}"><img src="${badgeUrl}" alt="NeuGrid verified" height="30" /></a>`;
  const shareText = `${p?.name ?? "This"} — verified NeuGrid reputation passport. Soulbound, earned by real work.`;

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 sm:py-9">
      <style>{`
        @keyframes ngpScan { 0%{top:-6%;opacity:0} 12%{opacity:.4} 88%{opacity:.4} 100%{top:104%;opacity:0} }
        @keyframes ngpHolo { 0%,100%{filter:hue-rotate(0deg) saturate(1.1)} 50%{filter:hue-rotate(70deg) saturate(1.4)} }
        @keyframes ngpGlow { 0%,100%{opacity:.25} 50%{opacity:.5} }
        @keyframes ngpQrScan { 0%{top:2%} 100%{top:96%} }
        .ngpScan{animation:ngpScan 7s cubic-bezier(.4,0,.2,1) infinite}
        .ngpHolo{animation:ngpHolo 5s ease-in-out infinite}
        .ngpGlow{animation:ngpGlow 3.6s ease-in-out infinite}
        .ngpQr svg{filter:drop-shadow(0 0 3px rgba(61,255,136,.55))}
        .ngpQrScan{animation:ngpQrScan 2.6s ease-in-out infinite alternate}
        @media (prefers-reduced-motion: reduce){ .ngpScan,.ngpHolo,.ngpGlow,.ngpQrScan{animation:none} .ngpScan,.ngpQrScan{display:none} }
      `}</style>

      <div className="mx-auto max-w-xl">
        <div className="mb-3 flex items-center justify-between text-[9px] tracking-[0.25em] text-ink-faint">
          <Link href="/" className="transition hover:text-neon">◂ NEUGRID</Link>
          <span>SOVEREIGN IDENTITY · VERIFIABLE</span>
        </div>

        {!loaded ? (
          <div className="ng-panel p-14 text-center text-sm text-ink-dim">Reading passport…</div>
        ) : !p ? (
          <div className="ng-panel p-14 text-center"><div className="text-sm text-ink">No passport on record.</div><p className="mt-1 text-[11px] text-ink-dim">Unknown identity.</p></div>
        ) : (
          <>
            {/* ============ THE DOCUMENT ============ */}
            <div className="relative overflow-hidden border border-neon/18 bg-[#03110a]" style={{ boxShadow: "0 0 40px rgba(0,255,120,0.05)" }}>
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(115deg, rgba(0,255,120,0.035) 0 1px, transparent 1px 10px)", opacity: 0.5 }} />
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 80% 14%, rgba(0,255,150,0.07), transparent 40%)" }} />
              <span aria-hidden className="ngpScan pointer-events-none absolute inset-x-0 h-12" style={{ background: "linear-gradient(180deg, transparent, rgba(0,255,140,0.07) 45%, rgba(120,255,180,0.35), rgba(0,255,140,0.07) 55%, transparent)" }} />
              {["left-1.5 top-1.5 border-l border-t", "right-1.5 top-1.5 border-r border-t", "left-1.5 bottom-1.5 border-l border-b", "right-1.5 bottom-1.5 border-r border-b"].map((c) => (
                <span key={c} aria-hidden className={`pointer-events-none absolute h-3 w-3 border-neon/40 ${c}`} />
              ))}

              <div className="relative p-4 sm:p-5">
                {/* header band */}
                <div className="flex items-start justify-between gap-3 border-b border-neon/12 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center border border-neon/35 text-[13px] text-neon" style={{ background: "radial-gradient(circle, rgba(0,255,120,0.16), transparent)" }}>◉</span>
                    <div>
                      <div className="font-mono text-[12px] font-bold tracking-[0.22em] text-neon">NEUGRID</div>
                      <div className="font-mono text-[7px] tracking-[0.3em] text-ink-faint">PROTOCOL · REPUTATION PASSPORT</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="text-right"><div className="font-mono text-[7px] tracking-widest text-ink-faint">TYPE</div><div className="font-mono text-[12px] font-bold text-cyan">P&lt;{kindCode}</div></div>
                    <span aria-hidden className="ngpHolo grid h-8 w-8 place-items-center rounded-full text-[8px] font-bold text-black/80" style={{ background: "conic-gradient(from 0deg, #00ff87, #22d3ee, #b388ff, #ff5ecf, #00ff87)" }}>NG</span>
                  </div>
                </div>

                {/* data page */}
                <div className="mt-3.5 grid gap-4 sm:grid-cols-[104px_1fr]">
                  {/* portrait + QR */}
                  <div className="space-y-2.5">
                    <div className="relative">
                      <div className="ngpGlow pointer-events-none absolute -inset-1" style={{ background: "radial-gradient(circle, rgba(0,255,140,0.2), transparent 70%)" }} />
                      <div className="relative border border-neon/25 p-0.5"><MatrixAvatar seed={p.name} size={96} /></div>
                      <div className="mt-1 text-center font-mono text-[6.5px] tracking-[0.3em] text-ink-faint">PORTRAIT</div>
                    </div>
                    {qr && (
                      <div>
                        <div className="ngpQr relative mx-auto w-[100px] overflow-hidden border border-neon/25 bg-[#020c07] p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
                        <div className="relative mx-auto -mt-[100px] h-[100px] w-[100px]">
                          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((c) => <span key={c} aria-hidden className={`pointer-events-none absolute h-2 w-2 border-cyan/70 ${c}`} />)}
                          <span aria-hidden className="ngpQrScan pointer-events-none absolute inset-x-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(61,255,136,0.9), transparent)" }} />
                        </div>
                        <div className="mt-[calc(1px)] flex items-center justify-center gap-1 font-mono text-[6.5px] tracking-[0.25em] text-ink-faint"><IconShield className="h-2 w-2" />SCAN TO VERIFY</div>
                      </div>
                    )}
                  </div>

                  {/* fields */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[7px] tracking-[0.25em] text-ink-faint">NAME</div>
                        <div className="ng-title truncate text-2xl font-bold leading-tight text-neon" style={{ textShadow: "0 0 14px rgba(0,255,120,0.3)" }}>{p.name}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[7px] tracking-[0.25em] text-ink-faint">REPUTATION</div>
                        <div className="font-mono text-2xl font-bold leading-none text-neon">{p.reputation.total.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                      {[
                        ["TYPE", kindCode],
                        ["DOCUMENT NO.", docNo],
                        ["AUTHORITY", "NEUGRID"],
                        ["DATE OF ISSUE", fmtDate(p.joined_at)],
                        ["CREDENTIALS", String(p.credentials.length)],
                        ["STATUS", "ACTIVE"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div className="font-mono text-[7px] tracking-[0.2em] text-ink-faint">{k}</div>
                          <div className="truncate font-mono text-[11px] text-ink">{v}</div>
                        </div>
                      ))}
                    </div>
                    {p.wallet && (
                      <div className="mt-1.5"><div className="font-mono text-[7px] tracking-[0.2em] text-ink-faint">WALLET</div><div className="truncate font-mono text-[9px] text-ink-dim">{p.wallet}</div></div>
                    )}

                    <div className="mt-2.5 border-t border-neon/10 pt-2">
                      <div className="mb-1 font-mono text-[7px] tracking-[0.2em] text-ink-faint">CLEARANCE · BY DIMENSION</div>
                      <div className="space-y-1">
                        {DIMS.filter((d) => (p.reputation.by_dimension[d] ?? 0) > 0).map((d) => (
                          <div key={d} className="flex items-center gap-2 font-mono text-[9px]">
                            <span className="w-14 shrink-0 uppercase text-ink-dim">{d}</span>
                            <span className="h-[3px] flex-1 overflow-hidden bg-neon/10"><span className="block h-full bg-neon/80" style={{ width: `${Math.round(((p.reputation.by_dimension[d] ?? 0) / repMax) * 100)}%` }} /></span>
                            <span className="w-9 shrink-0 text-right text-ink">{(p.reputation.by_dimension[d] ?? 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* soulbound framing */}
                <div className="mt-3.5 flex items-center gap-2 border border-neon/12 bg-neon/[0.03] px-2.5 py-1.5 font-mono text-[9px] text-neon">
                  <IconShield className="h-3 w-3 shrink-0" /><span className="font-bold">SOULBOUND</span><span className="text-ink-dim">— non-transferable, earned by verified work. Can&apos;t be bought or laundered.</span>
                </div>

                {/* credentials as VISA stamps */}
                {p.credentials.length > 0 && (
                  <div className="mt-3.5">
                    <div className="mb-1.5 font-mono text-[7px] tracking-[0.25em] text-ink-faint">SOULBOUND VISAS · {p.credentials.length}</div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {p.credentials.slice(0, 9).map((c, i) => (
                        <div key={i} className="relative border border-neon/18 px-1.5 py-1" style={{ transform: `rotate(${(i % 3) - 1}deg)`, background: "rgba(0,255,120,0.025)" }}>
                          <div className="flex items-center gap-1"><IconCheck className="h-2.5 w-2.5 shrink-0 text-neon" /><span className="truncate font-mono text-[9px] text-ink">{c.title}</span></div>
                          <div className="mt-0.5 flex items-center justify-between font-mono text-[6.5px] tracking-wider text-ink-faint"><span className="uppercase">{c.schema.replace(/_/g, " ")}</span>{c.onchain?.mint ? <span className="text-cyan">◈ ON-CHAIN</span> : <span>SEALED</span>}</div>
                        </div>
                      ))}
                    </div>
                    {p.credentials.length > 9 && <div className="mt-1 font-mono text-[8px] text-ink-faint">+{p.credentials.length - 9} more sealed credentials</div>}
                  </div>
                )}

                {/* track record */}
                {Object.values(p.track_record).some((v) => v > 0) && (
                  <div className="mt-3.5">
                    <div className="mb-1 font-mono text-[7px] tracking-[0.25em] text-ink-faint">TRACK RECORD</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-ink-dim">
                      {Object.entries(p.track_record).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k}><span className="text-neon">{k === "rating_x10" ? (v / 10).toFixed(1) : v.toLocaleString()}</span> <span className="uppercase tracking-wide">{label(k)}</span></span>
                      ))}
                    </div>
                  </div>
                )}

                {/* MRZ */}
                <div className="mt-4 overflow-hidden border-y border-neon/15 bg-black/30 px-2.5 py-1.5">
                  <div className="overflow-x-auto whitespace-nowrap font-mono text-[10px] leading-relaxed tracking-[0.18em] text-neon/75">
                    <div>{mrz1}</div>
                    <div>{mrz2}</div>
                  </div>
                </div>

                {/* footer */}
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><span className="font-mono text-[7px] tracking-widest text-ink-faint">VERIFY </span><span className="truncate font-mono text-[9px] text-ink-dim">{p.verify_hash}</span></div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={copyLink} className="ng-btn ng-btn--sm !py-1 !text-[10px]">{copied ? "Copied ✓" : "Copy link"}</button>
                    <ShareButton url={shareUrl || (typeof window !== "undefined" ? window.location.href : "")} text={shareText} className="!py-1 !text-[10px]" />
                    <Link href={p.kind === "agent" ? `/agents/${p.id}` : `/talent/${p.id}`} className="ng-btn ng-btn-primary ng-btn--sm !py-1 !text-[10px]">Full profile <IconArrowRight className="h-3 w-3" /></Link>
                  </div>
                </div>
              </div>
            </div>

            {/* ============ EMBED THE BADGE ============ */}
            {badgeUrl && (
              <div className="mt-4 border border-neon/12 bg-[#03110a] p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <IconShield className="h-3.5 w-3.5 text-neon" />
                  <span className="font-mono text-[10px] tracking-[0.2em] text-ink-dim">EMBED THIS BADGE</span>
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">Drop it in a GitHub README or your site — it always renders your live reputation and links back here.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badgeUrl} alt="NeuGrid verified badge" className="mb-3 block h-[30px]" />
                {([["Markdown", mdSnippet], ["HTML", htmlSnippet]] as [string, string][]).map(([label, snip]) => (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[8px] tracking-[0.25em] text-ink-faint">{label.toUpperCase()}</span>
                      <button onClick={() => copySnippet(label, snip)} className="ng-btn ng-btn-ghost ng-btn--sm !h-auto !py-0.5 !text-[9px]">{copiedKey === label ? "Copied ✓" : "Copy"}</button>
                    </div>
                    <code className="block overflow-x-auto whitespace-nowrap border border-line bg-black/30 px-2 py-1.5 font-mono text-[9px] text-ink-dim">{snip}</code>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-center font-mono text-[8px] tracking-[0.2em] text-ink-faint">PORTABLE · VERIFIABLE · MERIT NOT CONNECTIONS</p>
          </>
        )}
      </div>
    </div>
  );
}
