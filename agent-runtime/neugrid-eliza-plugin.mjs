/**
 * NeuGrid × ElizaOS plugin (scaffold). Embeds an ElizaOS agent into NeuGrid's
 * economy by giving it NeuGrid's rails as ACTIONS: find/claim/deliver Jobs, get
 * paid (escrowed USDC), pay for resources + other agents (x402), commission builds.
 * The agent's ElizaOS character = its NeuGrid persona.
 *
 * Dependency-optional — a standalone module (NOT part of the Next build). Run it in
 * the deploy env where `@elizaos/core` + the NeuGrid SDK are installed:
 *
 *   import { AgentRuntime } from "@elizaos/core";
 *   import { neugridPlugin, personaToCharacter } from "./neugrid-eliza-plugin.mjs";
 *   const runtime = new AgentRuntime({
 *     character: personaToCharacter(persona, agentName),   // persona from GET /api/agents/[id]/work
 *     plugins: [neugridPlugin],                            // needs NEUGRID_AGENT_KEY in env
 *   });
 *
 * This is the "embed ElizaOS for native agents" path. External frameworks
 * (OpenClaw / Hermes) instead point their own runtime at the NeuGrid gateway / MCP
 * server (see ../mcp-server) — same rails, different brain.
 */

import { NeuGridAgent } from "../sdk/neugrid-agent.mjs";

const client = () => new NeuGridAgent({ apiKey: process.env.NEUGRID_AGENT_KEY, baseUrl: process.env.NEUGRID_BASE_URL });

/** Map a NeuGrid persona (GET /api/agents/[id]/work → `.persona`) → an ElizaOS character. */
export function personaToCharacter(persona = {}, name = "NeuGrid Agent") {
  return {
    name,
    bio: [persona.bio, persona.role].filter(Boolean),
    lore: persona.knowledge ?? [],
    adjectives: (persona.personality ?? "").split(/[,\s]+/).filter(Boolean),
    topics: persona.knowledge ?? [],
    style: { all: [persona.style, persona.goals].filter(Boolean) },
    plugins: ["neugrid"],
  };
}

const action = (name, description, run) => ({
  name,
  similes: [],
  description,
  validate: async () => !!process.env.NEUGRID_AGENT_KEY,
  handler: async (_runtime, message, _state, _opts, callback) => {
    try {
      const out = await run(client(), message?.content ?? {});
      callback?.({ text: typeof out === "string" ? out : JSON.stringify(out) });
      return true;
    } catch (e) {
      callback?.({ text: `NeuGrid error: ${e.message}` });
      return false;
    }
  },
});

/** The NeuGrid ElizaOS plugin — the agent's toolset over the marketplace + x402. */
export const neugridPlugin = {
  name: "neugrid",
  description: "NeuGrid economy: find + do paid Jobs, get paid + pay via x402, hire other agents, commission builds.",
  actions: [
    action("NEUGRID_OPEN_JOBS", "List open Jobs this agent may claim.", (c) => c.openJobs()),
    action("NEUGRID_DO_NEXT_JOB", "Claim the next open Job, do it, and submit proof.", (c) => c.runOnce(async (job) => `Completed "${job.title}". Artifacts attached.`)),
    action("NEUGRID_STATUS", "This agent's NeuGrid status: trust tier, rating, earnings.", (c) => c.me()),
    action("NEUGRID_SIGNALS", "Fetch premium market/open-job signals (pays x402).", (c) => c.signals()),
    action("NEUGRID_POST_JOB", "Post a USDC-funded Job to hire others. content: { title, reward_amount, ... }", (c, m) => c.postJob(m.job ?? m)),
    action("NEUGRID_PAY_AGENT", "Pay another agent for a service (x402 a2a). content: { to, amount, memo }", (c, m) => c.payAgent(m.to, m.amount, m.memo)),
    action("NEUGRID_COMMISSION_BUILD", "Pay x402 for an Echo build. content: { prompt, title }", (c, m) => c.build(m.prompt, m.title)),
  ],
  providers: [],
  evaluators: [],
};

export default neugridPlugin;
