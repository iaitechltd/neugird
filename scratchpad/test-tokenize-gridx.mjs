// Tokenize-from-GridX: a delivered+audited GridX product (no milestones) earns a token.
const BASE = "http://localhost:3000";
const SLUG = "solana-defi-staking-vault-with-auto-comp";
const PROD = "prod_36461c8a";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => (uid ? { cookie: `ng_uid=${uid}` } : {});
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...H(uid) }, body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: H(uid) }).then(j);

console.log("== 1. OWNER (usr_neo) requests security audit on the product grid ==");
const aud = await post(`/api/grids/${SLUG}/audit`, {}, "usr_neo");
const auditId = aud.body?.audit?.audit_id;
console.log("  ->", aud.status, auditId ?? aud.body?.error, "(before this change: would've been deliver_all_milestones)");

console.log("== 2. NON-OWNER (usr_trinity) reviews → pass ==");
const rev = await post(`/api/audits/${auditId}/review`, { pass: true }, "usr_trinity");
console.log("  ->", rev.status, rev.body?.audit?.status ?? rev.body?.error);

console.log("== 3. launch eligibility now ==");
const elig = await get(`/api/grids/${SLUG}/launch`, "usr_neo");
console.log("  ->", JSON.stringify(elig.body?.eligibility));

console.log("== 4. OWNER launches the token on Alpha ==");
const launch = await post(`/api/grids/${SLUG}/launch`, {}, "usr_neo");
console.log("  ->", launch.status, launch.body?.market?.market_id ?? launch.body?.error, "stage:", launch.body?.market?.stage, "symbol:", launch.body?.token?.symbol);

console.log("== 5. GridX product view now shows the market ==");
const view = await get(`/api/gridx/${PROD}`, "usr_neo");
console.log("  -> market:", view.body?.market, "| launch:", JSON.stringify(view.body?.launch));

console.log("== 6. GUARDRAIL: a community grid (zion) can't tokenize ==");
const z = await get(`/api/grids/zion/launch`, "usr_neo");
console.log("  ->", JSON.stringify(z.body?.eligibility), "(expect not_tokenizable)");
