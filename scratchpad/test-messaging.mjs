// Universal messaging: human↔human text + a hire offer (accepted), and an AGENT
// pitching a human a DEAL via the gateway. Seeds neo's inbox. Server RUNNING:
//   node scratchpad/test-messaging.mjs
const BASE = "http://localhost:3000";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => ({ "content-type": "application/json", cookie: `ng_uid=${uid}` });
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: H(uid), body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: { cookie: `ng_uid=${uid}` } }).then(j);
const ok = (c, m) => console.log(`  ${c ? "✓" : "✗ FAIL"} ${m}`);

console.log("== HUMAN ↔ HUMAN: chat + a hire offer (accepted) ==");
let r = await post("/api/messages", { to_id: "usr_trinity", body: "Hey — your audited-vault work is exactly what the Growth Pod needs." }, "usr_neo");
const C1 = r.body.conversation_id;
ok(r.status === 201 && C1, "neo started a conversation with trinity");
await post(`/api/messages/${C1}`, { kind: "text", body: "Appreciate it! What did you have in mind?" }, "usr_trinity");
r = await post(`/api/messages/${C1}`, { kind: "hire", body: "Milestone-escrowed, starts next week.", offer: { amount: 5000, asset: "USDC", terms: "Lead the Growth Pod smart-contract work" } }, "usr_neo");
const hireMsg = r.body.messages.find((m) => m.offer?.offer_kind === "hire");
ok(!!hireMsg && hireMsg.offer.status === "pending", "neo sent trinity a HIRE offer (5,000 USDC, pending)");
const selfResolve = await post(`/api/messages/${C1}`, { action: "resolve", message_id: hireMsg.message_id, accept: true }, "usr_neo");
ok(selfResolve.status === 403 && selfResolve.body.error === "not_recipient", `sender can't accept own offer → ${selfResolve.body.error}`);
r = await post(`/api/messages/${C1}`, { action: "resolve", message_id: hireMsg.message_id, accept: true }, "usr_trinity");
ok(r.body.messages.find((m) => m.message_id === hireMsg.message_id)?.offer.status === "accepted", "trinity (recipient) ACCEPTED the hire");

console.log("\n== AGENT → HUMAN: an external agent pitches neo a deal (via gateway) ==");
const reg = await post("/api/agent-gateway/register", { name: "Hermes Recruiter", external_framework: "Hermes", capabilities: ["sourcing", "deal-making"] }, "usr_trinity");
const key = reg.body.api_key;
ok(!!key && reg.body.agent_id, `registered external agent ${reg.body.agent_id} (owner trinity)`);
const am = await fetch(`${BASE}/api/agent-gateway/message`, { method: "POST", headers: { "content-type": "application/json", "x-ng-agent-key": key }, body: JSON.stringify({ to_id: "usr_neo", kind: "deal", body: "Auto-sourced match for your Grid.", offer: { amount: 250000, asset: "GRID", terms: "30-day distribution campaign across our creator network", success_metric: "500 verified on-chain actions" } }) }).then(j);
ok(am.status === 201 && am.body.conversation_id, "agent sent neo a DEAL offer via the gateway");
const noKey = await fetch(`${BASE}/api/agent-gateway/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to_id: "usr_neo", body: "x" }) }).then(j);
ok(noKey.status === 401, "gateway rejects a message with no agent key (401)");

console.log("\n== neo's INBOX ==");
const inbox = (await get("/api/messages", "usr_neo")).body;
ok(inbox.conversations.length >= 2, `neo has ${inbox.conversations.length} conversations`);
const agentConvo = inbox.conversations.find((c) => c.counterparty.type === "agent");
ok(agentConvo && agentConvo.pending_offer, `agent conversation present, pending offer flagged (${agentConvo?.counterparty.name})`);
const thread = (await get(`/api/messages/${agentConvo.conversation_id}`, "usr_neo")).body;
ok(thread.counterparty.type === "agent" && thread.messages.some((m) => m.offer?.status === "pending"), "neo sees the agent's pending DEAL in-thread");
console.log("\ninbox:", inbox.conversations.map((c) => `${c.counterparty.name} (${c.counterparty.type})${c.pending_offer ? " ⟨offer⟩" : ""}`));
