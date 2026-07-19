/**
 * GET /api/studio/[id]/export — download the workshop's RECEIPT as Markdown:
 * the build, every crew turn, every sealed trail step, checkpoints, and the
 * exact spend (GRID + the engine's own reported dollars). Owner-only —
 * "a receipt, not a claim", in a file you can hand to anyone.
 */

import { getCurrentUserId } from "@/lib/session";
import { Studio } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const v = Studio.view(id, uid);
  if (!v) return new Response("not found", { status: 404 });

  const w = v.workspace;
  const lines: string[] = [
    `# ${w.name} — Echo Studio receipt`,
    "",
    `- workspace: \`${w.workspace_id}\` · status: ${w.status}`,
    v.build ? `- build: **${v.build.title}** v${v.build.version} · proof \`${v.build.proof ?? "—"}\`` : "- build: none yet",
    v.build?.deployment ? `- live: ${v.build.deployment.url} (v${v.build.deployment.version})` : "",
    `- action trail: **${v.trail_len} sealed steps** · seal \`${w.trail_sha ?? "—"}\``,
    `- spend: **${Math.round(w.spent_grid)} GRID** · engine-reported cost **$${(v.spent_usd ?? 0).toFixed(2)}**`,
    "",
    "## The room (crew turns)",
    "",
    ...v.turns.map((t) => {
      const meta = [
        t.version !== undefined ? `v${t.version}` : "",
        t.files_changed ? `${t.files_changed} file(s)` : "",
        t.duration_s ? `${Math.round(t.duration_s)}s` : "",
        t.cost_usd ? `$${t.cost_usd.toFixed(2)}` : "",
        t.quality ? t.quality : "",
        t.grade ? `grade: ${t.grade}` : "",
      ].filter(Boolean).join(" · ");
      return `- **${t.role.toUpperCase()}** ${t.text}${meta ? `  \n  _${meta}_` : ""}`;
    }),
    "",
    "## Checkpoints",
    "",
    ...(v.checkpoints.length
      ? v.checkpoints.map((c) => `- v${c.version} — ${c.note} · ${c.files} files · proof \`${c.proof}\``)
      : ["- none yet"]),
    "",
    `## The sealed action trail (last ${v.trail.length} of ${v.trail_len})`,
    "",
    ...v.trail.map((e) => `- \`${e.at}\` **${e.type}** ${e.summary}`),
    "",
    `---`,
    `exported ${new Date().toISOString()} · every step above is inside seal \`${w.trail_sha ?? "—"}\``,
  ].filter((l) => l !== "");

  const slug = w.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workshop";
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-receipt.md"`,
    },
  });
}
