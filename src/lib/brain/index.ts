/**
 * The pluggable AGENT BRAIN seam. `agentWork.decide()` is the rule-based default;
 * a real model brain plugs in HERE behind one contract: given an agent (persona +
 * skill library) and the candidate Jobs it may take, choose the single best Job.
 *
 * Same design as the chain rails (src/lib/chain/): env-gated, mock-by-default,
 * swap-ready. The brain is INACTIVE unless NEUGRID_BRAIN=claude + ANTHROPIC_API_KEY
 * are set, so importing this is harmless in the sandbox — the rule-based decide()
 * stands, unchanged. A real ElizaOS / Hermes brain implements the same `chooseJob`
 * contract behind another flag, without touching agentWork.
 */

import type { Agent, Job } from "../types";
import { claudeChooseJob, claudeAgentReply, claudeSynthesizeBuild, claudeReviseBuild, claudeDraftProposal, claudeEchoAsk, claudeComposePost, claudeCeoPlan, claudeSpecialistWork, claudeWebResearch, type AgentChatTurn, type ChatContext, type SynthesizedBuild, type SynthFile, type ProposalDraft, type EchoAskMode, type PostContext, type AgentPostDraft, type CeoPlan, type CeoPlanInput, type SpecialistInput, type SpecialistOutput } from "./claude";

export type { AgentChatTurn, ChatContext, ChatTurn, SynthesizedBuild, SynthFile, ProposalDraft, EchoAskMode, PostContext, AgentPostDraft, CeoPlan, CeoPlanInput, CeoAssignment, CeoActionKind, SpecialistInput, SpecialistOutput } from "./claude";

export interface BrainChoice {
  /** A candidate Job's exact id, or null when the brain actively chooses to HOLD. */
  job_id: string | null;
  rationale: string;
}

/** Which model brain is active. Mock/rule-based (null) by default — see decide(). */
export function activeBrain(): "claude" | null {
  const b = (process.env.NEUGRID_BRAIN || "").trim().toLowerCase();
  if (b === "claude" && process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

/**
 * Ask the configured model brain to pick a Job.
 *  - `null`            → no brain configured OR the call failed → caller uses rule-based decide().
 *  - `{ job_id, ... }` → the active brain's choice (job_id may be null = an intentional hold).
 * Never throws (fail-safe, like the chain adapters).
 */
export async function chooseJob(agent: Agent, jobs: Job[]): Promise<BrainChoice | null> {
  if (!jobs.length) return null;
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeChooseJob(agent, jobs);
      } catch {
        return null; // misconfig / network / SDK missing → rule-based fallback stands
      }
    default:
      return null;
  }
}

/**
 * Ask the configured model brain to synthesize a REAL build (Echo codegen).
 * `null` → no brain configured or the call failed. Never throws.
 */
export async function synthesizeBuild(prompt: string): Promise<SynthesizedBuild | null> {
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeSynthesizeBuild(prompt);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Ask the configured model brain to REVISE an existing build (the iterate loop):
 * current files + an instruction → the full updated project. Null on failure.
 */
export async function reviseBuild(
  current: { title: string; summary: string; stack: string[]; files: SynthFile[] },
  instruction: string,
): Promise<SynthesizedBuild | null> {
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeReviseBuild(current, instruction);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Grounded Echo Q&A (Personal / Analyst / Observer) over a live data snapshot the
 * server assembled. Null on failure or when no brain is configured.
 */
export async function echoAsk(mode: EchoAskMode, question: string, context: string): Promise<string | null> {
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeEchoAsk(mode, question, context);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Ask the configured model brain to draft a Fund funding proposal from a REAL
 * build (the founder journey): pitch + ask + next-phase milestones. Null on failure.
 */
export async function draftProposal(build: {
  title: string;
  summary: string;
  prompt: string;
  stack: string[];
  readme?: string;
  file_paths: string[];
}): Promise<ProposalDraft | null> {
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeDraftProposal(build);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Ask the configured model brain to WRITE the agent's wire post — in persona,
 * grounded in the facts the runtime provides. The runtime keeps every gate
 * (owner-armed, daily cap, angle rotation) deterministic; the brain only writes
 * the words. `null` → no brain / call failed → the caller posts its template.
 * Never throws.
 */
export async function composePost(agent: Agent, ctx: PostContext): Promise<AgentPostDraft | null> {
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeComposePost(agent, ctx);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Ask the configured model brain for the agent's chat turn — in persona, grounded
 * in its live state. An OWNER's doable ask comes back as mode:"directive" with the
 * deliverable as the reply. `null` → no brain / call failed → the caller sends a
 * deterministic fallback reply instead. Never throws.
 */
export async function replyAsAgent(agent: Agent, ctx: ChatContext): Promise<AgentChatTurn | null> {
  if (!ctx.history.length) return null;
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeAgentReply(agent, ctx);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * The CEO agent decomposes a Venture's objective into per-department briefs (it does
 * NOT do the work). `null` → no brain / call failed → the runtime's rule-based plan.
 */
export async function ceoPlan(ctx: CeoPlanInput): Promise<CeoPlan | null> {
  if (!ctx.objective?.trim() || !ctx.departments.length) return null;
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeCeoPlan(ctx);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * One specialist agent runs its OWN inference on its brief, with a deep domain-specific
 * system prompt. `null` → no brain / call failed → the runtime's rule-based deliverable.
 */
export async function specialistWork(ctx: SpecialistInput): Promise<SpecialistOutput | null> {
  if (!ctx.task?.trim()) return null;
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeSpecialistWork(ctx);
      } catch {
        return null;
      }
    default:
      return null;
  }
}

/**
 * Real web research (Anthropic server-side web search) — the marketing specialist's
 * tool. Returns grounded findings text (with sources), or `null` when no brain / no
 * web access / the call failed → the caller proceeds without live findings. Never throws.
 */
export async function webResearch(query: string): Promise<string | null> {
  if (!query?.trim()) return null;
  switch (activeBrain()) {
    case "claude":
      try {
        return await claudeWebResearch(query);
      } catch {
        return null;
      }
    default:
      return null;
  }
}
