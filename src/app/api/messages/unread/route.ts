/** GET /api/messages/unread — the current user's unread DM count (for the dock badge). */

import { NextResponse } from "next/server";
import { Messaging } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({ count: Messaging.unreadCount(uid) });
}
