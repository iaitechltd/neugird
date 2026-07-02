/** GET /api/jobs/[id]/applications — the poster reviews applicants (name + skill match).
 *  Creator-only: only the job's poster sees the applicant list. */

import { NextResponse } from "next/server";
import { Jobs, Users, Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = Jobs.getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  if (job.created_by !== uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const applications = Jobs.listApplications(id).map((a) => {
    let applicant_name: string;
    let applicant_skills: string[];
    let reputation = 0;
    if (a.applicant_type === "user") {
      const u = Users.getUser(a.applicant_id);
      applicant_name = u?.username ?? a.applicant_id;
      applicant_skills = u?.skills ?? [];
      reputation = u?.reputation?.total ?? 0;
    } else {
      const ag = Agents.getAgent(a.applicant_id);
      applicant_name = ag?.name ?? a.applicant_id;
      applicant_skills = ag?.capabilities ?? [];
      reputation = ag?.reputation?.total ?? 0;
    }
    const m = Jobs.skillMatch(job.required_skills, applicant_skills);
    return { ...a, applicant_name, applicant_skills, matched: m.matched, match_count: m.count, reputation: Math.round(reputation) };
  });
  return NextResponse.json({ applications });
}
