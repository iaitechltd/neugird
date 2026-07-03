/**
 * Validate the configured x402 facilitator BEFORE pointing NeuGrid at it: fetch
 * its /supported list and confirm it offers the Solana `exact` scheme (and the
 * fee-payer the SVM payload needs). Dependency-free.
 *
 *   NEUGRID_X402_FACILITATOR_URL=https://x402.org/facilitator \
 *   node scripts/x402-facilitator-check.mjs
 *
 * Coinbase CDP (needs auth): set NEUGRID_X402_FACILITATOR_URL to the CDP endpoint,
 * `npm i @coinbase/x402`, and set the CDP API keys — this script uses its
 * createAuthHeaders automatically. Self-hosted/PayAI: set NEUGRID_X402_API_KEY.
 */
const BASE = (process.env.NEUGRID_X402_FACILITATOR_URL || "").replace(/\/$/, "");
if (!BASE) { console.error("set NEUGRID_X402_FACILITATOR_URL"); process.exit(1); }

async function authHeaders() {
  if (process.env.NEUGRID_X402_API_KEY) return { authorization: `Bearer ${process.env.NEUGRID_X402_API_KEY}` };
  try {
    const m = await import("@coinbase/x402");
    const h = await m.facilitator?.createAuthHeaders?.();
    return h?.supported ?? h?.verify ?? {}; // CDP v2 mints a per-endpoint JWT — /supported needs its own
  } catch { return {}; }
}

const res = await fetch(`${BASE}/supported`, { headers: await authHeaders() })
  .catch((e) => { console.error("connection failed:", e.message); process.exit(1); });
if (!res.ok) { console.error(`facilitator /supported → HTTP ${res.status}: ${await res.text().catch(() => "")}`); process.exit(1); }

const data = await res.json().catch(() => ({}));
const kinds = data.kinds ?? [];
console.log(`✓ facilitator reachable (${BASE}) — ${kinds.length} supported kind(s)`);

const solana = kinds.filter((k) => String(k.network).toLowerCase().includes("solana"));
if (!solana.length) {
  console.error("✗ NO Solana `exact` kind advertised — this facilitator may not support Solana. Pick another (Coinbase CDP / PayAI).");
  process.exit(1);
}
console.log("✓ Solana kinds:", solana.map((k) => `${k.scheme}/${k.network}`).join(", "));
const withFeePayer = solana.find((k) => k?.extra?.feePayer);
if (withFeePayer) console.log("✓ fee-payer advertised:", withFeePayer.extra.feePayer);
else console.log("• no fee-payer in `extra` — the client will need to supply/derive one.");
console.log("\nFacilitator looks good. Set NEUGRID_X402_NETWORK to the exact network string above.");
