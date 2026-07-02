/**
 * GET /d/[slug] — NeuGrid hosting. Serves a deployed build's standalone app at its
 * live public URL (the version-pinned snapshot sealed at deploy time).
 *
 * Security: generated code runs under a CSP sandbox WITHOUT same-origin — it can
 * never read platform cookies/state. That gives the page an opaque origin, where
 * `localStorage` throws, so a tiny in-memory shim is injected (apps keep working;
 * their local state just doesn't persist across reloads). Production hardening =
 * move /d/ to its own domain, then drop the sandbox.
 */

import { Echo } from "@/lib/modules";

export const dynamic = "force-dynamic";

const STORAGE_SHIM = `<script>try{window.localStorage.getItem("__t")}catch(e){(function(){var m=new Map();var shim={getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null}};Object.defineProperty(shim,"length",{get:function(){return m.size}});try{Object.defineProperty(window,"localStorage",{value:shim,configurable:true});Object.defineProperty(window,"sessionStorage",{value:shim,configurable:true})}catch(_e){}})()}</script>`;

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const live = Echo.deploymentBySlug(slug);
  if (!live) {
    return new Response("Nothing is deployed at this address.", { status: 404, headers: { "content-type": "text/plain" } });
  }
  // inject the storage shim as the FIRST thing in <head> so it runs before app code
  const html = live.deployment.html.replace(/<head([^>]*)>/i, (m) => `${m}${STORAGE_SHIM}`);
  return new Response(html.includes(STORAGE_SHIM) ? html : STORAGE_SHIM + live.deployment.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-forms allow-modals allow-popups;",
      "x-neugrid-deployment": `${slug} v${live.deployment.version} | ${live.deployment.proof}`,
      "cache-control": "no-store",
    },
  });
}
