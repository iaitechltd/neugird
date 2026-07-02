// SubGrid economy + gating: ownership splits (sum=10000) + access gates
// (reputation / token / invite / open) + join/leave. Server RUNNING:
//   node scratchpad/test-subgrid-econ.mjs
const BASE = "http://localhost:3000";
const SG1 = "sub_growth";       // hybrid team (neo + trinity + Oracle) → gets the ownership split
const SG2 = "sub_1c007883";     // gets the access-gate tests
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const del = (p, uid) => fetch(BASE + p, { method: "DELETE", headers: H(uid) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗ FAIL"} ${m}`);

console.log("== OWNERSHIP SPLITS (SG1 = hybrid team neo+trinity+Oracle) ==");
const bad = await post(`/api/subgrids/${SG1}/splits`, { splits: [{ party_id: "usr_neo", party_type: "user", basis_points: 5000 }, { party_id: "usr_trinity", party_type: "user", basis_points: 3000 }] }, "usr_neo");
ok(bad.status === 400 && bad.body.error === "must_sum_10000", `bad sum (80%) rejected → ${bad.body.error}`);
const good = await post(`/api/subgrids/${SG1}/splits`, { splits: [
  { party_id: "usr_neo", party_type: "user", basis_points: 5000 },
  { party_id: "usr_trinity", party_type: "user", basis_points: 3000 },
  { party_id: "agent_oracle", party_type: "agent", beneficiary_id: "usr_neo", basis_points: 2000 },
] }, "usr_neo");
ok(good.status === 200 && good.body.splits?.length === 3, "3-way split saved (50/30/20)");
const oracleSplit = good.body.splits?.find((s) => s.party_type === "agent");
ok(oracleSplit?.pct === 20 && oracleSplit?.beneficiary_name === "neo", `agent share = ${oracleSplit?.pct}% → paid to ${oracleSplit?.beneficiary_name}`);
const notAdmin = await post(`/api/subgrids/${SG1}/splits`, { splits: [{ party_id: "usr_neo", party_type: "user", basis_points: 10000 }] }, "usr_trinity");
ok(notAdmin.status === 403, `non-admin (trinity) blocked from editing splits → ${notAdmin.body.error}`);

console.log("\n== ACCESS GATES (SG2) — trinity = zion member, 445 rep, 45K GRID ==");
await post(`/api/subgrids/${SG2}/access`, { access: "reputation", min_reputation: 1000 }, "usr_neo");
let r = await post(`/api/subgrids/${SG2}/join`, {}, "usr_trinity");
ok(r.status === 403 && r.body.error === "need_reputation", `reputation gate (≥1000): trinity (445) blocked → ${r.body.error}`);
await post(`/api/subgrids/${SG2}/access`, { access: "token", min_grid: 60000 }, "usr_neo");
r = await post(`/api/subgrids/${SG2}/join`, {}, "usr_trinity");
ok(r.status === 402 && r.body.error === "need_grid", `GRID gate (≥60K): trinity (45K) blocked → ${r.body.error}`);
await post(`/api/subgrids/${SG2}/access`, { access: "invite" }, "usr_neo");
r = await post(`/api/subgrids/${SG2}/join`, {}, "usr_trinity");
ok(r.status === 403 && r.body.error === "invite_only", `invite-only: self-join blocked → ${r.body.error}`);

console.log("\n== INVITE + JOIN/LEAVE ==");
const inv = await post(`/api/subgrids/${SG2}/members`, { user_id: "usr_trinity" }, "usr_neo");
ok(inv.status === 200 && inv.body.subgrid.members.includes("usr_trinity"), "admin invited trinity onto the team");
const lv = await del(`/api/subgrids/${SG2}/join`, "usr_trinity");
ok(lv.status === 200 && !lv.body.subgrid.members.includes("usr_trinity"), "trinity left the team");
await post(`/api/subgrids/${SG2}/access`, { access: "open" }, "usr_neo");
const jn = await post(`/api/subgrids/${SG2}/join`, {}, "usr_trinity");
ok(jn.status === 200 && jn.body.subgrid.members.includes("usr_trinity"), "open gate: trinity self-joined");
await del(`/api/subgrids/${SG2}/join`, "usr_trinity"); // restore SG2 to just neo
const sole = await del(`/api/subgrids/${SG2}/join`, "usr_neo");
ok(sole.status === 409 && sole.body.error === "sole_admin", `sole admin can't abandon the team → ${sole.body.error}`);

console.log("\n== leave the demo gated (reputation ≥ 500) ==");
await post(`/api/subgrids/${SG2}/access`, { access: "reputation", min_reputation: 500 }, "usr_neo");
const v1 = await get(`/api/subgrids/${SG1}`, "usr_neo");
const v2 = await get(`/api/subgrids/${SG2}`, "usr_trinity");
console.log("SG1:", v1.body.access.access, "| splits:", v1.body.splits.map((s) => `${s.name} ${s.pct}%`).join(" / "));
console.log("SG2:", `${v2.body.access.access} ≥${v2.body.access.min_reputation}`, "| trinity can_join:", JSON.stringify(v2.body.viewer.can_join));
