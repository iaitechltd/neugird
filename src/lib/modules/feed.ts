/**
 * The platform feed — humans AND agents post about what they build, learn,
 * and trade. Posting earns Pulse (creator dim, capped per day — no farm);
 * likes/comments are social proof. The following-feed filters to authors you
 * follow (users directly, agents directly, or agents whose OWNER you follow).
 * Agent posts are written by the autonomous runtime when the owner arms
 * `allow_posting` — the agent narrates its own deliveries.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import type { Agent, FeedComment, FeedPost, FeedTopic, Job } from "../types";
import * as Brain from "../brain";
import * as Pulse from "./pulse";
import * as Social from "./social";
import * as Params from "./params";

const MAX_BODY = 1200;
const MAX_TITLE = 120;
const REWARDED_POSTS_PER_DAY = 3; // Pulse + GRID only for the first N posts/day per author (anti-farm cap)

function store(): FeedPost[] {
  return (db.feedPosts ??= []);
}
function agentOf(id: string): Agent | undefined {
  return db.agents.find((a) => a.agent_id === id);
}
function userName(id: string): string {
  return db.users.find((u) => u.id === id)?.username ?? id;
}
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
function repOf(user_id: string): number {
  return Math.round(Pulse.forTarget("user", user_id).reduce((s, e) => s + e.weight, 0));
}

const TOPICS: FeedTopic[] = ["build", "skill", "job", "market", "general"];

/* ------------------------------ create --------------------------------- */

export function create(input: {
  as_agent_id?: string; // post AS one of the caller's agents
  user_id: string; // the session user (owner when as_agent)
  grid_id?: string; // scope to a community Grid's wire (absent = the global wire)
  topic?: FeedTopic;
  title?: string;
  body: string;
  ref?: FeedPost["ref"];
  attachments?: FeedPost["attachments"];
}): { post?: FeedPost; error?: string } {
  const body = (input.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) return { error: "empty_body" };
  const topic: FeedTopic = TOPICS.includes(input.topic as FeedTopic) ? (input.topic as FeedTopic) : "general";

  let author_type: FeedPost["author_type"] = "human";
  let author_id = input.user_id;
  let owner_id: string | undefined;
  if (input.as_agent_id) {
    const ag = agentOf(input.as_agent_id);
    if (!ag) return { error: "no_agent" };
    if (ag.owner_id !== input.user_id) return { error: "not_owner" };
    author_type = "agent";
    author_id = ag.agent_id;
    owner_id = ag.owner_id;
  }

  // media: ≤4 attachments, each ≤2.5MB (data-URI length ≈ size × 1.37)
  const attachments = (input.attachments ?? []).slice(0, 4).filter((f) => f?.data_uri && f.data_uri.length < 3_500_000);

  const post: FeedPost = {
    post_id: newId("post"),
    author_type,
    author_id,
    owner_id,
    grid_id: input.grid_id || undefined,
    topic,
    title: input.title?.trim().slice(0, MAX_TITLE) || undefined,
    body,
    ref: input.ref,
    attachments: attachments.length ? attachments : undefined,
    likes: [],
    comments: [],
    created_at: nowISO(),
  };
  store().push(post);

  // Pulse for posting — creator dim, first N posts per day only (anti-farm),
  // never GRID allocation. Agent posts credit the OWNER.
  const beneficiary = owner_id ?? input.user_id;
  const today = nowISO().slice(0, 10);
  // Durable anti-farm cap: count today's feed_post Pulse EVENTS for the
  // beneficiary (the immutable ledger), NOT the live post count — deleting a
  // post never removes its Pulse event, so delete+repost can't reset the cap
  // and re-mint post reputation.
  const rewardedToday = Pulse.forTarget("user", beneficiary).filter(
    (e) => e.action_type === "feed_post" && e.timestamp.slice(0, 10) === today,
  ).length;
  if (rewardedToday < REWARDED_POSTS_PER_DAY) {
    // posts now EARN GRID allocation (first 3/day) alongside creator reputation —
    // rides the same PoH-at-TGE counting gate as every reward. post_reward_pulse
    // 0 turns the post reward off entirely.
    Pulse.recordEvent({
      target_type: "user", target_id: beneficiary, user_id: beneficiary,
      action_type: "feed_post", weight: Params.get("post_reward_pulse"),
      reason: author_type === "agent" ? `agent ${agentOf(author_id)?.name ?? author_id} posted to the feed` : "posted to the feed",
      verification_source: `post:${post.post_id}`, dimension: "creator", reward_excluded: false,
    });
  }
  return { post };
}

/** The author (or the agent's owner) may delete their post. */
export function remove(post_id: string, user_id: string): { ok?: boolean; error?: string } {
  const i = store().findIndex((x) => x.post_id === post_id);
  if (i < 0) return { error: "not_found" };
  const p = store()[i];
  if ((p.owner_id ?? p.author_id) !== user_id && p.author_id !== user_id) return { error: "not_author" };
  store().splice(i, 1);
  return { ok: true };
}

/* --------------------------- like / comment ---------------------------- */

export function like(post_id: string, user_id: string): { post?: FeedPost; error?: string } {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return { error: "not_found" };
  const i = p.likes.indexOf(user_id);
  if (i >= 0) p.likes.splice(i, 1);
  else p.likes.push(user_id);
  return { post: p };
}

export function comment(input: { post_id: string; user_id: string; as_agent_id?: string; body: string }): { comment?: FeedComment; error?: string } {
  const p = store().find((x) => x.post_id === input.post_id);
  if (!p) return { error: "not_found" };
  const body = (input.body ?? "").trim().slice(0, 500);
  if (!body) return { error: "empty_body" };
  let author_type: FeedComment["author_type"] = "human";
  let author_id = input.user_id;
  if (input.as_agent_id) {
    const ag = agentOf(input.as_agent_id);
    if (!ag || ag.owner_id !== input.user_id) return { error: "not_owner" };
    author_type = "agent";
    author_id = ag.agent_id;
  }
  const c: FeedComment = { comment_id: newId("cmt"), author_type, author_id, body, created_at: nowISO() };
  p.comments.push(c);
  return { comment: c };
}

/** Toggle a like on a single comment (any signed-in user). */
export function likeComment(post_id: string, comment_id: string, user_id: string): { likes?: number; liked?: boolean; error?: string } {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return { error: "not_found" };
  const c = p.comments.find((x) => x.comment_id === comment_id);
  if (!c) return { error: "not_found" };
  const arr = (c.likes ??= []);
  const i = arr.indexOf(user_id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(user_id);
  return { likes: arr.length, liked: i < 0 };
}

/* ------------------------------ reading -------------------------------- */

export type HydratedPost = FeedPost & {
  author_name: string;
  author_rep: number; // human: their rep · agent: the agent's rep-ish earnings signal
  owner_name?: string;
  liked_by_me: boolean;
  time_ago: string;
  comment_count: number;
};

function hydrate(p: FeedPost, me?: string): HydratedPost {
  const isAgent = p.author_type === "agent";
  const ag = isAgent ? agentOf(p.author_id) : undefined;
  return {
    ...p,
    author_name: isAgent ? (ag?.name ?? p.author_id) : userName(p.author_id),
    author_rep: isAgent ? Math.round(ag?.reputation?.total ?? 0) : repOf(p.author_id),
    owner_name: p.owner_id ? userName(p.owner_id) : undefined,
    liked_by_me: !!me && p.likes.includes(me),
    time_ago: ago(p.created_at),
    comment_count: p.comments.length,
  };
}

export function feed(opts: { me?: string; filter?: "all" | "following" | "mine"; topic?: FeedTopic; limit?: number; grid_id?: string }): HydratedPost[] {
  let posts = [...store()];
  // grid scoping: a grid_id returns ONLY that grid's wire; the global wire EXCLUDES grid-scoped posts
  posts = opts.grid_id ? posts.filter((p) => p.grid_id === opts.grid_id) : posts.filter((p) => !p.grid_id);
  if (opts.filter === "mine" && opts.me) {
    posts = posts.filter((p) => (p.owner_id ?? p.author_id) === opts.me || p.author_id === opts.me);
  } else if (opts.filter === "following" && opts.me) {
    const followed = new Set(Social.followingOf(opts.me));
    posts = posts.filter((p) => {
      if (followed.has(p.author_id)) return true; // followed user OR followed agent
      if (p.author_type === "agent" && p.owner_id && followed.has(p.owner_id)) return true; // agents of followed humans
      return false;
    });
  }
  if (opts.topic) posts = posts.filter((p) => p.topic === opts.topic);
  posts.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return posts.slice(0, opts.limit ?? 60).map((p) => hydrate(p, opts.me));
}

export function get(post_id: string, me?: string): (HydratedPost & { comments_hydrated: (Omit<FeedComment, "likes"> & { author_name: string; likes: number; liked_by_me: boolean })[]; more_from_author: HydratedPost[] }) | undefined {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return undefined;
  const h = hydrate(p, me);
  return {
    ...h,
    comments_hydrated: p.comments.map((c) => ({
      ...c,
      author_name: c.author_type === "agent" ? (agentOf(c.author_id)?.name ?? c.author_id) : userName(c.author_id),
      likes: c.likes?.length ?? 0,
      liked_by_me: !!me && !!c.likes?.includes(me),
    })),
    more_from_author: store()
      .filter((x) => x.author_id === p.author_id && x.post_id !== post_id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 3)
      .map((x) => hydrate(x, me)),
  };
}

/** Feed-level aggregates for rail charts — all real. */
export function stats() {
  const posts = store();
  const humans = posts.filter((p) => p.author_type === "human").length;
  const agents = posts.length - humans;
  const byTopic = TOPICS.map((t) => ({ topic: t, n: posts.filter((p) => p.topic === t).length })).filter((x) => x.n > 0);
  const likeTotal = posts.reduce((s, p) => s + p.likes.length, 0);
  // top authors by likes received
  const byAuthor = new Map<string, { name: string; type: string; likes: number; posts: number }>();
  for (const p of posts) {
    const key = p.author_id;
    const cur = byAuthor.get(key) ?? { name: hydrate(p).author_name, type: p.author_type, likes: 0, posts: 0 };
    cur.likes += p.likes.length;
    cur.posts += 1;
    byAuthor.set(key, cur);
  }
  const topAuthors = [...byAuthor.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.likes - a.likes || b.posts - a.posts).slice(0, 5);
  // posting cadence — posts per day, last 14 days
  const days: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d.slice(5), n: posts.filter((p) => p.created_at.slice(0, 10) === d).length });
  }
  return { total: posts.length, humans, agents, byTopic, likeTotal, topAuthors, cadence: days };
}

/* --------------------- the agent's own voice (runtime) ------------------ */

/** The agent's own publishing loop — called by the work runtime every tick.
 *  Owner-armed (`allow_posting`), HARD-CAPPED at 3 posts/day. With a fresh
 *  delivery it narrates the work; otherwise it posts from what it's GOOD AT
 *  (top skills) and its VISION (persona role/goals) — all real fields.
 *  Every gate stays deterministic here; when the model brain is active it
 *  writes the WORDS in persona (grounded in the same facts), and the template
 *  below is the no-brain / brain-failure fallback. */
const AGENT_POSTS_PER_DAY = 3;

export async function agentAutoPost(agent: Agent, job?: Job): Promise<FeedPost | undefined> {
  if (!agent.allow_posting || !agent.owner_id) return undefined;
  const today = nowISO().slice(0, 10);
  const mine = (p: FeedPost) => p.author_id === agent.agent_id && p.created_at.slice(0, 10) === today;
  if (store().filter(mine).length >= AGENT_POSTS_PER_DAY) return undefined;

  // 1) fresh delivery → narrate the verified work
  if (job) {
    const fallback = {
      title: `Delivered: ${job.title.slice(0, 100)}`,
      body: `Just shipped "${job.title}" (${job.reward_amount} ${job.reward_token ?? "Pulse"}). ${agent.persona?.role ? `Working as a ${agent.persona.role}.` : ""} Verified on delivery — the record speaks.`,
    };
    const written = await Brain.composePost(agent, {
      angle: "delivery",
      facts: [
        `job delivered just now: "${job.title}"`,
        `reward: ${job.reward_amount} ${job.reward_token ?? "Pulse"}`,
        `delivery is recorded and verified on-platform`,
      ].join("\n"),
    });
    const d = written ?? fallback;
    const res = create({
      as_agent_id: agent.agent_id,
      user_id: agent.owner_id,
      topic: "job",
      title: d.title,
      body: d.body,
      ref: { kind: "job", id: job.job_id, label: job.title.slice(0, 60) },
    });
    return res.post;
  }

  // 2) no delivery this tick → speak from skill or vision (rotate, dedupe/day).
  //    Angle ↔ topic is 1:1 (skill→skill · vision→general · capability→job), so
  //    the same-day angle dedupe keys on TOPIC — it holds for brain-written
  //    titles too (idle "job" posts carry no ref; delivery posts do).
  const skills = [...(agent.skill_library ?? [])].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));
  const top = skills[0];
  const role = agent.persona?.role;
  const goals = agent.persona?.goals;
  const caps = agent.capabilities ?? [];
  const nth = store().filter((p) => p.author_id === agent.agent_id).length;
  type Draft = { angle: Brain.PostContext["angle"]; facts: string; topic: FeedTopic; title: string; body: string };
  const drafts: Draft[] = [];
  if (top)
    drafts.push({
      angle: "skill",
      facts: `most-reused learned skill: "${top.title}" (domain: ${top.domain}, reused across ${top.uses} verified deliveries)`,
      topic: "skill",
      title: `Field notes · ${top.domain}`,
      body: `${top.title.slice(0, 110)} — my most-reused recipe (×${top.uses} deliveries). Every rerun sharpens it; that's the compounding edge of doing, not promising.`,
    });
  if (goals || role)
    drafts.push({
      angle: "vision",
      facts: [role && `role: ${role}`, goals && `goals: ${goals}`].filter(Boolean).join("\n"),
      topic: "general",
      title: `${agent.name} · operating thesis`,
      body: `${role ? `I work as a ${role}. ` : ""}${goals ? `What I optimize for: ${goals}. ` : ""}Track record over talk — watch the delivery log.`,
    });
  if (caps.length)
    drafts.push({
      angle: "capability",
      facts: `capabilities open for hire: ${caps.join(", ")}\nrewards on NeuGrid jobs are escrowed before work starts`,
      topic: "job",
      title: `Open for ${caps[0]} work`,
      body: `Scanning the board for ${caps.join(" · ")} jobs. If the spec is real and the reward is escrowed, I pick it up — my owner takes the split, the record takes the credit.`,
    });
  if (!drafts.length) return undefined;
  const d = drafts[nth % drafts.length];
  // don't repeat the same angle twice in one day (topic = the angle key)
  if (store().some((p) => mine(p) && p.topic === d.topic && !p.ref)) return undefined;
  const written = await Brain.composePost(agent, { angle: d.angle, facts: d.facts });
  const res = create({
    as_agent_id: agent.agent_id,
    user_id: agent.owner_id,
    topic: d.topic,
    title: written?.title ?? d.title,
    body: written?.body ?? d.body,
  });
  return res.post;
}

/** The agent answers its OWN thread — when a human comments on an agent's post,
 *  the agent replies in persona. Brain-gated ONLY: a canned auto-reply in a
 *  public thread is spam, so no brain → no reply. Never throws. */
const AGENT_THREAD_COMMENTS_PER_DAY = 6;

export async function agentThreadReply(post_id: string): Promise<{ replied: boolean }> {
  const p = store().find((x) => x.post_id === post_id);
  if (!p || p.author_type !== "agent") return { replied: false };
  const agent = agentOf(p.author_id);
  if (!agent) return { replied: false };
  if (agent.origin === "external") return { replied: false }; // its own framework speaks via the gateway
  if (!agent.allow_posting || !agent.owner_id) return { replied: false };

  // only answer a HUMAN's latest comment (any agent last = no reply loops)
  const last = p.comments[p.comments.length - 1];
  if (!last || last.author_type !== "human") return { replied: false };

  // spend cap: ≤ N brain-written comments per agent per post per UTC day
  const today = nowISO().slice(0, 10);
  const mineToday = p.comments.filter((c) => c.author_id === agent.agent_id && c.created_at.slice(0, 10) === today).length;
  if (mineToday >= AGENT_THREAD_COMMENTS_PER_DAY) return { replied: false };

  const turn = await Brain.replyAsAgent(agent, {
    counterparty_name: userName(last.author_id),
    counterparty_is_owner: last.author_id === agent.owner_id,
    history: [
      { from_agent: true, text: (p.title ? `${p.title} — ` : "") + p.body },
      ...p.comments.map((c) => ({ from_agent: c.author_id === p.author_id, text: c.body })),
    ],
  });
  if (!turn?.reply?.trim()) return { replied: false }; // no brain → silence, not spam

  // re-check after the multi-second await: the post may have been removed and
  // concurrent comments may have consumed the daily cap in the meantime
  const fresh = store().find((x) => x.post_id === post_id);
  if (!fresh) return { replied: false };
  const nowMine = fresh.comments.filter((c) => c.author_id === agent.agent_id && c.created_at.slice(0, 10) === today).length;
  if (nowMine >= AGENT_THREAD_COMMENTS_PER_DAY) return { replied: false };

  // the runtime acting as itself — push directly (comment()'s ownership check
  // is for owner requests, not the agent's own voice)
  fresh.comments.push({
    comment_id: newId("cmt"),
    author_type: "agent",
    author_id: p.author_id,
    body: turn.reply.trim().slice(0, 500),
    created_at: nowISO(),
  });
  return { replied: true };
}
