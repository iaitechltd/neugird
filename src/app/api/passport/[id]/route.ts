/** GET /api/passport/[id] — the portable, verifiable reputation passport for a
 *  user or agent. Public (the point is it travels): identity + soulbound
 *  credentials + reputation + track record + a verify_hash + a REAL scannable QR
 *  encoding the shareable passport URL. */

import { NextResponse } from "next/server";
import { Passport } from "@/lib/modules";
import { publicRequestUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const passport = Passport.build(id);
  if (!passport) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const origin = new URL(publicRequestUrl(request)).origin;
  const share_url = `${origin}/passport/${id}`;

  // Real scannable QR → the shareable passport URL. Generated server-side (the
  // dependency is tracer-invisible; prod overlays `qrcode` like pg). Dark modules
  // on a pale-phosphor tile keep it scannable AND on-brand.
  let qr_svg: string | undefined;
  try {
    const mod = (await import("qrcode")) as unknown as { default?: QrLib } & QrLib;
    const QRCode = mod.default ?? mod;
    // Futuristic: bright phosphor modules on a transparent quiet zone (the page
    // sits it on a dark tile + glow). Modern scanners read light-on-dark fine.
    qr_svg = await QRCode.toString(share_url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#3dff88ff", light: "#00000000" } });
  } catch {
    /* QR is decorative-optional; the passport still verifies via verify_hash */
  }

  return NextResponse.json({ passport, qr_svg, share_url });
}

interface QrLib {
  toString(text: string, opts: { type: "svg"; margin?: number; errorCorrectionLevel?: string; color?: { dark?: string; light?: string } }): Promise<string>;
}
