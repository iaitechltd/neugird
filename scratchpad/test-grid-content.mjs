// Grid content hub: post / pin / like / delete + member-gating. Seeds the zion
// feed for the demo. Server RUNNING: node scratchpad/test-grid-content.mjs
const BASE = "http://localhost:3000";
const G = "zion";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗ FAIL"} ${m}`);

// clear any prior test posts for an idempotent run
const existing = (await get(`/api/grids/${G}/posts`, "usr_neo")).body.posts ?? [];
for (const p of existing) await post(`/api/grids/${G}/posts/${p.post_id}`, { action: "delete" }, "usr_neo");

console.log("== POST + PIN (founder neo) ==");
let r = await post(`/api/grids/${G}/posts`, { title: "Zion is live on TradeX", body: "Our token graduated to Spot — deep liquidity, real traction. Backers from the GenesisX round, this is the payoff. Trade + stake-to-list now live." }, "usr_neo");
ok(r.status === 201, "founder posted an announcement");
const annId = r.body.posts[0].post_id;
r = await post(`/api/grids/${G}/posts/${annId}`, { action: "pin" }, "usr_neo");
ok(r.body.posts.find((p) => p.post_id === annId)?.pinned === true, "announcement pinned");

console.log("\n== POST (member trinity) + LIKE ==");
r = await post(`/api/grids/${G}/posts`, { title: "Growth Pod — week 1 recap", body: "Shipped the landing hero + 3 explainer threads. Oracle handled the on-chain data pulls. Splits agreed: neo 50 / me 30 / Oracle 20." }, "usr_trinity");
ok(r.status === 201, "member posted an update");
const upId = r.body.posts.find((p) => p.author_id === "usr_trinity")?.post_id;
r = await post(`/api/grids/${G}/posts/${upId}`, { action: "like" }, "usr_neo");
ok(r.body.posts.find((p) => p.post_id === upId)?.likes === 1, "neo liked the update");

console.log("\n== GATING + PERMISSIONS ==");
r = await post(`/api/grids/${G}/posts`, { body: "spam from a non-member" }, "usr_4ajocupt6t3q");
ok(r.status === 403 && r.body.error === "not_member", `non-member blocked from posting → ${r.body.error}`);
r = await post(`/api/grids/${G}/posts/${annId}`, { action: "pin" }, "usr_trinity");
ok(r.status === 403 && r.body.error === "not_admin", `non-admin can't pin → ${r.body.error}`);
r = await post(`/api/grids/${G}/posts/${upId}`, { action: "delete" }, "usr_4ajocupt6t3q");
ok(r.status === 403, `stranger can't delete a post → ${r.body.error}`);

const feed = (await get(`/api/grids/${G}/posts`, "usr_neo")).body.posts;
console.log("\nfeed (pinned first):", feed.map((p) => `[${p.pinned ? "📌" : " "}] ${p.username}/${p.role}: ${p.title} (♥${p.likes})`));
