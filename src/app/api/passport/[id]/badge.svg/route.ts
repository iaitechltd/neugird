/** GET /api/passport/[id]/badge.svg — an embeddable, on-brand verified badge
 *  (phosphor-green on near-black) built from the real reputation passport:
 *  "NeuGrid ✓" + reputation total + credential count. Paste it into a GitHub
 *  README. A missing passport returns a neutral generic badge, never a throw. */

import { NextResponse } from "next/server";
import { Passport } from "@/lib/modules";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function badge(right: string, deepLink: string): string {
  const left = "NeuGrid ✓";
  const cw = 6.7; // ~char width @ 11px mono
  const padX = 11;
  const lw = Math.ceil(left.length * cw) + padX * 2;
  const rw = Math.ceil(right.length * cw) + padX * 2;
  const w = lw + rw;
  const h = 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(left)} ${esc(right)}">
  <title>${esc(left)} — ${esc(right)} · ${esc(deepLink)}</title>
  <rect width="${w}" height="${h}" fill="#020c07"/>
  <rect x="${lw}" width="${rw}" height="${h}" fill="#03170d"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#00ff00" stroke-opacity="0.4"/>
  <line x1="${lw}" y1="0" x2="${lw}" y2="${h}" stroke="#00ff00" stroke-opacity="0.25"/>
  <g font-family="'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace" font-size="11" letter-spacing="0.02em">
    <text x="${lw / 2}" y="19.5" fill="#00ff00" font-weight="700" text-anchor="middle">${esc(left)}</text>
    <text x="${lw + rw / 2}" y="19.5" fill="#7dffb0" text-anchor="middle">${esc(right)}</text>
  </g>
</svg>`;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deepLink = `/passport/${id}`;
  let right = "reputation passport";
  try {
    const p = Passport.build(id);
    if (p) {
      const n = p.credentials.length;
      right = `${p.reputation.total.toLocaleString()} rep · ${n} credential${n === 1 ? "" : "s"}`;
    }
  } catch {
    /* generic badge — never throw so the embed never breaks */
  }

  return new NextResponse(badge(right, deepLink), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
