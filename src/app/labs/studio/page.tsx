"use client";

/**
 * /labs/studio — DESIGN LAB (Echo Studio, Phase 0 of docs/ECHO_STUDIO.md).
 *
 * The room where a builder doesn't build alone: a CREW of agents builds the
 * product live in front of them — engineer writing and re-running code, tester
 * breaking it, designer polishing, marketing prepping launch — with the chief
 * brain planning and grading on top. Skills install from a store, and money is
 * a button (hire / raise / deploy / tokenize) without leaving the room.
 *
 * This is a SELF-CONTAINED living prototype (scripted demo loop, no backend):
 * the founder's taste-lock gate before Phase 1 wires the real engine. Same lab
 * idiom as /labs/terminal — phosphor panes, [ TITLE ] borders, radius 0.
 */

import { useEffect, useRef, useState } from "react";

const GREEN = "#33ff66";
const DIM = "#1e9c46";
const FAINT = "#11602b";
const CYAN = "#48f5ff";
const AMBER = "#ffb020";
const LINE = "rgba(51,255,102,0.28)";

function Pane({ title, children, className = "", tag }: { title: string; children: React.ReactNode; className?: string; tag?: string }) {
  return (
    <section className={`relative ${className}`} style={{ border: `1px solid ${LINE}`, borderRadius: 0, padding: "14px 12px 10px" }}>
      <span className="absolute -top-[9px] left-2 px-1" style={{ background: "#000", color: GREEN, fontSize: 11, letterSpacing: "0.08em" }}>
        [ {title} ]
      </span>
      {tag && (
        <span className="absolute -top-[9px] right-2 px-1" style={{ background: "#000", color: DIM, fontSize: 10, letterSpacing: "0.08em" }}>
          {tag}
        </span>
      )}
      {children}
    </section>
  );
}

/* ------------------------------ the demo script ------------------------------ */

type Tone = "work" | "ok" | "warn" | "idle";
type Seat = { id: string; name: string; role: string; brain: string; brainNote: string; status: string; tone: Tone };
type Feed = { text: string; tone?: "neon" | "cyan" | "dim" | "amber" };

const SEATS_0: Seat[] = [
  { id: "chief", name: "Atlas", role: "chief", brain: "fable-5", brainNote: "plans + grades", status: "reading the objective", tone: "work" },
  { id: "eng", name: "Rex", role: "engineer", brain: "grok-4.5", brainNote: "the hands", status: "standing by", tone: "idle" },
  { id: "test", name: "Juno", role: "tester", brain: "grok-4.5", brainNote: "the hands", status: "standing by", tone: "idle" },
  { id: "design", name: "Ivy", role: "designer", brain: "grok-4.5", brainNote: "the hands", status: "standing by", tone: "idle" },
  { id: "mkt", name: "Max", role: "marketing", brain: "haiku-4.5", brainNote: "the chatter", status: "standing by", tone: "idle" },
];

const FILES = ["app.tsx", "api.ts", "schema.sql", "styles.css", "README.md"];

type S = {
  seats: Seat[];
  feed: Feed[];
  editing: string | null;
  stage: number;      // preview richness 0..3
  version: number;
  flash: string | null;
  proof: number;
  grid: number;
  approval: { text: string; resolved?: "ok" | "no" } | null;
};

const S0: S = {
  seats: SEATS_0,
  feed: [{ text: "objective queued: “add a pipeline view + fix signup, then tell the world”", tone: "dim" }],
  editing: null, stage: 0, version: 7, flash: null, proof: 214, grid: 3.2, approval: null,
};

function seat(s: S, id: string, status: string, tone: Tone): S {
  return { ...s, seats: s.seats.map((x) => (x.id === id ? { ...x, status, tone } : x)) };
}
function feed(s: S, text: string, tone?: Feed["tone"]): S {
  return { ...s, feed: [...s.feed.slice(-9), { text, tone }] };
}

type Step = (s: S) => S;

const SCRIPT: Step[] = [
  (s) => feed(seat(s, "chief", "breaking the objective into briefs", "work"), "Atlas › decomposed it — 4 briefs, Rex leads", "cyan"),
  (s) => feed(seat({ ...seat(s, "eng", "writing api.ts — pipeline endpoints", "work"), editing: "api.ts", proof: s.proof + 3 }, "chief", "briefs out — watching the work", "ok"), "● Rex started building — 3 files in play"),
  (s) => seat({ ...s, proof: s.proof + 2 }, "test", "running the suite — 12 tests", "work"),
  (s) => feed(seat(seat(s, "test", "2 failing: signup on mobile", "warn"), "eng", "reading the failures → fixing", "work"), "● Juno broke it — signup fails on mobile (that's her job)", "amber"),
  (s) => seat({ ...s, editing: "app.tsx", proof: s.proof + 2 }, "eng", "fix applied — re-running", "work"),
  (s) => feed(seat(seat({ ...s, stage: Math.min(3, s.stage + 1), version: s.version + 1, flash: `shipped v${s.version + 1}`, proof: s.proof + 4, grid: +(s.grid + 0.6).toFixed(1) }, "test", "all 12 passing ✓", "ok"), "eng", "shipped — tests green", "ok"), "● Rex shipped v8 — pipeline view live in preview, every step sealed", "neon"),
  (s) => feed(seat({ ...s, editing: "styles.css", flash: null }, "design", "rebuilding the empty states", "work"), "● Ivy took the baton — polish pass"),
  (s) => feed(seat({ ...s, stage: Math.min(3, s.stage + 1), proof: s.proof + 2, editing: null }, "design", "empty states shipped ✓", "ok"), "● Ivy shipped — the app no longer looks abandoned when it's empty", "neon"),
  (s) => seat(s, "mkt", "drafting the launch post", "work"),
  (s) => ({ ...feed(seat(s, "mkt", "launch post ready — awaiting your ok", "warn"), "● Max drafted the launch post → needs YOUR approval", "amber"), approval: { text: "Max · publish the launch post to the wire?" } }),
  (s) => (s.approval && !s.approval.resolved ? { ...feed(seat(s, "mkt", "posted to the wire ✓", "ok"), "you approved — the post is live on the wire", "cyan"), approval: { ...s.approval, resolved: "ok" }, grid: +(s.grid + 0.2).toFixed(1) } : s),
  (s) => feed(seat({ ...s, proof: s.proof + 1 }, "chief", "grading the cycle — reviewing every deliverable", "work"), "Atlas › grading: 2 ships accepted · 1 post out · objective advanced", "cyan"),
  (s) => ({ ...feed(seat(seat(seat(seat(seat(s, "chief", "cycle graded ✓ — queueing the next objective", "ok"), "eng", "standing by", "idle"), "test", "standing by", "idle"), "design", "standing by", "idle"), "mkt", "standing by", "idle"), "crew idle — type a directive below and watch them move", "dim"), approval: null }),
];

/** Steps injected when the founder types a directive — the crew responds to HIM. */
function directiveSteps(text: string): Step[] {
  const short = text.length > 44 ? text.slice(0, 44) + "…" : text;
  return [
    (s) => feed(seat(s, "chief", `reading your directive`, "work"), `you › ${short}`, "cyan"),
    (s) => feed(seat(seat(s, "chief", "briefed Rex + Ivy on it", "ok"), "eng", "building your change", "work"), "Atlas › broke your directive into 2 briefs", "cyan"),
    (s) => seat({ ...s, editing: "app.tsx", proof: s.proof + 3 }, "design", "adjusting the layout for it", "work"),
    (s) => feed(seat(seat({ ...s, stage: Math.min(3, s.stage + 1), version: s.version + 1, flash: `shipped v${s.version + 1}`, proof: s.proof + 3, grid: +(s.grid + 0.5).toFixed(1), editing: null }, "eng", "shipped your change ✓", "ok"), "design", "done ✓", "ok"), `● your directive shipped — v${s.version + 1} in the preview`, "neon"),
    (s) => ({ ...s, flash: null }),
  ];
}

/* ---------------------------------- the page ---------------------------------- */

const TONE_COLOR: Record<Tone, string> = { work: CYAN, ok: GREEN, warn: AMBER, idle: FAINT };

export default function StudioLab() {
  const [s, setS] = useState<S>(S0);
  const [cmd, setCmd] = useState("");
  const queue = useRef<Step[]>([]);
  const idx = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setS((prev) => {
        const step = queue.current.length ? queue.current.shift()! : SCRIPT[idx.current++ % SCRIPT.length];
        return step(prev);
      });
    }, 2600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [s.feed]);

  const submit = () => {
    const text = cmd.trim();
    if (!text) return;
    queue.current.push(...directiveSteps(text));
    setCmd("");
  };
  const moneyNote = (what: string, phase: string) =>
    setS((prev) => feed(prev, `prototype — [ ${what} ] wires in ${phase}: ${what === "HIRE HELP" ? "an escrowed bounty posts to the community board from right here" : what === "OPEN A RAISE" ? "the chief drafts your GenesisX raise from the real project" : what === "DEPLOY" ? "this build goes live at /d/<slug>" : "the product lists on the market — delivery-gated"}`, "dim"));

  const resolveApproval = (ok: boolean) =>
    setS((prev) => {
      if (!prev.approval || prev.approval.resolved) return prev;
      const p = { ...prev, approval: { ...prev.approval, resolved: (ok ? "ok" : "no") as "ok" | "no" } };
      return ok
        ? feed(seat(p, "mkt", "posted to the wire ✓", "ok"), "you approved — the post is live on the wire", "cyan")
        : feed(seat(p, "mkt", "draft shelved", "idle"), "you declined — nothing published", "dim");
    });

  return (
    <div className="mx-auto max-w-[1200px] px-3 pb-10" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: GREEN, fontSize: 12.5 }}>
      {/* shell header */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-3">
          <span style={{ color: DIM }}>user@neugrid:~$</span>
          <span>echo studio — solstice-crm</span>
          <span style={{ color: CYAN, fontSize: 11 }}>[ CREW BUILDING ]</span>
        </div>
        <div className="flex flex-wrap gap-2" style={{ fontSize: 11 }}>
          {([["HIRE HELP", "Phase 4"], ["OPEN A RAISE", "Phase 4"], ["DEPLOY", "Phase 2"], ["TOKENIZE", "Phase 4"]] as const).map(([b, ph]) => (
            <button key={b} onClick={() => moneyNote(b, ph)} className="cursor-pointer px-2 py-1 transition-colors hover:text-black"
              style={{ border: `1px solid ${LINE}`, color: GREEN, background: "transparent", borderRadius: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = GREEN)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              [ {b} ]
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[230px_1fr_300px]">
        {/* ------------------------------ left: project ------------------------------ */}
        <div className="flex flex-col gap-4">
          <Pane title="PROJECT">
            <div style={{ lineHeight: 1.9 }}>
              {FILES.map((f) => (
                <div key={f} className="flex items-center justify-between">
                  <span style={{ color: s.editing === f ? CYAN : GREEN }}>{s.editing === f ? "▸ " : "  "}{f}</span>
                  {s.editing === f && <span style={{ color: CYAN, fontSize: 10 }}>rex ●</span>}
                </div>
              ))}
            </div>
          </Pane>
          <Pane title="CHECKPOINTS">
            <div style={{ lineHeight: 1.9 }}>
              <div className="flex justify-between"><span style={{ color: CYAN }}>v{s.version} — now</span><span style={{ color: DIM }}>current</span></div>
              <div className="flex justify-between"><span style={{ color: DIM }}>v{s.version - 1} — pipeline wip</span><span style={{ color: FAINT }}>↺ restore</span></div>
              <div className="flex justify-between"><span style={{ color: DIM }}>v{s.version - 2} — signup fix</span><span style={{ color: FAINT }}>↺ restore</span></div>
            </div>
            <div className="mt-2" style={{ color: FAINT, fontSize: 11 }}>undo is one click — the crew can’t lose your work</div>
          </Pane>
          <Pane title="PROOF">
            <div style={{ fontSize: 22, lineHeight: 1.1 }}>{s.proof}</div>
            <div style={{ color: DIM, fontSize: 11 }}>steps sealed</div>
            <div className="mt-2" style={{ color: DIM, fontSize: 11 }}>trail a3f2…9c71</div>
            <div style={{ color: FAINT, fontSize: 11 }}>every edit · run · fix — provable. a receipt, not a claim.</div>
          </Pane>
        </div>

        {/* ------------------------------ center: preview + command + feed ------------------------------ */}
        <div className="flex flex-col gap-4">
          <Pane title="LIVE PREVIEW" tag={s.flash ? `✓ ${s.flash}` : `v${s.version}`}>
            <div style={{ border: `1px solid ${s.flash ? CYAN : "rgba(51,255,102,0.18)"}`, transition: "border-color 0.6s", padding: 10 }}>
              {/* the faux product being built — grows as the crew ships */}
              <div className="flex items-center justify-between" style={{ borderBottom: `1px solid rgba(51,255,102,0.18)`, paddingBottom: 6, marginBottom: 8 }}>
                <span style={{ color: GREEN }}>solstice crm</span>
                <span style={{ color: FAINT, fontSize: 10 }}>{s.stage >= 2 ? "deals · contacts · pipeline" : "deals · contacts"}</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: s.stage >= 1 ? "1fr 1fr 1fr" : "1fr 1fr" }}>
                {["LEADS", "IN TALKS", ...(s.stage >= 1 ? ["CLOSING"] : [])].map((col) => (
                  <div key={col} style={{ border: `1px solid rgba(51,255,102,0.18)`, padding: 6, minHeight: 86 }}>
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 5 }}>{col}</div>
                    <div style={{ background: "rgba(51,255,102,0.10)", height: 12, marginBottom: 4 }} />
                    <div style={{ background: "rgba(51,255,102,0.10)", height: 12, marginBottom: 4 }} />
                    {s.stage >= 2 && <div style={{ background: "rgba(72,245,255,0.12)", height: 12 }} />}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between" style={{ fontSize: 10 }}>
                <span style={{ color: FAINT }}>{s.stage >= 3 ? "empty states ✓ · mobile signup ✓ · dark mode ✓" : s.stage >= 2 ? "empty states ✓ · mobile signup ✓" : s.stage >= 1 ? "mobile signup ✓" : "…the crew is building"}</span>
                <span style={{ color: DIM }}>updates as the crew ships</span>
              </div>
            </div>
          </Pane>

          <Pane title="COMMAND">
            <div className="flex items-center gap-2">
              <span style={{ color: CYAN }}>&gt;</span>
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="tell the crew what to change — then watch them move"
                className="w-full bg-transparent outline-none"
                style={{ color: GREEN, fontSize: 12.5, caretColor: GREEN }}
              />
              <button onClick={submit} className="cursor-pointer px-2" style={{ color: DIM, border: `1px solid ${LINE}`, borderRadius: 0, fontSize: 11 }}>
                send
              </button>
            </div>
          </Pane>

          <Pane title="MISSION FEED" className="min-h-[150px]">
            <div ref={feedRef} className="max-h-[168px] overflow-y-auto" style={{ lineHeight: 1.85 }}>
              {s.feed.map((f, i) => (
                <div key={i} style={{ color: f.tone === "cyan" ? CYAN : f.tone === "amber" ? AMBER : f.tone === "dim" ? DIM : GREEN }}>
                  {f.text}
                </div>
              ))}
            </div>
          </Pane>
        </div>

        {/* ------------------------------ right: crew + skills + session ------------------------------ */}
        <div className="flex flex-col gap-4">
          <Pane title="CREW · LIVE">
            <div className="flex flex-col gap-3">
              {s.seats.map((a) => (
                <div key={a.id}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: TONE_COLOR[a.tone], fontSize: 9 }}>●</span>
                    <span style={{ color: GREEN }}>{a.name}</span>
                    <span style={{ color: DIM }}>· {a.role}</span>
                  </div>
                  <div style={{ color: a.tone === "warn" ? AMBER : a.tone === "work" ? CYAN : DIM, fontSize: 11, paddingLeft: 17 }}>{a.status}</div>
                  <div style={{ color: FAINT, fontSize: 10, paddingLeft: 17 }}>brain: {a.brain} — {a.brainNote}</div>
                </div>
              ))}
            </div>
            {s.approval && !s.approval.resolved && (
              <div className="mt-3 p-2" style={{ border: `1px solid ${AMBER}`, borderRadius: 0 }}>
                <div style={{ color: AMBER, fontSize: 11 }}>{s.approval.text}</div>
                <div className="mt-2 flex gap-2" style={{ fontSize: 11 }}>
                  <button onClick={() => resolveApproval(true)} className="cursor-pointer px-2 py-0.5" style={{ border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 0 }}>[ APPROVE ]</button>
                  <button onClick={() => resolveApproval(false)} className="cursor-pointer px-2 py-0.5" style={{ border: `1px solid ${LINE}`, color: DIM, borderRadius: 0 }}>[ DECLINE ]</button>
                </div>
              </div>
            )}
          </Pane>

          <Pane title="SKILLS INSTALLED">
            <div className="flex flex-wrap gap-1.5">
              {["solana-pay", "auth-kit", "crm-core"].map((k) => (
                <span key={k} className="px-2 py-0.5" style={{ border: `1px solid ${LINE}`, color: GREEN, fontSize: 11, borderRadius: 0 }}>{k}</span>
              ))}
              <span className="px-2 py-0.5" style={{ border: `1px solid rgba(72,245,255,0.5)`, color: CYAN, fontSize: 11, borderRadius: 0 }}>+ store</span>
            </div>
            <div className="mt-2" style={{ color: FAINT, fontSize: 10.5 }}>skills are made by the community — creators earn GRID per install</div>
          </Pane>

          <Pane title="SESSION">
            <div className="flex justify-between" style={{ lineHeight: 2 }}>
              <span style={{ color: DIM }}>spent this hour</span><span>{s.grid.toFixed(1)} GRID</span>
            </div>
            <div className="flex justify-between" style={{ lineHeight: 2 }}>
              <span style={{ color: DIM }}>engine</span><span>grok-build · self-hosted</span>
            </div>
            <div className="flex justify-between" style={{ lineHeight: 2 }}>
              <span style={{ color: DIM }}>code leaves neugrid</span><span>never</span>
            </div>
          </Pane>

          <div style={{ color: FAINT, fontSize: 10.5, textAlign: "right" }}>[ LABS PROTOTYPE — design reference · docs/ECHO_STUDIO.md phase 0 ]</div>
        </div>
      </div>
    </div>
  );
}
