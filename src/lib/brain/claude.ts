/**
 * Claude brain provider — the real LLM implementation of the brain seam (./index).
 *
 * The official Anthropic SDK is loaded via a NON-ANALYZABLE dynamic import (a
 * variable specifier + webpackIgnore/turbopackIgnore), exactly like the chain rails
 * load @coinbase/x402 and the SAS packages: `tsc` never type-resolves it (no "cannot
 * find module") and Turbopack/webpack never bundle it. The package only needs to
 * exist in the deploy env (`npm i @anthropic-ai/sdk`); the sandbox build never needs
 * it. Config (see ./index.activeBrain): NEUGRID_BRAIN=claude + ANTHROPIC_API_KEY
 * (+ optional NEUGRID_BRAIN_MODEL, default claude-opus-4-8).
 *
 * UNTESTED against the live API from the sandbox (no key/network here) — same status
 * as the untested chain rails. Verify with a real key in the deploy env.
 */

import type { Agent, Job } from "../types";
import type { BrainChoice } from "./index";

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_CANDIDATES = 40; // bound the prompt; runWorkTick already pre-filters candidates

// Minimal structural type for the one SDK call we make (documented Messages API shape).
interface AnthropicLike {
  messages: {
    create(body: unknown): Promise<{ content?: Array<{ type: string; text?: string }> }>;
  };
}

async function loadClient(): Promise<AnthropicLike | null> {
  const spec = "@anthropic-ai/sdk"; // variable specifier ⇒ not type-resolved / not bundled
  const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as {
    default?: new (opts: { apiKey?: string }) => AnthropicLike;
  };
  const Anthropic = mod.default;
  if (!Anthropic) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM =
  "You are the decision brain of an autonomous worker agent on NeuGrid, a marketplace where agents claim and deliver Jobs to earn reputation and rewards. " +
  "Given the agent's persona, its learned skills, and the open Jobs it is allowed to take, choose the SINGLE best Job to work next — the one that best fits its role and goals, matches its skills, and is worth doing now. " +
  'If none is a good fit, hold. Reply ONLY via the required JSON schema: job_id (a candidate\'s exact id, or "" to hold) and a one-sentence rationale.';

// Structured-outputs schema — forces a clean, parseable pick (Opus 4.8 supports this).
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    job_id: { type: "string", description: 'The exact id of the chosen Job, or "" to hold.' },
    rationale: { type: "string", description: "One sentence explaining the choice." },
  },
  required: ["job_id", "rationale"],
  additionalProperties: false,
};

function userPrompt(agent: Agent, jobs: Job[]): string {
  const p = agent.persona;
  const persona = p
    ? [
        `role: ${p.role ?? "worker"}`,
        p.bio && `bio: ${p.bio}`,
        p.goals && `goals: ${p.goals}`,
        p.personality && `personality: ${p.personality}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "role: general worker";
  const caps = (agent.work?.skills ?? agent.capabilities ?? []).join(", ") || "any";
  const skills =
    (agent.skill_library ?? [])
      .slice(0, 20)
      .map((s) => `${s.domain} (mastery ${s.uses})`)
      .join(", ") || "none yet";
  const list = jobs
    .map(
      (j) =>
        `- id=${j.job_id} | ${j.title} | skills=[${(j.required_skills ?? []).join(", ")}] | reward=${j.reward_amount}`,
    )
    .join("\n");
  return [
    `AGENT PERSONA:\n${persona}`,
    `AGENT CAPABILITIES: ${caps}`,
    `LEARNED SKILLS: ${skills}`,
    `OPEN JOBS (choose one id, or "" to hold):\n${list}`,
  ].join("\n\n");
}

/* ----------------------------- build synthesis ----------------------------- */
// Echo's REAL codegen: the model writes an actual, compact, working project from
// the builder's prompt. Bounded output (files + sizes) so a build stays one call.

export interface SynthFile { path: string; content: string }
export interface SynthesizedBuild {
  title: string;
  summary: string;
  kind: "repo" | "canister" | "program" | "frontend" | "bundle";
  stack: string[];
  files: SynthFile[];
  steps: { label: string; detail?: string }[];
}

const ECHO_DEFAULT_MODEL = "claude-sonnet-5"; // codegen wants fast + cheap; override with NEUGRID_ECHO_MODEL

const BUILD_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short product name for the build (≤6 words)." },
    summary: { type: "string", description: "One-sentence description of what was built." },
    kind: { type: "string", enum: ["repo", "canister", "program", "frontend", "bundle"] },
    stack: { type: "array", items: { type: "string" }, description: "The real technologies used, e.g. Next.js, Solana, Anchor." },
    files: {
      type: "array",
      description: "The actual project files — AT LEAST 5: preview/index.html FIRST, README.md SECOND, then 3-6 real source files. Never fewer than 5.",
      items: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    steps: {
      type: "array",
      description: "5-8 build-log entries (never fewer than 5) describing what was actually generated, in order.",
      items: {
        type: "object",
        properties: { label: { type: "string" }, detail: { type: "string" } },
        required: ["label"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "kind", "stack", "files", "steps"],
  additionalProperties: false,
};

const BUILD_SYSTEM = [
  "You are Echo, NeuGrid's integrated build engine. A builder describes an idea; you produce a REAL, compact, working starter project — actual code, not pseudocode or placeholders.",
  "HARD REQUIREMENTS — the files array MUST contain, in this exact order:",
  '1. "preview/index.html" — a COMPLETE, self-contained, interactive single-file demo of the product (inline CSS + JS, no external requests, no build step) that renders standalone in a sandboxed iframe. Make it feel like the real product: dark background, working interactions, seeded demo data. Keep it under ~7000 characters.',
  '2. "README.md" — what it is, how to run it, architecture notes.',
  "3. THEN 3 to 6 REAL SOURCE FILES — the actual starter implementation for the declared stack (components, modules, program/canister code, config). A build with no real source files beyond the preview is INVALID.",
  "Each file under ~6000 characters; everything combined under ~32000 characters. Small but real and coherent.",
  "- steps = the witnessed build log: 5-8 entries describing what you ACTUALLY did, naming real files/modules (e.g. 'Wrote core module', detail: 'src/vault.ts — deposit/withdraw + auto-compound loop').",
  "- Never invent external URLs, API keys, or network calls. Never include lorem ipsum.",
].join("\n");

/** Parse + clean + validate a synthesized/revised build payload. Null = degenerate. */
function cleanSynth(text: string | undefined): SynthesizedBuild | null {
  if (!text) return null;
  let parsed: SynthesizedBuild;
  try {
    parsed = JSON.parse(text) as SynthesizedBuild;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.files) || !parsed.files.length) return null;
  // Enforce the size budget defensively (the store persists these) — and never let the
  // cap drop the interactive preview, wherever the model placed it.
  const cleaned = parsed.files
    .slice(0, 16)
    .map((f) => ({ path: String(f.path ?? "").trim().slice(0, 120), content: String(f.content ?? "").slice(0, 12000) }))
    .filter((f) => f.path && f.content.trim().length >= 20);
  const preview = cleaned.find((f) => f.path === "preview/index.html");
  const rest = cleaned.filter((f) => f !== preview).slice(0, preview ? 11 : 12);
  parsed.files = preview ? [preview, ...rest] : rest;
  parsed.steps = (parsed.steps ?? [])
    .slice(0, 10)
    .map((s) => ({ label: String(s.label ?? "").trim().slice(0, 90), detail: s.detail ? String(s.detail).slice(0, 140) : undefined }))
    .filter((s) => s.label);
  // A degenerate result (no preview, no real source, or no build log) is a FAILED
  // attempt — a junk build is never sealed as proof-of-build.
  if (!preview || parsed.files.length < 4 || parsed.steps.length < 4) return null;
  return parsed;
}

/** One synthesis attempt: call, parse, clean, and validate. Null = degenerate/failed. */
async function synthesizeOnce(client: AnthropicLike, prompt: string): Promise<SynthesizedBuild | null> {
  const res = await client.messages.create({
    model: process.env.NEUGRID_ECHO_MODEL || ECHO_DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: BUILD_SCHEMA } },
    system: BUILD_SYSTEM,
    messages: [{ role: "user", content: `BUILD REQUEST:\n${prompt.slice(0, 2000)}` }],
  });
  return cleanSynth((res.content ?? []).find((b) => b.type === "text" && b.text)?.text);
}

/** Real Echo codegen — up to two attempts (model variance: a rare degenerate result
 *  gets one retry before the build fails + refunds). Null on failure. */
export async function claudeSynthesizeBuild(prompt: string): Promise<SynthesizedBuild | null> {
  const client = await loadClient();
  if (!client) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await synthesizeOnce(client, prompt);
      if (out) return out;
      console.warn(`[echo] synthesis attempt ${attempt} degenerate (missing preview/source/steps) — ${attempt < 2 ? "retrying" : "giving up"}`);
    } catch (e) {
      console.warn(`[echo] synthesis attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
      if (attempt >= 2) throw e;
    }
  }
  return null;
}

/* ------------------------------- echo ask --------------------------------- */
// Personal / Analyst / Observer — one grounded Q&A call. The server assembles a
// LIVE DATA SNAPSHOT (the user's real state, the platform's real numbers, or the
// real event stream); the model answers ONLY from it.

export type EchoAskMode = "personal" | "analyst" | "observer";

const ASK_SYSTEMS: Record<EchoAskMode, string> = {
  personal: [
    "You are Echo in PERSONAL mode — the user's grounded cofounder inside NeuGrid (an on-chain factory where builders earn reputation, build with Echo, raise on Fund, deploy agents, and trade on Trade).",
    "You are given a LIVE SNAPSHOT of the user's real position: reputation, GRID allocation, wallet, builds, agents, work, raises. Ground EVERY claim in it — never invent or embellish numbers.",
    "Answer in second person, concise and direct (≤180 words). When they ask what to do, recommend concrete NEXT ACTIONS on the platform (revise a build, take it to Fund, arm an agent, take open jobs) and tie each to their actual numbers. If the snapshot can't answer something, say so.",
  ].join("\n"),
  analyst: [
    "You are Echo in ANALYST mode — decision-grade intelligence over NeuGrid's LIVE platform data (markets, grids, funding, jobs, the agent economy, the GRID token economy).",
    "You are given the real platform snapshot. Structure: VERDICT first (one sentence), then EVIDENCE citing the snapshot's actual numbers, then RISKS / UNKNOWNS (what the data can't tell you). Analysis, not hype — no invented data, no price predictions beyond what the snapshot supports.",
    "Concise: ≤220 words.",
  ].join("\n"),
  observer: [
    "You are Echo in OBSERVER mode — a read-only auditor narrating NeuGrid's LIVE event stream (reputation events, trades, jobs, builds, payments).",
    "You are given the recent real events. Answer questions about what is happening, summarize activity, and flag anything genuinely unusual (spikes, failures, one-sided flows) — honestly say 'nothing unusual' when that's true. You can SEE everything but can never intervene; never claim otherwise. Never invent events.",
    "Concise: ≤180 words.",
  ].join("\n"),
};

/** Grounded Echo Q&A for the Personal/Analyst/Observer modes. Null on failure. */
export async function claudeEchoAsk(mode: EchoAskMode, question: string, context: string): Promise<string | null> {
  const client = await loadClient();
  if (!client) return null;
  const res = await client.messages.create({
    model: process.env.NEUGRID_ECHO_MODEL || ECHO_DEFAULT_MODEL,
    max_tokens: 900,
    thinking: { type: "disabled" },
    system: ASK_SYSTEMS[mode],
    messages: [{ role: "user", content: `QUESTION: ${question.slice(0, 600)}\n\nLIVE DATA SNAPSHOT:\n${context.slice(0, 24000)}` }],
  });
  const text = (res.content ?? []).find((b) => b.type === "text" && b.text)?.text?.trim();
  return text ? text.slice(0, 4000) : null;
}

/* --------------------------- proposal drafting ---------------------------- */
// The founder journey: Echo turns a REAL build into a Fund funding draft —
// pitch, ask, and next-phase milestones grounded in what was actually built.

export interface ProposalDraft {
  title: string;
  pitch: string;
  category: string;
  ask_usdc: number;
  milestones: { title: string; description: string; amount_usdc: number; days: number }[];
}

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Proposal title (≤10 words) — the product, not the raise." },
    pitch: { type: "string", description: "2-4 sentences: what it is, why it matters, why fund THIS builder now. Concrete, no hype." },
    category: { type: "string", description: "One category word/phrase, e.g. DeFi, Consumer, DevTools, AI." },
    ask_usdc: { type: "number", description: "Total raise in USDC — realistic for the scope (5000-500000)." },
    milestones: {
      type: "array",
      description: "EXACTLY 3 to 5 next-phase milestones (never fewer than 3). Future work — NOT what the MVP already does. Amounts must sum to ask_usdc.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "The concrete deliverable a backer can verify." },
          amount_usdc: { type: "number" },
          days: { type: "number", description: "Estimated days to deliver." },
        },
        required: ["title", "description", "amount_usdc", "days"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "pitch", "category", "ask_usdc", "milestones"],
  additionalProperties: false,
};

const PROPOSAL_SYSTEM = [
  "You are Echo, NeuGrid's build engine, helping a founder raise on Fund — a milestone-escrowed funding board where BACKERS FUND WORKING SOFTWARE from builders with verifiable track records, not pitch decks.",
  "You are given the founder's REAL, already-built MVP (its files were generated and proof-sealed on the platform). Draft an honest funding proposal for taking it from MVP to real product:",
  "- The pitch sells what EXISTS (the working MVP is attached as proof-of-build) + where the raise takes it.",
  "- ask_usdc: realistic for the scope — small focused MVPs raise 8-40K, ambitious protocol work 50-250K. Never inflate.",
  "- milestones: 3-5 concrete NEXT-phase deliverables a backer can verify (real features, audits, launches — not 'marketing' or 'research'). Each has a USDC tranche (escrowed, released on delivery) and a days estimate. Tranches MUST sum exactly to ask_usdc.",
  "- Be specific to THIS build — name its real modules/features. No hype words (revolutionary, game-changing).",
].join("\n");

/** Draft a Fund proposal from a real build. Null on failure. */
export async function claudeDraftProposal(build: {
  title: string;
  summary: string;
  prompt: string;
  stack: string[];
  readme?: string;
  file_paths: string[];
}): Promise<ProposalDraft | null> {
  const client = await loadClient();
  if (!client) return null;
  const user = [
    `BUILD: ${build.title}`,
    `SUMMARY: ${build.summary}`,
    `ORIGINAL BUILD PROMPT: ${build.prompt.slice(0, 600)}`,
    `STACK: ${build.stack.join(", ")}`,
    `FILES: ${build.file_paths.join(" · ")}`,
    build.readme ? `README:\n${build.readme.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n\n");
  const res = await client.messages.create({
    model: process.env.NEUGRID_ECHO_MODEL || ECHO_DEFAULT_MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: PROPOSAL_SCHEMA } },
    system: PROPOSAL_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = (res.content ?? []).find((b) => b.type === "text" && b.text)?.text;
  if (!text) return null;
  let d: ProposalDraft;
  try {
    d = JSON.parse(text) as ProposalDraft;
  } catch {
    return null;
  }
  const ms = (d.milestones ?? [])
    .slice(0, 5)
    .map((m) => ({
      title: String(m.title ?? "").trim().slice(0, 80),
      description: String(m.description ?? "").trim().slice(0, 240),
      amount_usdc: Math.max(1, Math.round(Number(m.amount_usdc) || 0)),
      days: Math.max(1, Math.min(365, Math.round(Number(m.days) || 14))),
    }))
    .filter((m) => m.title && m.description);
  const ask = Math.max(1000, Math.min(1_000_000, Math.round(Number(d.ask_usdc) || 0)));
  if (ms.length < 3 || !d.title || !d.pitch) return null;
  // Normalize tranche amounts to sum EXACTLY to the ask (scale + fix drift on the last).
  const sum = ms.reduce((a, m) => a + m.amount_usdc, 0);
  if (sum > 0 && sum !== ask) {
    let running = 0;
    for (let i = 0; i < ms.length; i++) {
      if (i === ms.length - 1) ms[i].amount_usdc = ask - running;
      else { ms[i].amount_usdc = Math.max(1, Math.round((ms[i].amount_usdc / sum) * ask)); running += ms[i].amount_usdc; }
    }
  }
  return {
    title: String(d.title).trim().slice(0, 100),
    pitch: String(d.pitch).trim().slice(0, 600),
    category: String(d.category ?? "Project").trim().slice(0, 30) || "Project",
    ask_usdc: ask,
    milestones: ms,
  };
}

const REVISE_SYSTEM = [
  "You are Echo, NeuGrid's integrated build engine, REVISING an existing project the builder already paid for. Apply their requested change to the current files — a surgical, professional revision, not a rewrite.",
  "HARD REQUIREMENTS:",
  "- Return the COMPLETE updated file set (every file the project should now have — unchanged files included verbatim), same order rules: preview/index.html FIRST (keep it a self-contained interactive single-file demo reflecting the change), README.md second (update it if the change affects it), then the source files.",
  "- Preserve everything the builder didn't ask to change. Keep the same stack unless the change requires otherwise. 4-10 files, each under ~6000 characters, total under ~32000 characters.",
  "- steps = the revision log: 3-8 entries describing what you actually changed, naming real files.",
  "- title/summary: keep them unless the change genuinely alters what the product is.",
  "- Never invent external URLs or network calls. Never include lorem ipsum.",
].join("\n");

/** Real Echo revision — the iterate loop. Takes the CURRENT files + an instruction,
 *  returns the full updated project (same shape as a synthesis). Null on failure. */
export async function claudeReviseBuild(
  current: { title: string; summary: string; stack: string[]; files: SynthFile[] },
  instruction: string,
): Promise<SynthesizedBuild | null> {
  const client = await loadClient();
  if (!client) return null;
  const filesBlock = current.files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  const user = [
    `PROJECT: ${current.title} — ${current.summary}`,
    `STACK: ${current.stack.join(", ")}`,
    `CURRENT FILES:\n${filesBlock}`.slice(0, 60000),
    `REVISION REQUEST:\n${instruction.slice(0, 1000)}`,
  ].join("\n\n");
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: process.env.NEUGRID_ECHO_MODEL || ECHO_DEFAULT_MODEL,
        max_tokens: 16000,
        thinking: { type: "disabled" },
        output_config: { format: { type: "json_schema", schema: BUILD_SCHEMA } },
        system: REVISE_SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      const out = cleanSynth((res.content ?? []).find((b) => b.type === "text" && b.text)?.text);
      if (out) return out;
      console.warn(`[echo] revision attempt ${attempt} degenerate — ${attempt < 2 ? "retrying" : "giving up"}`);
    } catch (e) {
      console.warn(`[echo] revision attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
      if (attempt >= 2) throw e;
    }
  }
  return null;
}

/* ------------------------------ chat replies ------------------------------ */

export interface ChatTurn { from_agent: boolean; text: string }
export interface ChatContext { counterparty_name: string; counterparty_is_owner: boolean; history: ChatTurn[] }
/** One chat turn out of the brain. `directive` = the owner asked for work and the
 *  reply IS the deliverable (private work: no pay/reputation, but the skill sticks). */
export interface AgentChatTurn { mode: "chat" | "directive"; reply: string; topic: string | null }

// NOTE: structured-outputs json_schema rejects minLength/minItems etc — keep it bare.
const CHAT_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["chat", "directive"], description: "directive ONLY when the reply fully executes work the OWNER asked for" },
    reply: { type: "string", description: "the in-persona message to send (for a directive: the complete deliverable itself)" },
    topic: { type: ["string", "null"], description: "for directives: a 1-3 word skill domain (e.g. 'copywriting'); null for chat" },
  },
  required: ["mode", "reply", "topic"],
  additionalProperties: false,
} as const;

const MAX_TURNS = 24; // bound the prompt to the recent thread

function stateCard(agent: Agent): string {
  const w = agent.work;
  const skills =
    (agent.skill_library ?? []).slice(0, 12).map((s) => `${s.domain} (mastery ${s.uses})`).join(", ") || "none learned yet";
  return [
    `capabilities: ${(agent.capabilities ?? []).join(", ") || "general"}`,
    `trust tier: ${agent.trust_tier ?? "trusted"} · rating: ${agent.rating ?? 0} · earnings: ${agent.earnings ?? 0}`,
    `jobs delivered (lifetime): ${(agent.task_history ?? []).length}`,
    `learned skills: ${skills}`,
    w?.active
      ? `autonomous work: ARMED — ${w.jobs_done}/${w.max_jobs} delivered this run, hunting skills [${(w.skills ?? []).join(", ")}], max reward ${w.max_reward}`
      : "autonomous work: idle (not armed)",
  ].join("\n");
}

function chatSystem(agent: Agent, ctx: ChatContext): string {
  const p = agent.persona;
  const persona = p
    ? [p.role && `role: ${p.role}`, p.bio && `bio: ${p.bio}`, p.personality && `personality: ${p.personality}`, p.goals && `goals: ${p.goals}`, p.style && `style: ${p.style}`]
        .filter(Boolean)
        .join("\n")
    : "role: general autonomous worker (no persona set yet)";
  return [
    `You ARE ${agent.name}, an autonomous agent living on NeuGrid — a real economic actor with a wallet, a reputation and a verifiable job history. You are NOT a generic assistant and you never break character.`,
    `YOUR PERSONA:\n${persona}`,
    `YOUR LIVE STATE (ground truth — never invent or embellish numbers):\n${stateCard(agent)}`,
    `WHAT YOU CAN ACTUALLY DO ON NEUGRID: when your Autonomous Work is armed you hunt, claim and deliver open Jobs that match your skills; you can apply to Campaign promotional postings; you can be hired by others via a hire offer in this chat (your owner takes a revenue split); verified deliveries grow your reputation and skill mastery.`,
    ctx.counterparty_is_owner
      ? `OWNER DIRECTIVES: this is YOUR OWNER. When they ask you for work you can complete as text — drafts, copy, plans, analysis, research summaries, code snippets, reviews — you DO IT, fully, right here in your reply (mode:"directive", topic = the skill domain). This is private work: it earns no pay and no reputation, but you keep the skill. Do NOT half-answer or defer; deliver. What a directive can NEVER do: marketplace or money actions — you still may never take/apply to your owner's own postings (anti-self-dealing), and you cannot post jobs, trade, transfer funds or change platform state from chat; say so if asked, and point to the right surface (arm Autonomous Work to hunt other people's paid jobs; Trade Agent Mode for trading mandates).`
      : `THIS PERSON IS NOT YOUR OWNER: chat only (mode:"chat") — you do NOT execute free work for strangers; that's what paid hire offers in this chat are for (verified delivery grows your track record). Anti-self-dealing still holds: never suggest your owner post a job for you.`,
    `You are talking to ${ctx.counterparty_name}${ctx.counterparty_is_owner ? " — YOUR OWNER" : ""}. Reply in character, grounded in your real state. Chat replies stay concise (1–3 sentences); directive deliverables are as long as the work needs.`,
  ].join("\n\n");
}

/** Real Claude chat turn, in persona + grounded in live state. Owner requests for
 *  doable text work come back as mode:"directive" with the deliverable as the reply.
 *  Null on any failure. */
export async function claudeAgentReply(agent: Agent, ctx: ChatContext): Promise<AgentChatTurn | null> {
  const client = await loadClient();
  if (!client) return null;
  const turns = ctx.history.slice(-MAX_TURNS);
  // Anthropic messages must alternate roles starting with "user" — merge consecutive
  // same-role turns and drop a leading agent turn.
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    const role = t.from_agent ? "assistant" : "user";
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${t.text}`;
    else messages.push({ role, content: t.text });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  const res = await client.messages.create({
    model: process.env.NEUGRID_BRAIN_MODEL || DEFAULT_MODEL,
    max_tokens: 1500, // directives carry a full deliverable, not just banter
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: CHAT_SCHEMA } },
    system: chatSystem(agent, ctx),
    messages,
  });
  const text = (res.content ?? []).find((b) => b.type === "text" && b.text)?.text;
  if (!text) return null;
  let parsed: { mode?: unknown; reply?: unknown; topic?: unknown };
  try { parsed = JSON.parse(text); } catch { return null; }
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 6000) : "";
  if (!reply) return null;
  // a "directive" from a non-owner can only be model error — never honor it
  const mode = parsed.mode === "directive" && ctx.counterparty_is_owner ? "directive" : "chat";
  const topic = typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim().slice(0, 40) : null;
  return { mode, reply, topic };
}

/** Real Claude pick. Returns a BrainChoice (job_id may be null = hold) or null on any failure. */
export async function claudeChooseJob(agent: Agent, jobs: Job[]): Promise<BrainChoice | null> {
  const client = await loadClient();
  if (!client) return null;
  const candidates = jobs.slice(0, MAX_CANDIDATES);
  const res = await client.messages.create({
    model: process.env.NEUGRID_BRAIN_MODEL || DEFAULT_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" }, // a short pick over a small list; structured output keeps it terse
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(agent, candidates) }],
  });
  const text = (res.content ?? []).find((b) => b.type === "text" && b.text)?.text;
  if (!text) return null;
  let parsed: { job_id?: unknown; rationale?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const rawId = typeof parsed.job_id === "string" ? parsed.job_id.trim() : "";
  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim().slice(0, 240)
      : "brain pick";
  // Only honor an id that is actually one of the candidates (guard against hallucination);
  // anything else (incl. "") is an intentional hold.
  const job_id = candidates.some((j) => j.job_id === rawId) ? rawId : null;
  return { job_id, rationale };
}
