// Grid-member governance: reputation-weighted member voting; a passed feature_post
// proposal PINS the post. + member-gating + a weight-decided rejection.
// Server RUNNING: node scratchpad/test-grid-gov.mjs
const BASE = "http://localhost:3000";
const G = "zion";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗ FAIL"} ${m}`);

// clear any prior test proposals
for (const p of (await get(`/api/grids/${G}/proposals`, "usr_neo")).body.proposals ?? [])
  if (p.status === "open") await post(`/api/grids/${G}/proposals/${p.proposal_id}`, { action: "resolve" }, "usr_neo");

const feed = (await get(`/api/grids/${G}/posts`, "usr_neo")).body.posts;
const recap = feed.find((p) => (p.title ?? "").includes("week 1"));
console.log("target post:", recap?.title, "| pinned before:", recap?.pinned);

console.log("\n== PASS feature_post → pins the post (members vote, reputation-weighted) ==");
let r = await post(`/api/grids/${G}/proposals`, { kind: "feature_post", title: "Feature the Growth Pod recap", summary: "Great week-1 writeup — pin it to the feed.", target_post_id: recap.post_id }, "usr_neo");
const pid = r.body.proposal.proposal_id;
ok(r.status === 201 && r.body.proposal.kind === "feature_post", `proposal opened (quorum ${r.body.proposal.quorum_votes})`);
const nm = await post(`/api/grids/${G}/proposals/${pid}`, { action: "vote", support: true }, "usr_4ajocupt6t3q");
ok(nm.status === 403 && nm.body.error === "not_member", `non-member can't vote → ${nm.body.error}`);
await post(`/api/grids/${G}/proposals/${pid}`, { action: "vote", support: true }, "usr_neo");
r = await post(`/api/grids/${G}/proposals/${pid}`, { action: "vote", support: true }, "usr_trinity");
ok(r.body.proposal.voters === 2, `2 members voted FOR (weight ${r.body.proposal.for_weight})`);
r = await post(`/api/grids/${G}/proposals/${pid}`, { action: "resolve" }, "usr_neo");
ok(r.body.proposal.status === "passed" && r.body.proposal.executed, `passed + executed: "${r.body.proposal.execution_note}"`);
const pinned = (await get(`/api/grids/${G}/posts`, "usr_neo")).body.posts.find((p) => p.post_id === recap.post_id)?.pinned;
ok(pinned === true, "the post is now PINNED on the feed (binding enactment)");

console.log("\n== REJECT (weight-decided: higher-rep AGAINST outweighs proposer FOR) ==");
r = await post(`/api/grids/${G}/proposals`, { title: "Switch the Grid to invite-only" }, "usr_trinity");
const pid2 = r.body.proposal.proposal_id;
await post(`/api/grids/${G}/proposals/${pid2}`, { action: "vote", support: true }, "usr_trinity"); // proposer FOR
await post(`/api/grids/${G}/proposals/${pid2}`, { action: "vote", support: false }, "usr_neo"); // higher-rep AGAINST
r = await post(`/api/grids/${G}/proposals/${pid2}`, { action: "resolve" }, "usr_neo");
ok(r.body.proposal.status === "rejected", `rejected — for ${r.body.proposal.for_weight} < against ${r.body.proposal.against_weight} (reputation decided)`);
ok(!r.body.proposal.executed, "rejected proposal did NOT enact");

console.log("\n== GATING ==");
const np = await post(`/api/grids/${G}/proposals`, { title: "spam" }, "usr_4ajocupt6t3q");
ok(np.status === 403 && np.body.error === "not_member", `non-member can't propose → ${np.body.error}`);

console.log("\nfinal proposals:", (await get(`/api/grids/${G}/proposals`, "usr_neo")).body.proposals.map((p) => `${p.title.slice(0, 28)}… [${p.status}${p.executed ? " ⚡" : ""}]`));
