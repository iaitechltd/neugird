"use client";

/**
 * /settings — the account control panel. Every control here writes to a REAL
 * backend: the public Talent listing (headline/skills/rate/availability via
 * /api/talent), the GRID fee preference (/api/grid/fee-pref), Solana wallet
 * connect (SIWS, /api/auth/*), the referral link (/api/rewards), and session
 * sign-out (/api/auth/logout). No decorative toggles — if it's here, it works.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Panel, Mark, DataRow, IconUser, IconCoins, IconShield, IconBolt, IconWallet, IconCheck } from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import WalletConnect from "@/components/app/WalletConnect";

type Me = { id: string; username: string; wallet: string | null; pulse: number; reputation?: { total?: number } | null; balances?: { grid: number; usdc: number } };
type Prof = { headline: string; bio?: string; rate_usdc?: number; available: boolean; skills: string[]; listed: boolean };
type Humanity = {
  tier: number; tier_name: string;
  signals: { wallet_age_days?: number; tx_count?: number; checked_at: string } | null;
  attestation: { provider: string; ref?: string; at: string } | null;
  thresholds: { wallet_age_days: number; tx_count: number };
  gates: { starter: { required: number; ok: boolean }; rewards: { required: number; ok: boolean } };
};
type Grid = { price: number; balances: { grid: number; usdc: number }; pay_fees_in_grid?: boolean; fee_discount_bps?: number };
type Ref = { code?: string; verified: number; pending: number; affiliate: { grid: number; share_bps: number } };

const short = (a?: string | null) => (a && a.length > 10 ? `${a.slice(0, 5)}…${a.slice(-5)}` : a ?? "");

/* A squared terminal toggle switch backed by a real state value. */
function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
      className={`relative h-5 w-9 shrink-0 border transition disabled:opacity-40 ${on ? "border-neon bg-neon/80" : "border-line bg-line/40"}`}>
      <span className={`absolute top-0.5 h-3.5 w-3.5 transition-all ${on ? "left-[18px] bg-black" : "left-0.5 bg-neon/60"}`} />
    </button>
  );
}

function SecLabel({ icon, children, note }: { icon: React.ReactNode; children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon">{icon}</span>{children}</div>
      {note && <span className="text-[9.5px] text-ink-faint">{note}</span>}
    </div>
  );
}

export default function SettingsPage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);

  const [me, setMe] = useState<Me | null>(null);
  const [prof, setProf] = useState<Prof | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [ref, setRef] = useState<Ref | null>(null);

  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [hum, setHum] = useState<Humanity | null>(null);
  const [humBusy, setHumBusy] = useState(false);
  const [civicMsg, setCivicMsg] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [available, setAvailable] = useState(true);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [busyFee, setBusyFee] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const load = useCallback(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => { if (d?.id) setMe(d); }).catch(() => {});
    fetch("/api/talent").then((r) => r.json()).then((d) => {
      if (d?.me) { setProf(d.me); setHeadline(d.me.headline ?? ""); setBio(d.me.bio ?? ""); setRate(d.me.rate_usdc ? String(d.me.rate_usdc) : ""); setAvailable(d.me.available ?? true); setSkills(d.me.skills ?? []); }
    }).catch(() => {});
    fetch("/api/grid").then((r) => r.json()).then(setGrid).catch(() => {});
    fetch("/api/rewards").then((r) => r.json()).then((d) => setRef(d?.referrals ?? null)).catch(() => {});
    fetch("/api/humanity").then((r) => r.json()).then(setHum).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = !!prof && (headline !== (prof.headline ?? "") || bio !== (prof.bio ?? "") || rate !== (prof.rate_usdc ? String(prof.rate_usdc) : "") || available !== (prof.available ?? true) || skills.join(",") !== (prof.skills ?? []).join(","));

  async function saveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    const r = await fetch("/api/talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ headline, bio, rate_usdc: rate ? Number(rate) : undefined, available, skills }) }).then((x) => x.json()).catch(() => null);
    setSavingProfile(false);
    if (r && !r.error) { setProf((p) => (p ? { ...p, headline, bio, rate_usdc: r.listing?.rate_usdc, available, skills: r.skills ?? skills, listed: true } : p)); notify("Profile saved"); window.dispatchEvent(new Event("neugrid:refresh-me")); }
    else notify("Could not save profile");
  }
  function addSkill() { const s = skillInput.trim().toLowerCase().slice(0, 24); if (s && !skills.includes(s) && skills.length < 12) setSkills([...skills, s]); setSkillInput(""); }
  function removeSkill(s: string) { setSkills(skills.filter((x) => x !== s)); }

  async function refreshHumanity() {
    if (humBusy) return;
    setHumBusy(true);
    try {
      const r = await fetch("/api/humanity/refresh", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (d?.state) setHum(d.state);
    } finally { setHumBusy(false); }
  }
  async function checkCivic() {
    if (humBusy) return;
    setHumBusy(true);
    setCivicMsg(null);
    try {
      const r = await fetch("/api/humanity/civic", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (d?.state) setHum(d.state);
      if (r.ok) setCivicMsg("Verified — you're tier 2.");
      else setCivicMsg(d?.error === "no_valid_pass" ? "No pass on your wallet yet — get one first, then re-check."
        : d?.error === "connect_wallet_first" ? "Connect your wallet first."
        : d?.error === "invalid_wallet" ? "Your session wallet isn't a real Solana address — connect a wallet first."
        : "Civic check unavailable right now — try again shortly.");
    } finally { setHumBusy(false); }
  }

  async function toggleFee() {
    if (busyFee || !grid) return;
    setBusyFee(true);
    const r = await fetch("/api/grid/fee-pref", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: !grid.pay_fees_in_grid }) }).then((x) => x.json()).catch(() => null);
    setBusyFee(false);
    if (r?.state) { setGrid(r.state); notify(r.state.pay_fees_in_grid ? "Trade fees now paid in GRID" : "Trade fees paid in USDC"); }
  }

  const refLink = ref?.code && typeof window !== "undefined" ? `${window.location.origin}/?ref=${encodeURIComponent(ref.code)}` : "";
  async function copyLink() { if (!refLink) return; try { await navigator.clipboard.writeText(refLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }

  const gridBal = grid?.balances.grid ?? me?.balances?.grid ?? 0;
  const usdcBal = grid?.balances.usdc ?? me?.balances?.usdc ?? 0;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Settings" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — account summary */}
        <OrbPanel side="left" label="Account" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="ACCOUNT" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="ng-card p-3.5">
              <div className="flex items-center gap-3">
                <MatrixAvatar seed={me?.username ?? "node"} size={44} shape="square" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-ink">{me?.username ?? "—"}</div>
                  <div className="truncate text-[10px] text-ink-dim">{me?.wallet ? short(me.wallet) : "not wallet-linked"}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                {([["Reputation", Math.round(me?.reputation?.total ?? me?.pulse ?? 0)], ["Pulse", me?.pulse ?? 0], ["GRID", Math.round(gridBal)], ["USDC", Math.round(usdcBal)]] as [string, number][]).map(([k, v]) => (
                  <div key={k}><div className="ng-stat__v !text-base tnum">{v.toLocaleString()}</div><div className="ng-stat__k">{k}</div></div>
                ))}
              </div>
            </div>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">On this page</div>
            <div className="divide-y divide-line text-[12px]">
              {[["Public profile", "headline · bio · skills"], ["Payments & fees", "GRID fee preference"], ["Verification", "humanity tier · Civic"], ["Wallet", "connect · balances"], ["Referrals", "your invite link"]].map(([k, s]) => (
                <div key={k} className="flex items-center justify-between py-2"><span className="text-ink">{k}</span><span className="text-[10px] text-ink-faint">{s}</span></div>
              ))}
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Your reputation and earned GRID allocation are <span className="text-ink-dim">non-transferable</span> — bound to this identity, never sold. Settings here only change how you present and pay.</p>
          </Panel>
        </OrbPanel>

        {/* CENTER — the editable settings */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Settings" /></h1>
            <p className="mt-1 text-sm text-ink-dim">Your account controls — every change here writes to the live platform.</p>
          </div>

          {/* PUBLIC PROFILE — the Talent listing */}
          <Panel bodyClass="p-4">
            <SecLabel icon={<IconUser className="h-3.5 w-3.5" />} note={prof?.listed ? "listed on Talent" : "not listed yet"}>Public Profile</SecLabel>
            <p className="mb-3 text-[11px] text-ink-dim">How you appear on the <Link href="/talent" className="text-neon hover:underline">Talent</Link> marketplace. Verified badge unlocks at 100 reputation.</p>

            <label className="ng-label !text-ink-dim">Headline</label>
            <input value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 80))} placeholder="e.g. Full-stack builder · Solana + AI agents" className="ng-input mb-1 mt-1 w-full text-[13px]" />
            <div className="mb-3 text-right text-[9px] text-ink-faint">{headline.length}/80</div>

            <label className="ng-label !text-ink-dim">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} rows={3} placeholder="A few lines about what you build — shown on your public profile." className="ng-input mb-1 mt-1 w-full resize-none text-[12px]" />
            <div className="mb-3 text-right text-[9px] text-ink-faint">{bio.length}/280</div>

            <label className="ng-label !text-ink-dim">Skills <span className="text-ink-faint">({skills.length}/12)</span></label>
            <div className="mb-1.5 mt-1 flex flex-wrap items-center gap-1.5">
              {skills.map((s) => (
                <button key={s} onClick={() => removeSkill(s)} className="ng-tag flex items-center gap-1 transition hover:!text-danger" title="Remove">{s}<span className="text-[9px]">✕</span></button>
              ))}
              {skills.length === 0 && <span className="text-[11px] text-ink-faint">No skills yet.</span>}
            </div>
            <div className="mb-3 flex gap-2">
              <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder="Add a skill + Enter" className="ng-input flex-1 !py-1.5 text-[12px]" disabled={skills.length >= 12} />
              <button onClick={addSkill} disabled={!skillInput.trim() || skills.length >= 12} className="ng-btn ng-btn--sm shrink-0 disabled:opacity-40">Add</button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="ng-label !text-ink-dim">Rate (USDC / hr)</label>
                <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="e.g. 120" className="ng-input mt-1 w-full text-[13px]" />
              </div>
              <div>
                <label className="ng-label !text-ink-dim">Availability</label>
                <div className="mt-2 flex items-center gap-2.5">
                  <Toggle on={available} onClick={() => setAvailable((v) => !v)} />
                  <span className="text-[12px] text-ink-dim">{available ? "Open to work" : "Not available"}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={saveProfile} disabled={!dirty || savingProfile} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-40">{savingProfile ? "Saving…" : "Save profile"}</button>
              {dirty && <span className="text-[10px] text-amber">Unsaved changes</span>}
              {!dirty && prof?.listed && <span className="flex items-center gap-1 text-[10px] text-neon"><IconCheck className="h-3 w-3" />Up to date</span>}
            </div>
          </Panel>

          {/* PAYMENTS & FEES */}
          <Panel bodyClass="p-4">
            <SecLabel icon={<IconCoins className="h-3.5 w-3.5" />} note={grid ? `1 GRID ≈ $${(grid.price ?? 0).toFixed(4)}` : undefined}>Payments &amp; Fees</SecLabel>

            <div className="ng-card flex items-start justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="text-[13px] text-ink">Pay Trade fees in GRID</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">Charge your Trade trading fees in GRID instead of USDC, at a {Math.round((grid?.fee_discount_bps ?? 0) / 100) || 25}% discount — GRID&apos;s 4th utility.</p>
                {grid?.pay_fees_in_grid && <div className="mt-2 rounded border border-neon/20 bg-neon/[0.05] px-2 py-1.5 text-[10px] text-neon">Active — fees discounted {Math.round((grid?.fee_discount_bps ?? 0) / 100)}% and routed to the treasury.</div>}
              </div>
              <Toggle on={!!grid?.pay_fees_in_grid} onClick={toggleFee} disabled={busyFee || !grid} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="ng-card p-3.5"><div className="ng-label !text-ink-dim">GRID balance</div><div className="ng-stat__v !text-xl tnum">{Math.round(gridBal).toLocaleString()}</div></div>
              <div className="ng-card p-3.5"><div className="ng-label !text-ink-dim">USDC balance</div><div className="ng-stat__v !text-xl tnum text-cyan">{Math.round(usdcBal).toLocaleString()}</div></div>
            </div>
            <p className="mt-2 text-[10px] text-ink-faint">Acquire GRID on the <Link href="/rewards" className="text-neon hover:underline">Rewards</Link> page (earned) or the GRID market on your profile.</p>
          </Panel>

          {/* VERIFICATION — the humanity tier (docs/POH_GATE.md): gates reward
              counting + the starter grant once governance arms them */}
          <Panel bodyClass="p-4">
            <SecLabel icon={<IconShield className="h-3.5 w-3.5" />} note={hum ? `tier ${hum.tier} · ${hum.tier_name}` : undefined}>Verification</SecLabel>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">One human, one counted reward ledger. Verify once — everything you&apos;ve ever earned counts at the TGE. Never required just to use NeuGrid.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="ng-card p-3.5">
                <div className="ng-label !text-ink-dim">Wallet signals</div>
                <div className="mt-1 divide-y divide-line">
                  <DataRow k={`Age (need ${hum?.thresholds.wallet_age_days ?? 30}d)`} v={hum?.signals ? `${hum.signals.wallet_age_days ?? 0}d` : "—"} />
                  <DataRow k={`Transactions (need ${hum?.thresholds.tx_count ?? 25})`} v={hum?.signals ? `${hum.signals.tx_count ?? 0}` : "—"} />
                </div>
                <button onClick={refreshHumanity} disabled={humBusy} className="ng-btn ng-btn--sm ng-btn--block mt-2.5 justify-center disabled:opacity-40">{humBusy ? "Reading chain…" : "Refresh signals"}</button>
              </div>
              <div className="ng-card p-3.5">
                <div className="ng-label !text-ink-dim">Verified human</div>
                {hum?.attestation ? (
                  <div className="mt-1 divide-y divide-line">
                    <DataRow k="Attested by" v={hum.attestation.provider} accent="neon" />
                    <DataRow k="Since" v={new Date(hum.attestation.at).toLocaleDateString()} />
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-ink-dim">A quick video selfie with Civic — no ID documents, nothing stored here.</p>
                    <div className="mt-2.5 flex gap-2">
                      <a href="https://getpass.civic.com/?pass=unique&chain=solana" target="_blank" rel="noopener noreferrer" className="ng-btn ng-btn-cyan ng-btn--sm flex-1 justify-center">Get pass ↗</a>
                      <button onClick={checkCivic} disabled={humBusy} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-40">{humBusy ? "Checking…" : "Check pass"}</button>
                    </div>
                    {civicMsg && <p className="mt-1.5 text-[10px] leading-relaxed text-ink-dim">{civicMsg}</p>}
                  </>
                )}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-ink-faint">{hum && hum.gates.rewards.required > 0 ? (hum.gates.rewards.ok ? "Verified — your allocation counts at the TGE." : `Season rewards require tier ${hum.gates.rewards.required} — your earnings wait as pending until you verify.`) : "Verification gates are open this season — this becomes required only when governance turns it on."}</p>
          </Panel>

          {/* APPEARANCE — honest note (the terminal is the fixed house style) */}
          <Panel bodyClass="p-4">
            <SecLabel icon={<IconBolt className="h-3.5 w-3.5" />}>Appearance</SecLabel>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-ink">Interface theme</span>
              <Mark plain accent="neon" className="!text-[10px]">NeuGrid Terminal</Mark>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">The phosphor terminal is the house style — one voice, no themes. Motion respects your system&apos;s reduced-motion setting automatically.</p>
          </Panel>
        </main>

        {/* RIGHT — wallet · referrals · session */}
        <OrbPanel side="right" label="Session" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="WALLET &amp; REFERRALS" icon={<IconShield className="h-4 w-4" />} bodyClass="p-3.5">
            {/* Wallet — real Wallet-Standard connect (Phantom · Solflare · Backpack …) */}
            <SecLabel icon={<IconWallet className="h-3.5 w-3.5" />} note="Wallet Standard">Solana Wallet</SecLabel>
            <p className="mb-2 text-[10.5px] leading-relaxed text-ink-dim">Connect any Solana wallet to sign in with it — it signs a one-time challenge (SIWS). NeuGrid never holds your keys.</p>
            <WalletConnect onChange={load} align="left" />
            {me?.wallet && <div className="mt-2 rounded border border-line bg-neon/[0.03] px-2 py-1.5 text-[10px] text-ink-dim">This identity&apos;s linked wallet: <span className="break-all text-neon">{me.wallet}</span></div>}

            {/* Referrals */}
            <div className="mt-5"><SecLabel icon={<IconUser className="h-3.5 w-3.5" />} note={`${(ref?.affiliate.share_bps ?? 1000) / 100}% fee share`}>Refer &amp; Earn</SecLabel></div>
            <p className="mb-2 text-[10.5px] leading-relaxed text-ink-dim">Invite builders — you earn on their first verified work + a share of their protocol fees for 12 months.</p>
            <div className="flex gap-2">
              <input readOnly value={refLink || "—"} className="ng-input flex-1 !text-[10px]" />
              <button onClick={copyLink} disabled={!refLink} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{copied ? "✓" : "Copy"}</button>
            </div>
            <div className="mt-2 divide-y divide-line">
              <DataRow k="Verified referrals" v={ref?.verified ?? 0} accent="neon" />
              <DataRow k="Pending" v={ref?.pending ?? 0} />
              <DataRow k="Affiliate GRID" v={(ref?.affiliate.grid ?? 0).toLocaleString()} accent="cyan" />
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">To sign out, use the account menu (top-right). Your data — reputation, builds, allocation — persists on-chain and returns when you sign back in.</p>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
