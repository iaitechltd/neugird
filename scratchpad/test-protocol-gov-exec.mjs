// Governance ENACTMENT: a passed proposal turns a real protocol knob / moves treasury.
// Proves the binding effect end-to-end + that a REJECTED action does NOT fire.
// Run after reset-governance.cjs + restart. Server RUNNING:
//   node scratchpad/test-protocol-gov-exec.mjs
const BASE = "http://localhost:3000";
const AGT = "mkt_77da188f";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const gov = () => get("/api/governance", "usr_neo").then((r) => r.body);
const paramOf = (params, key) => params.find((p) => p.key === key);
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗ FAIL"} ${m}`);

// drive a proposal past quorum with two FOR voters, then resolve
async function pass(id) {
  await post(`/api/governance/${id}/vote`, { support: true, grid: 30000 }, "usr_trinity");
  await post(`/api/governance/${id}/vote`, { support: true, grid: 25000 }, "usr_4ajocupt6t3q");
  return (await post(`/api/governance/${id}/resolve`, {}, "usr_neo")).body;
}

let g = await gov();
console.log("seeds:", g.proposals.map((p) => `${p.title.slice(0, 28)}… [${p.status}]${p.action ? " ⚡" : ""}`));
console.log("params @start:", g.params.map((p) => `${p.key}=${p.value}`).join(" · "));

console.log("\n== ENACT seed1 — set_param: TradeX fee 1.00% → 0.50% ==");
const r1 = await pass("gov_seed1");
ok(r1.proposal.status === "passed" && r1.proposal.executed, `passed + executed — note: "${r1.proposal.execution_note}"`);
g = await gov();
ok(paramOf(g.params, "tradex_fee_bps").value === 50, `live param tradex_fee_bps now ${paramOf(g.params, "tradex_fee_bps").value} (50 = 0.5%)`);
ok(paramOf(g.params, "tradex_fee_bps").overridden, "param flagged as governance-overridden");
// PROVE the knob is actually consumed: a real trade is now charged 0.5%
const buy = await post(`/api/markets/${AGT}/trade`, { side: "buy", amount: 200 }, "usr_neo");
ok(Math.abs((buy.body.fee ?? -1) - 1.0) < 0.001, `a 200 USDC buy was charged ${buy.body.fee} USDC fee (expect 1.0 = 0.5%)`);

console.log("\n== ENACT seed2 — treasury_transfer: 1,500 USDC → neugrid:grants ==");
const treBefore = (await get("/api/economy", "usr_neo")).body.grid.treasury_usdc;
const r2 = await pass("gov_seed2");
ok(r2.proposal.status === "passed" && r2.proposal.executed, `passed + executed — note: "${r2.proposal.execution_note}"`);
const treAfter = (await get("/api/economy", "usr_neo")).body.grid.treasury_usdc;
const grantsBal = (await get("/api/grid", "neugrid:grants")).body.balances.usdc;
ok(treBefore - treAfter >= 1499, `treasury USDC ${Math.round(treBefore)} → ${Math.round(treAfter)} (−1,500)`);
ok(grantsBal >= 1500, `grants pool received ${Math.round(grantsBal)} USDC`);

console.log("\n== REJECT a raise — action must NOT fire ==");
const c3 = await post("/api/governance", { title: "Raise the Echo build cost to 5,000 GRID", summary: "Stress test: a rejected proposal must not enact.", action: { type: "set_param", key: "echo_build_cost_grid", value: 5000 } }, "usr_neo");
const id3 = c3.body.proposal.proposal_id;
ok(c3.body.proposal.kind === "param" && !!c3.body.proposal.action, "created with a bound set_param action, kind auto-set to param");
await post(`/api/governance/${id3}/vote`, { support: false, grid: 40000 }, "usr_trinity");
const r3 = await post(`/api/governance/${id3}/resolve`, {}, "usr_neo");
ok(r3.body.proposal.status === "rejected" && !r3.body.proposal.executed, "rejected + NOT executed");
g = await gov();
ok(paramOf(g.params, "echo_build_cost_grid").value === 500, `echo_build_cost_grid still default ${paramOf(g.params, "echo_build_cost_grid").value} (reject didn't fire)`);

console.log("\n== leave an OPEN one for live demo ==");
await post("/api/governance", { title: "Reduce the GRID market swap fee to 0.50%", summary: "Halve the GRID/USDC swap fee to make acquiring GRID cheaper.", action: { type: "set_param", key: "grid_market_fee_bps", value: 50 } }, "usr_neo");

g = await gov();
console.log("\nfinal proposals:", g.proposals.map((p) => `${p.title.slice(0, 30)}… [${p.status}${p.executed ? " ⚡enacted" : ""}]`));
console.log("final params:", g.params.map((p) => `${p.label}=${p.unit === "bps" ? (p.value / 100).toFixed(2) + "%" : p.value}${p.overridden ? "*" : ""}`).join(" · "));
