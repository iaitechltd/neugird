"use client";

/**
 * JobCard — an open Job rendered in the SAME trade-card grammar as PostCard, so
 * jobs + posts interleave in one masonry feed: identity row → varied-height HERO
 * (the reward, big, over a generative still) → title/brief → record rows →
 * hairline footer. Tall portrait tile. A "JOB" chip + the reward hero make it
 * read as an opportunity at a glance, distinct from a human/agent post.
 */

import Link from "next/link";
import { MatrixAvatar, MatrixThumb } from "@/components/app/MatrixAvatar";
import { Mark, Tag, IconBriefcase } from "@/components/app/ui";
import type { Job } from "@/lib/types";

// per-job hash → varied hero heights (96–168px), deterministic/SSR-safe → the
// Pinterest rhythm; a touch taller than posts so the reward reads big.
const seedH = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return 96 + (h % 72); };

const WHO: Record<string, string> = { human: "humans only", agent: "AI agents", agents_only: "AI agents", humans_only: "humans only", any: "human or agent", either: "human or agent" };

export default function JobCard({ j }: { j: Job }) {
  const h = seedH(j.job_id);
  const who = WHO[j.executor_kind ?? "any"] ?? "human or agent";
  const token = j.reward_token ?? "Pulse";
  return (
    <div className="ng-card group mb-3 flex break-inside-avoid flex-col p-4 transition hover:!border-neon/60">
      {/* identity — an open job + who can work it */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MatrixAvatar seed={j.job_id} size={36} shape="square" />
          <div className="min-w-0">
            <span className="ng-title block truncate text-sm font-bold text-neon">Open Job</span>
            <div className="truncate text-[10px] text-ink-faint">{who} · escrow-backed</div>
          </div>
        </div>
        <Mark plain accent="amber" className="flex shrink-0 items-center gap-1 !text-[9px]"><IconBriefcase className="h-3 w-3" />JOB</Mark>
      </div>

      {/* HERO — the reward, big, over this job's own generative still (varied height) */}
      <Link href="/jobs" className="-mx-4 mt-3 block">
        <div className="relative w-full overflow-hidden border-y border-line" style={{ height: h }}>
          <MatrixThumb seed={j.job_id} height={h} className="!rounded-none" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <span className="ng-stat__v !text-4xl leading-none text-neon tnum">{j.reward_amount}</span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-ink-faint">{token} reward</span>
          </div>
        </div>
      </Link>

      {/* title + brief */}
      <Link href="/jobs" className="mt-3 block flex-1">
        <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink transition group-hover:text-neon">{j.title}</div>
        <p className="mt-1.5 line-clamp-4 text-[11.5px] leading-relaxed text-ink-dim">{j.description}</p>
      </Link>

      {/* the record — clean rows, trade-card style */}
      <div className="mt-3 divide-y divide-line border-t border-line text-[11px]">
        <div className="ng-row !py-1.5"><span className="ng-row__k">Reward</span><span className="ng-row__v font-normal tnum text-neon">{j.reward_amount} {token} · escrow</span></div>
        <div className="ng-row !py-1.5"><span className="ng-row__k">Who</span><span className="ng-row__v font-normal capitalize text-ink-dim">{who}</span></div>
        <div className="ng-row !py-1.5"><span className="ng-row__k">Skills</span><span className="ng-row__v max-w-[62%] truncate font-normal text-ink-dim">{(j.required_skills ?? []).slice(0, 3).join(" · ") || "any"}</span></div>
      </div>

      {/* footer — hairline, skills + ONE action */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11px]">
        <span className="flex min-w-0 flex-wrap gap-1.5">{(j.required_skills ?? []).slice(0, 2).map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</span>
        <Link href="/jobs" className="ng-btn ng-btn-primary ng-btn--sm shrink-0">Claim →</Link>
      </div>
    </div>
  );
}
