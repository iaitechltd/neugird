/**
 * GET /api/echo/builds/[id]/preview — the build's REAL interactive demo: serves the
 * model-generated `preview/index.html` (a self-contained single-file app). Rendered
 * inside a sandboxed iframe by the Builder; the CSP sandbox header keeps the
 * generated code isolated (scripts run, but no same-origin access, no navigation).
 */

import { Echo } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const build = Echo.getBuild(id);
  const html = build?.artifact.files?.find((f) => f.path === "preview/index.html")?.content;
  if (!html) return new Response("No preview for this build.", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;",
      "cache-control": "no-store",
    },
  });
}
