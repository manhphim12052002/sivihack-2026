/**
 * Table registry for the JSON backend: primary key and column defaults per relation, mirroring
 * `supabase/migrations/*.sql` and `apps/web/supabase/migrations/*.sql`.
 *
 * A JSON file replicates one relation: `<name>.json` holds a JSON array of row objects whose keys
 * are the Postgres column names. A missing file is an empty table.
 *
 * The primary key drives insert conflicts (23505) and upsert matching. Defaults cover the columns
 * Postgres would fill in for the inserts this app performs; a `NOW` value becomes an ISO
 * timestamp at write time, matching `timestamptz default now()`.
 */

import type { DbRow } from "./types";

/** Sentinel for `default now()`. */
export const NOW = Symbol("now()");

export interface TableSchema {
  primaryKey: readonly string[];
  /** Column defaults applied to inserted rows that omit the column. */
  defaults?: Readonly<Record<string, unknown>>;
  /** Views are read-only, like in Postgres (no `instead of` triggers exist). */
  readOnly?: boolean;
}

const TIMESTAMPS = { created_at: NOW, updated_at: NOW } as const;

export const SCHEMA: Readonly<Record<string, TableSchema>> = {
  // ── Sources and chunks ────────────────────────────────────────────────────
  sources: {
    primaryKey: ["id"],
    defaults: { status: "AVAILABLE", rejected_items: 0, created_at: NOW },
  },
  chunks: { primaryKey: ["id"], defaults: { created_at: NOW } },

  // ── Companies ─────────────────────────────────────────────────────────────
  companies: {
    primaryKey: ["id"],
    defaults: {
      headquarters: "",
      status: "ONBOARDING",
      home_base: "",
      raw_text: "",
      field_evidence: {},
      revision: 0,
      ...TIMESTAMPS,
    },
  },
  company_capabilities: {
    primaryKey: ["id"],
    defaults: { status: "PENDING", created_at: NOW },
  },
  company_references: {
    primaryKey: ["id"],
    defaults: { status: "PENDING", created_at: NOW },
  },
  company_qualifications: {
    primaryKey: ["id"],
    defaults: { status: "PENDING", freshness: "CURRENT", created_at: NOW },
  },
  company_resources: {
    primaryKey: ["id"],
    defaults: { status: "PENDING", evidence: [], created_at: NOW },
  },
  company_capacity: {
    primaryKey: ["id"],
    defaults: { status: "PENDING", evidence: [], created_at: NOW },
  },
  company_constraints: {
    primaryKey: ["id"],
    defaults: {
      origin: "CUSTOMER_PROVIDED",
      operator: "EXCLUDE",
      severity: "HARD",
      status: "PENDING",
      evidence: [],
      state: "EXPLICIT",
      created_at: NOW,
    },
  },
  company_preferences: {
    primaryKey: ["id"],
    defaults: {
      origin: "CUSTOMER_PROVIDED",
      operator: "PREFER",
      severity: "SOFT",
      status: "PENDING",
      evidence: [],
      state: "EXPLICIT",
      created_at: NOW,
    },
  },
  company_knowledge_gaps: {
    primaryKey: ["id"],
    defaults: { state: "UNKNOWN", created_at: NOW },
  },
  company_ingest_jobs: {
    primaryKey: ["id"],
    defaults: { stage: "queued", pct: 0, ...TIMESTAMPS },
  },

  // ── Demo board: flat profile/lot shapes the triage UI screens on ──────────
  company_profiles: {
    primaryKey: ["id"],
    defaults: {
      home_base: "",
      regions: [],
      trades: [],
      cpv_prefixes: [],
      references_held: [],
      hard_exclusions: [],
      raw_text: "",
      ...TIMESTAMPS,
    },
  },
  demo_lots: {
    primaryKey: ["id"],
    defaults: {
      lot_count: 1,
      docs_retrieved: false,
      source: "oeffentlichevergabe.de",
      created_at: NOW,
    },
  },

  // ── Match evaluations ─────────────────────────────────────────────────────
  match_evaluations: {
    primaryKey: ["id"],
    defaults: {
      hard_blockers: 0,
      hard_unknowns: 0,
      soft_concerns: 0,
      ...TIMESTAMPS,
    },
  },
  matching_tasks: { primaryKey: ["id"], defaults: { created_at: NOW } },
  match_results: { primaryKey: ["id"], defaults: { created_at: NOW } },
  match_knowledge_gaps: { primaryKey: ["id"], defaults: { created_at: NOW } },

  // ── Tender pipeline (written by apps/pipeline, read here) ─────────────────
  lots: { primaryKey: ["source", "notice_id", "notice_version", "lot_id"] },
  observations: {
    primaryKey: ["scope_key", "attribute", "extractor", "source_id"],
  },
  documents: { primaryKey: ["lot_key", "url"] },
  document_files: { primaryKey: ["lot_key", "url", "source_id"] },
  cpv_descriptions: { primaryKey: ["code"] },
  verdicts: { primaryKey: ["lot_key", "company_id", "criterion"] },
  sync_state: { primaryKey: ["key"] },
  ingest_jobs: { primaryKey: ["id"], defaults: { created_at: NOW } },

  // ── Views: exported resolved snapshots, read-only ─────────────────────────
  lots_latest: { primaryKey: ["lot_key"], readOnly: true },
  lots_current: { primaryKey: ["lot_key"], readOnly: true },
  observations_resolved: {
    primaryKey: ["scope_key", "attribute"],
    readOnly: true,
  },
};

/** Schema for a relation, or `undefined` when the name is not part of the replicated schema. */
export function tableSchema(table: string): TableSchema | undefined {
  return SCHEMA[table];
}

/** Fill in the columns Postgres would default for an inserted row. */
export function withDefaults(schema: TableSchema, row: DbRow): DbRow {
  const out: DbRow = { ...row };
  for (const [column, value] of Object.entries(schema.defaults ?? {})) {
    if (out[column] === undefined) {
      out[column] = value === NOW ? new Date().toISOString() : value;
    }
  }
  return out;
}
