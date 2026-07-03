/**
 * POST /api/gridx/[id]/reviews — write a VERIFIED review ({ rating 1–5, text? }).
 * Gated: buyers only on paid products, real users on free ones, never the owner,
 * one per person. The owner's creator reputation moves with the verdict.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { not_found: 404, own_product: 403, already_reviewed: 409, not_purchased: 402, not_used: 403 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();
  const { review, error } = GridX.addReview(id, uid, Number(body?.rating), body?.text);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ review }, { status: 201 });
}
