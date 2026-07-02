// Milestone governance: backers vote FOR/AGAINST (weighted by stake + reputation).
const BASE = "http://localhost:3000";
const MID = "mile_1ae12cb0"; // defivault milestone (reset to pending), backers: trinity(100K)+usr_4ajo(50K)
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => (uid ? { cookie: `ng_uid=${uid}` } : {});
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...H(uid) }, body: JSON.stringify(b || {}) }).then(j);
const vote = (uid, support) => post(`/api/milestones/${MID}/approve`, { support }, uid);
const milestone = async () => (await (await fetch(`${BASE}/api/proposals/prop_seed1`, { headers: H("usr_trinity") }).then((r) => r.json())).milestones).find((m) => m.milestone_id === MID);

console.log("== FOUNDER (neo) submits the milestone → opens the vote ==");
const sub = await post(`/api/milestones/${MID}/submit`, {}, "usr_neo");
console.log("  ->", sub.status, "status:", sub.body?.milestone?.status, "| vote opened:", !!sub.body?.milestone?.approval_vote);

console.log("\n== Non-backer (usr_neo, the founder) tries to vote → blocked ==");
const nb = await vote("usr_neo", true);
console.log("  ->", nb.status, nb.body?.error, "(expect not_a_backer/403)");

console.log("\n== Small backer usr_4ajo votes FOR (33% stake) → not enough yet ==");
const v1 = await vote("usr_4ajocupt6t3q", true);
console.log("  ->", v1.status, "for%:", Math.round((v1.body?.for_pct ?? 0) * 100), "against%:", Math.round((v1.body?.against_pct ?? 0) * 100), "| released:", !!v1.body?.released, "(expect not released)");

console.log("\n== Big backer trinity votes FOR → crosses 50% → RELEASED ==");
const v2 = await vote("usr_trinity", true);
console.log("  ->", v2.status, "for%:", Math.round((v2.body?.for_pct ?? 0) * 100), "| released:", !!v2.body?.released, "| credential minted:", (v2.body?.minted ?? []).length, "| status:", v2.body?.milestone?.status);

console.log("\n== AGAINST path: re-submit, then trinity votes AGAINST → REJECTED ==");
await post(`/api/milestones/${MID}/submit`, {}, "usr_neo");
const va = await vote("usr_trinity", false);
console.log("  -> trinity AGAINST: against%:", Math.round((va.body?.against_pct ?? 0) * 100), "| rejected:", !!va.body?.rejected, "| status:", va.body?.milestone?.status);
const m = await milestone();
console.log("  my_vote (trinity):", m?.my_vote, "| approval_vote bps:", m?.approval_vote?.for_bps, "/", m?.approval_vote?.against_bps);
