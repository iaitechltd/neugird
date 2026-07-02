// GRID-weighted PROTOCOL governance: contested multi-voter vote→resolve→lock-return.
// Leaves 1 passed + 1 rejected example beside the 2 open seeds. Server RUNNING:
//   node scratchpad/test-protocol-gov.mjs
const BASE = "http://localhost:3000";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const bal = async (uid) => (await get("/api/governance", uid)).body.me.grid;
const k = (n) => `${Math.round(n).toLocaleString()}`;
const V = ["usr_neo", "usr_trinity", "usr_4ajocupt6t3q"];

const start = Object.fromEntries(await Promise.all(V.map(async (u) => [u, await bal(u)])));
console.log("balances @start:", Object.fromEntries(Object.entries(start).map(([u, g]) => [u, k(g)])));
console.log("open seeds:", (await get("/api/governance", "usr_neo")).body.proposals.filter((p) => p.status === "open").length);

async function run(label, kind, title, summary, votes) {
  console.log(`\n== ${label} ==`);
  const c = await post("/api/governance", { kind, title, summary }, "usr_neo");
  const id = c.body.proposal.proposal_id;
  for (const [uid, support, grid] of votes) {
    const r = await post(`/api/governance/${id}/vote`, { support, grid }, uid);
    console.log(`  ${uid.replace("usr_", "")} ${support ? "FOR " : "AGN "} ${k(grid)} -> ${r.status} | for ${k(r.body.proposal?.for_grid ?? 0)} / agn ${k(r.body.proposal?.against_grid ?? 0)} | quorum ${r.body.proposal?.quorum_pct}%`);
  }
  const res = await post(`/api/governance/${id}/resolve`, {}, "usr_neo");
  console.log(`  RESOLVE -> ${res.body.proposal?.status.toUpperCase()} | returned ${k(res.body.returned)} GRID to ${votes.length} voters`);
  return id;
}

const passId = await run(
  "PASS PATH (contested, FOR majority crosses quorum)", "listing",
  "Feature a Builder-of-the-Month slot on /home",
  "Rotate a high-rep builder into a featured slot on the home command center each month — discovery by merit, never paid placement.",
  [["usr_trinity", true, 30000], ["usr_4ajocupt6t3q", true, 25000], ["usr_neo", false, 15000]], // for 55K > quorum 50K, > agn 15K → PASS
);
await run(
  "REJECT PATH (contested, fails quorum & AGAINST majority)", "param",
  "Raise the Echo build cost to 1,000 GRID",
  "Double the GRID metered per AI build. Pushback: too steep for early builders still earning their first allocation.",
  [["usr_trinity", false, 30000], ["usr_neo", false, 25000], ["usr_4ajocupt6t3q", true, 20000]], // for 20K < quorum, < agn 55K → REJECT
);

console.log("\n== GUARDS ==");
console.log("  double-resolve:", (await post(`/api/governance/${passId}/resolve`, {}, "usr_neo")).body.error, "(expect already_resolved)");
console.log("  vote-after-resolve:", (await post(`/api/governance/${passId}/vote`, { support: true, grid: 100 }, "usr_neo")).body.error, "(expect not_open)");

const end = Object.fromEntries(await Promise.all(V.map(async (u) => [u, await bal(u)])));
console.log("\nbalances @end:", Object.fromEntries(Object.entries(end).map(([u, g]) => [u, k(g)])));
console.log("net change (expect ~0 — every lock returned):", Object.fromEntries(V.map((u) => [u.replace("usr_", ""), k(end[u] - start[u])])));
console.log("final proposals:", (await get("/api/governance", "usr_neo")).body.proposals.map((p) => `${p.title.slice(0, 30)}… [${p.status} ${k(p.for_grid)}/${k(p.against_grid)}]`));
