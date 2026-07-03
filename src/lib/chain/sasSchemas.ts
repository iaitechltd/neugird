/**
 * NeuGrid's soulbound-credential schemas, mapped to Solana Attestation Service
 * (SAS) schemas. ONE credential authority ("NEUGRID") issues five schema types;
 * each verified achievement mints a tokenized (Token-2022 NonTransferable)
 * attestation to the subject's wallet.
 *
 * Data layout: rather than a bespoke per-schema field layout, every NeuGrid
 * attestation stores a single UTF-8 `payload` field = `JSON.stringify(att.fields)`
 * (SAS field type 12 = string). Simple, forward-compatible, and lossless — the
 * on-chain credential carries the same fields as the in-platform mirror.
 *
 * The credential + these schemas are created ONCE per deploy (scripts/sas-setup.mjs);
 * the live adapter (./sasSolana) then mints/closes attestations against them.
 */

export const SAS_CREDENTIAL_NAME = "NEUGRID";
export const SAS_FIELD_NAMES = ["payload"]; // one string field
export const SAS_LAYOUT = [12];             // SAS type 12 = UTF-8 string
/** Token metadata URI for minted credentials (override per deploy). */
export const SAS_TOKEN_URI = process.env.NEUGRID_SAS_TOKEN_URI || "https://neugrid.io/credential.json";

export interface NeuGridSasSchema {
  key: string;         // the NeuGrid attestation `schema` value
  name: string;        // SAS schema name
  version: number;
  description: string;
  token: { name: string; symbol: string };
}

/** Keyed by the `Attestation.schema` value the attestations module emits. */
export const SAS_SCHEMAS: Record<string, NeuGridSasSchema> = {
  proof_of_build:    { key: "proof_of_build",    name: "proof_of_build",    version: 1, description: "Witnessed Echo build — proof of build",        token: { name: "NeuGrid Proof of Build",   symbol: "NGPOB" } },
  work_delivered:    { key: "work_delivered",    name: "work_delivered",    version: 1, description: "Verified delivered + paid work",               token: { name: "NeuGrid Work Delivered",   symbol: "NGWORK" } },
  milestone_shipped: { key: "milestone_shipped", name: "milestone_shipped", version: 1, description: "Released Fund funding milestone",          token: { name: "NeuGrid Milestone Shipped", symbol: "NGMILE" } },
  project_launched:  { key: "project_launched",  name: "project_launched",  version: 1, description: "Audited project launched on Trade",           token: { name: "NeuGrid Project Launched", symbol: "NGLNCH" } },
  agent_trusted:     { key: "agent_trusted",     name: "agent_trusted",     version: 1, description: "Agent promoted to the trusted tier",           token: { name: "NeuGrid Agent Trusted",    symbol: "NGTRST" } },
};

export function sasSchemaFor(key: string): NeuGridSasSchema | undefined {
  return SAS_SCHEMAS[key];
}
