"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { CREATE_FORMS, CREATE_MENU, type Field, type FormConfig } from "@/lib/forms/createForms";
import { IconPlus } from "./ui";

/* tiny inline glyphs */
const Check = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#03150c" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
const Up = ({ c = "currentColor" }: { c?: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);

/* ============================ field renderer ============================ */

/** stable field name from a label, so a generic <form> can collect values */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function Segmented({ name, options }: { name?: string; options: string[] }) {
  const [sel, setSel] = useState(0);
  return (
    <div className="ng-tabs !gap-5">
      {name && <input type="hidden" name={name} value={options[sel] ?? ""} readOnly />}
      {options.map((o, i) => (
        <button type="button" key={o} onClick={() => setSel(i)} data-active={i === sel} className="ng-tab">{o}</button>
      ))}
    </div>
  );
}

function Tags({ name, options }: { name?: string; options: string[] }) {
  const [on, setOn] = useState<Set<string>>(new Set());
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
      {name && <input type="hidden" name={name} value={[...on].join(",")} readOnly />}
      {options.map((o) => {
        const active = on.has(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => setOn((s) => { const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n; })}
            className={`inline-flex items-center gap-2 text-xs transition ${active ? "text-neon text-glow-soft" : "text-ink-dim hover:text-neon"}`}
          >
            <span className={`grid h-4 w-4 place-items-center border transition ${active ? "border-neon bg-neon" : "border-line bg-neon/[0.06]"}`}>{active && <Check />}</span>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ name, label, hint }: { name?: string; label: string; hint?: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="col-span-2 mt-1 flex items-start justify-between gap-3 border-t border-neon/[0.07] pt-4">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-[11px] text-ink-dim">{hint}</div>}
      </div>
      {name && <input type="hidden" name={name} value={on ? "on" : ""} readOnly />}
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className={`relative h-5 w-9 shrink-0 border transition ${on ? "border-neon/50 bg-neon/25" : "border-line bg-neon/[0.06]"}`}
      >
        <span className={`absolute top-[3px] h-3 w-3 transition-all ${on ? "left-[19px] bg-neon" : "left-[3px] bg-neon/50"}`} />
      </button>
    </div>
  );
}

function Cards({ name, cards }: { name?: string; cards: { title: string; desc: string }[] }) {
  const [sel, setSel] = useState(-1);
  return (
    <div className="col-span-2 space-y-2.5">
      {name && <input type="hidden" name={name} value={sel >= 0 ? cards[sel].title : ""} readOnly />}
      {cards.map((c, i) => (
        <button
          type="button"
          key={c.title}
          onClick={() => setSel(i)}
          className={`ng-card block w-full p-3 text-left transition ${i === sel ? "!border-neon/50 bg-neon/[0.07]" : ""}`}
        >
          <div className="text-sm font-semibold text-ink">{c.title}</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{c.desc}</div>
        </button>
      ))}
    </div>
  );
}

function FieldView({ field }: { field: Field }) {
  if (field.t === "toggle") return <Toggle name={slug(field.label)} label={field.label} hint={field.hint} />;

  if (field.t === "media") {
    return (
      <div className="col-span-2">
        <div className="flex flex-wrap gap-2">
          {["Image", "Video", "File", "Link"].map((m) => (
            <button key={m} className="ng-btn ng-btn--sm"><IconPlus className="h-3 w-3" /> {m}</button>
          ))}
        </div>
      </div>
    );
  }

  if (field.t === "cards") {
    return (
      <div className="col-span-2">
        <label className="mb-1 block text-sm font-semibold text-ink">{field.label}</label>
        {field.ph && <p className="mb-3 text-[11px] text-ink-dim">{field.ph}</p>}
        <Cards name={slug(field.label)} cards={field.cards} />
      </div>
    );
  }

  const span = "half" in field && field.half ? "col-span-2 sm:col-span-1" : "col-span-2";

  return (
    <div className={span}>
      <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">{field.label}</label>
      {field.t === "text" && <input name={slug(field.label)} className="ng-input" placeholder={field.ph} />}
      {field.t === "textarea" && <textarea name={slug(field.label)} className="ng-input min-h-[88px] resize-y" placeholder={field.ph} />}
      {field.t === "select" && (
        <select name={slug(field.label)} className="ng-input" defaultValue="">
          <option value="" disabled>{field.ph}</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.t === "radio" && <Segmented name={slug(field.label)} options={field.options} />}
      {field.t === "tabs" && <Segmented name={slug(field.label)} options={field.options} />}
      {field.t === "tags" && (
        <>
          {field.ph && <p className="mb-2 text-[11px] text-ink-faint">{field.ph}</p>}
          <Tags name={slug(field.label)} options={field.options} />
        </>
      )}
      {field.t === "rate" && (
        <div className="flex items-end gap-2">
          <input name={slug(field.label)} className="ng-input flex-1" defaultValue={field.suffix} />
          <span className="pb-2 text-xs text-neon">{field.unit}</span>
        </div>
      )}
      {field.t === "upload" && (
        <div className="grid place-items-center rounded-lg bg-black/20 px-4 py-7 text-center" style={{ outline: "1px dashed rgba(0,255,0,0.16)", outlineOffset: "-7px" }}>
          <span className="text-neon"><Up /></span>
          <p className="mt-2 text-[11px] text-ink-dim">{field.hint}</p>
        </div>
      )}
    </div>
  );
}

/* ============================ modal ============================ */

function FormModal({ form, onClose, onSubmit }: { form: FormConfig; onClose: () => void; onSubmit: (data: FormData) => void }) {
  // polish: Esc closes, the first field gets focus — no glow, hairline HUD panel
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 font-mono">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div ref={boxRef} className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col border border-neon/16 bg-black">
        <div className="flex items-start justify-between border-b border-neon/10 px-5 py-3">
          <div className="min-w-0">
            <div className="ng-label !text-[13px] !text-neon">{form.title}</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">{"// "}{form.subtitle}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 px-2 text-ink-dim transition hover:text-neon">✕</button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">

        {form.wizard && (
          <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-y border-neon/[0.07] py-2.5 text-[10px] uppercase tracking-wider">
            {form.wizard.map((s, i) => (
              <span key={s} className="flex items-center gap-2.5">
                <span className={i === 0 ? "text-neon" : "text-ink-faint"}>{i === 0 ? "▸ " : ""}{s}</span>
                {i < form.wizard!.length - 1 && <span className="text-neon/25">·</span>}
              </span>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
            {form.fields.map((f, i) => <FieldView key={i} field={f} />)}
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-neon/[0.07] pt-4">
            <span className="text-[11px] text-ink-faint">{form.wizard ? `step 1/${form.wizard.length}` : ""}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="ng-btn ng-btn-ghost ng-btn--sm">cancel</button>
              <button type="submit" className="ng-btn ng-btn-primary ng-btn--sm">{form.submit}</button>
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

/* ============================ button + menu ============================ */

/** Default: the full "start new" menu. With `only`, a single direct-action
 *  button for THAT page's create (e.g. `only="grid" label="new grid"` on the
 *  grid directory) — the header no longer carries a global + new button. */
export default function StartNewButton({ only, label }: { only?: string; label?: string } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<FormConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  function openForm(key: string) {
    setMenuOpen(false);
    setForm(CREATE_FORMS[key] ?? null);
  }
  function flash(msg: string, ms = 3000) { setToast(msg); window.setTimeout(() => setToast(null), ms); }

  async function submit(data: FormData) {
    if (!form) return;
    const get = (label: string) => String(data.get(slug(label)) ?? "").trim();

    if (form.key === "grid") {
      const name = get("Grid Name"), category = get("Category"), description = get("Mission Statement");
      if (!name || !category) return flash("Grid needs a name and a category", 2600);
      try {
        const res = await fetch("/api/grids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, category, description }) });
        const json = await res.json();
        if (!res.ok) throw new Error();
        window.dispatchEvent(new Event("neugrid:refresh-me"));
        setForm(null); flash(`Grid "${json.grid.name}" created ✓ · +25 Pulse`, 3400);
        router.push(`/grid/${json.grid.slug}`);
      } catch { setForm(null); flash("Could not create Grid — try again"); }
      return;
    }

    // AI Agent / Core Agent → a real native agent (persona set at create when given)
    if (form.key === "agent" || form.key === "coreagent") {
      const name = get("Agent Name") || get("Core Agent Name");
      if (!name) return flash("Give your agent a name", 2400);
      const picked = (get("Capabilities") || get("Stack")).split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
      const typeCap = get("Framework Type").toLowerCase();
      const known = ["research", "growth", "content", "support", "analytics", "moderation"];
      const capabilities = picked.length ? picked : known.includes(typeCap) ? [typeCap] : ["general"];
      const personaEntries = Object.entries({
        role: get("Role"),
        personality: get("Personality & Behavior"),
        goals: get("Goals"),
        style: get("Communication Style"),
      }).filter(([, v]) => v);
      const persona = personaEntries.length ? Object.fromEntries(personaEntries) : undefined;
      try {
        const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, capabilities, persona }) });
        if (!res.ok) throw new Error();
        window.dispatchEvent(new Event("neugrid:refresh-me"));
        setForm(null); flash(`Agent "${name}" created ✓`); router.push("/agents");
      } catch { setForm(null); flash("Could not create agent — try again"); }
      return;
    }

    // SubGrid + Campaign launch under a Grid you own
    if (form.key === "subgrid" || form.key === "campaign") {
      const name = get("SubGrid Name") || get("Campaign Title");
      if (!name) return flash("Give it a name", 2400);
      let myGrids: { grid_id: string; name: string; slug: string }[] = [];
      try { myGrids = (await fetch("/api/campaignx").then((r) => r.json()))?.my_grids ?? []; } catch { /* ignore */ }
      const g = myGrids[0];
      if (!g) { setForm(null); return flash("Create a Grid first to launch this under it"); }

      if (form.key === "subgrid") {
        try {
          const res = await fetch(`/api/grids/${g.slug}/subgrids`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, purpose: get("Description") }) });
          if (!res.ok) throw new Error();
          setForm(null); flash(`SubGrid "${name}" launched in ${g.name} ✓`); router.push(`/grid/${g.slug}`);
        } catch { setForm(null); flash("Could not launch SubGrid"); }
        return;
      }
      try {
        const who = get("Who can work it").toLowerCase();
        const seeking = who.includes("human") ? "human" : who.includes("agent") ? "agent" : "any";
        const res = await fetch("/api/campaignx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grid_id: g.grid_id, title: name, brief: get("Description"), seeking, skills: get("Skills"), reward: Number(get("Reward")) || 500 }) });
        if (!res.ok) throw new Error();
        setForm(null); flash(`Promo job "${name}" posted from ${g.name} ✓`); router.push("/campaignx/board");
      } catch { setForm(null); flash("Could not post the promo job"); }
      return;
    }

    // Talent listing → the self-serve Talent listing
    if (form.key === "talent") {
      const skills = get("Skills & Expertise").split(",").map((s) => s.trim()).filter(Boolean);
      try {
        const res = await fetch("/api/talent", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: get("Professional Title") || undefined,
            rate_usdc: Number(get("Rate")) || undefined,
            skills: skills.length ? skills : undefined,
            available: get("Currently available for work") === "on",
          }),
        });
        if (!res.ok) throw new Error();
        window.dispatchEvent(new Event("neugrid:refresh-me"));
        setForm(null); flash("You're listed on Talent ✓"); router.push("/talent");
      } catch { setForm(null); flash("Could not save your listing — try again"); }
      return;
    }

    // post / message / funding-wizard — no backend yet
    setForm(null); flash(`${form.title} isn't wired up yet`);
  }

  if (only) {
    const target = CREATE_FORMS[only];
    if (!target) return null;
    return (
      <>
        <button onClick={() => setForm(target)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0">
          <IconPlus className="h-3.5 w-3.5" /> {label ?? target.title.toLowerCase()}
        </button>
        {form && createPortal(<FormModal form={form} onClose={() => setForm(null)} onSubmit={submit} />, document.body)}
        {toast &&
          createPortal(
            <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 border border-neon/40 bg-black px-4 py-2 font-mono text-[13px] text-neon">
              <span className="text-ink-faint">$ </span>{toast}
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <button onClick={() => setMenuOpen((o) => !o)} className="ng-btn ng-btn-primary h-9">
          <IconPlus className="h-4 w-4" /> new
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[80vh] w-[320px] overflow-y-auto border border-neon/16 bg-black font-mono">
              <div className="flex items-center justify-between border-b border-neon/10 px-3 py-2">
                <span className="ng-label !text-[10px]">start new</span>
                <span className="text-[9px] text-ink-faint">{"// creates something real"}</span>
              </div>
              <div className="py-1">
                {CREATE_MENU.map((group) => (
                  <div key={group.section} className="mt-1.5 first:mt-0.5">
                    <div className="px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-ink-faint">## {group.section}</div>
                    {group.items.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => openForm(m.key)}
                        className="thl group block w-full px-3 py-1.5 text-left"
                      >
                        <span className="flex items-baseline gap-2 text-[12px]">
                          <span className="shrink-0 text-neon">›</span>
                          <span className="flex-1 text-ink">{m.label}</span>
                          <span className="shrink-0 text-ink-faint">↵</span>
                        </span>
                        <span className="mt-0.5 block pl-[14px] text-[10px] leading-snug text-ink-dim">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {form && createPortal(<FormModal form={form} onClose={() => setForm(null)} onSubmit={submit} />, document.body)}
      {toast &&
        createPortal(
          <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 border border-neon/40 bg-black px-4 py-2 font-mono text-[13px] text-neon">
            <span className="text-ink-faint">$ </span>{toast}
          </div>,
          document.body,
        )}
    </>
  );
}
