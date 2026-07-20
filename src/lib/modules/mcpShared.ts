/**
 * Shared MCP plumbing — used by BOTH the per-user Toolbox (toolbox.ts) and the
 * per-workspace room (studio.ts). One catalog, one entry-builder, one config
 * writer, one masker, one health parser — so a connection behaves identically
 * whether it's a builder's standing toolbox item or a project-only add.
 *
 * The engine discovers `<cwd>/.grok/config.toml` [mcp_servers.*] automatically; a
 * self-built engine skips the folder-trust ceremony, so OUR explicit connect
 * action is the consent gate. Secrets live server-side and are MASKED in views.
 */

import { nowISO } from "../id";
import type { StudioWorkspace } from "../types";

export type McpEntry = NonNullable<StudioWorkspace["mcp"]>[number];

/** The curated catalog — command lines we wrote, not the user (the trust model). */
export const MCP_CATALOG: Record<string, { label: string; desc: string; command: string; args: string[]; input?: { key: string; label: string; kind: "env" | "arg"; placeholder: string } }> = {
  "github": { label: "GitHub", desc: "read repos, open issues & PRs, push code", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], input: { key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "personal access token", kind: "env", placeholder: "ghp_…" } },
  "postgres": { label: "Postgres", desc: "let the engine query your real database", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], input: { key: "connection_url", label: "connection URL", kind: "arg", placeholder: "postgresql://user:pass@host/db" } },
  "notion": { label: "Notion", desc: "read & write your Notion pages and databases", command: "npx", args: ["-y", "@notionhq/notion-mcp-server"], input: { key: "NOTION_TOKEN", label: "integration token", kind: "env", placeholder: "ntn_…" } },
  "brave-search": { label: "Brave Search", desc: "give builds real web search", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], input: { key: "BRAVE_API_KEY", label: "API key", kind: "env", placeholder: "BSA…" } },
  "google-maps": { label: "Google Maps", desc: "places, directions & geocoding in builds", command: "npx", args: ["-y", "@modelcontextprotocol/server-google-maps"], input: { key: "GOOGLE_MAPS_API_KEY", label: "API key", kind: "env", placeholder: "AIza…" } },
  "mcp-test": { label: "Test server", desc: "a sandbox MCP with demo tools — try the flow", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"] },
};
// Email / calendars / 7,000-app hubs (Zapier, Composio) expose HOSTED MCP URLs —
// they ride the "remote" kind (paste the URL), not this command catalog.

export function catalogView() {
  return Object.entries(MCP_CATALOG).map(([kind, c]) => ({ kind, label: c.label, desc: c.desc, needs: c.input ? { label: c.input.label, placeholder: c.input.placeholder } : null }));
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "mcp";

export interface McpInput { kind: string; name?: string; value?: string; command?: string; args?: string; url?: string; header?: string }

/** Build a validated connection entry from user input (no persistence). */
export function buildMcpEntry(input: McpInput): { entry?: McpEntry; error?: string } {
  const at = nowISO();
  if (input.kind === "remote") {
    const url = (input.url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(url)) return { error: "valid_url_required" };
    let headers: Record<string, string> | undefined;
    const h = (input.header ?? "").trim();
    if (h) { const i = h.indexOf(":"); if (i > 0) headers = { [h.slice(0, i).trim()]: h.slice(i + 1).trim() }; }
    let host = "remote";
    try { host = new URL(url).hostname.split(".")[0] || "remote"; } catch { /* keep default */ }
    return { entry: { name: slugify(input.name || host), kind: "remote", url, headers, added_at: at } };
  }
  if (input.kind === "custom") {
    const command = (input.command ?? "").trim();
    const args = (input.args ?? "").trim().split(/\s+/).filter(Boolean);
    if (!command) return { error: "command_required" };
    return { entry: { name: slugify(input.name || command.split("/").pop() || "custom"), kind: "custom", command, args, added_at: at } };
  }
  const cat = MCP_CATALOG[input.kind];
  if (!cat) return { error: "unknown_service" };
  const value = (input.value ?? "").trim();
  if (cat.input && !value) return { error: "credential_required" };
  return { entry: {
    name: slugify(input.name || input.kind), kind: input.kind as McpEntry["kind"],
    command: cat.command,
    args: cat.input?.kind === "arg" && value ? [...cat.args, value] : [...cat.args],
    env: cat.input?.kind === "env" && value ? { [cat.input.key]: value } : undefined,
    added_at: at,
  } };
}

const tomlStr = (s: string) => JSON.stringify(s); // JSON string escaping is valid TOML

/** Render a `.grok/config.toml` body from a connection list (empty ⇒ ""). */
export function mcpConfigToml(list: McpEntry[]): string {
  if (!list.length) return "";
  const lines: string[] = ["# generated by NeuGrid Echo Studio — connected services (your toolbox + this project)"];
  for (const m of list) {
    lines.push("", `[mcp_servers.${m.name}]`);
    if (m.url) {
      lines.push(`url = ${tomlStr(m.url)}`);
      const headers = Object.entries(m.headers ?? {});
      if (headers.length) lines.push(`headers = { ${headers.map(([k, v]) => `${tomlStr(k)} = ${tomlStr(v)}`).join(", ")} }`);
    } else {
      lines.push(`command = ${tomlStr(m.command ?? "")}`, `args = [${(m.args ?? []).map(tomlStr).join(", ")}]`);
      const env = Object.entries(m.env ?? {});
      if (env.length) lines.push(`env = { ${env.map(([k, v]) => `${tomlStr(k)} = ${tomlStr(v)}`).join(", ")} }`);
    }
  }
  return lines.join("\n") + "\n";
}

/** The public, SECRET-MASKED shape of a connection (for any view). */
export function maskMcp(m: McpEntry, health?: { ok: boolean; note: string } | null, scope?: "toolbox" | "project") {
  return {
    name: m.name, kind: m.kind, scope: scope ?? undefined,
    command: m.url ? m.url.replace(/^(https?:\/\/[^/]+).*/, "$1/…") : `${m.command} ${(m.args ?? []).filter((a) => !a.includes("://")).join(" ")}`.trim(),
    secret: m.env ? Object.keys(m.env).join(", ") : m.headers ? Object.keys(m.headers).join(", ") : ((m.args ?? []).some((a) => a.includes("://")) ? "connection URL" : null),
    added_at: m.added_at,
    health: health ?? null,
  };
}

/** Parse the engine's `mcp doctor` output into a per-server health map. */
export function parseDoctor(out: string, names: string[]): Record<string, { ok: boolean; note: string }> {
  const lines = out.split("\n");
  const clip = (s: string) => (s.length > 120 ? s.slice(0, 119) + "…" : s);
  const servers: Record<string, { ok: boolean; note: string }> = {};
  for (const name of names) {
    const start = lines.findIndex((l) => new RegExp(`^\\s*${name}\\s*\\(`).test(l));
    if (start < 0) { servers[name] = { ok: false, note: "the doctor didn't reach this server" }; continue; }
    const block: string[] = [];
    for (let i = start + 1; i < lines.length && /^\s+/.test(lines[i]) && lines[i].trim(); i++) block.push(lines[i].trim());
    const failed = block.some((l) => /✗|error|fail|not found|unreachable|timed?.?out/i.test(l));
    const tools = block.find((l) => /tools? discovered/i.test(l));
    const handshook = block.some((l) => /handshake ok/i.test(l));
    servers[name] = { ok: !failed && (!!tools || handshook), note: clip(tools || block.find((l) => /✗|error|fail/i.test(l)) || block[block.length - 1] || "no detail") };
  }
  return servers;
}
