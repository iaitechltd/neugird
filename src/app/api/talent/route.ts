/**
 * GET /api/talent — the talent directory: people who offer skills, with their
 * verified builder reputation and jobs delivered.
 */

import { NextResponse } from "next/server";
import { Users, Jobs } from "@/lib/modules";

export const dynamic = "force-dynamic";

const short = (a?: string) => (a && a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a ?? "");

export async function GET() {
  const talent = Users.listAll().map((u) => ({
    id: u.id,
    username: u.username,
    wallet: short(u.wallet_addresses[0]),
    skills: u.skills ?? [],
    bio: u.bio ?? "",
    pulse: u.pulse_score,
    builder: u.reputation?.by_dimension?.builder ?? 0,
    reputation: u.reputation?.total ?? 0,
    jobs_done: Jobs.listJobs({ assignee_id: u.id, status: "paid" }).length,
  }));
  return NextResponse.json({ talent });
}
