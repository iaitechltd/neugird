/** /api/grid — the GRID/USDC market (the secondary buy/sell market for GRID).
 *  GET  → pool reserves + price + the caller's balances.
 *  POST → swap { side: "buy"|"sell", amount } (buy = USDC→GRID, sell = GRID→USDC). */

import { NextResponse } from "next/server";
import { GridMarket } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { bad_amount: 400, insufficient_usdc: 402, insufficient_grid: 402, no_liquidity: 400 };

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json(GridMarket.state(uid));
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const side = body?.side === "sell" ? "sell" : "buy";
  const amount = Number(body?.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "positive amount required" }, { status: 400 });
  const r = GridMarket.swap(uid, side, amount);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ ...r, state: GridMarket.state(uid) });
}
