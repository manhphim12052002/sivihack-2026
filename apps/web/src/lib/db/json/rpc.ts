/**
 * JSON port of the `save_company_intelligence(payload, expected_revision)` stored procedure
 * (apps/web/supabase/migrations/20260918_company_intelligence.sql).
 *
 * Same contract: optimistic concurrency on `companies.revision`, company-level facts written to
 * the `companies` row, and every collection replaced wholesale in its child table. Postgres runs
 * this in one transaction; here each table file is written under its own lock, so a crash between
 * two files can leave the aggregate half-written — acceptable for a single-process local demo,
 * and the next save replays the whole aggregate.
 */

import { writeTable } from "./store";
import type { DbRow } from "../types";

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Child collections, in the order and column shape the stored procedure writes them. */
const COLLECTIONS: ReadonlyArray<{
  table: string;
  key: string;
  row: (item: DbRow, companyId: string) => DbRow;
}> = [
  {
    table: "company_capabilities",
    key: "capabilities",
    row: (i, cid) => ({
      company_id: cid,
      id: text(i.id),
      type: text(i.type),
      label: text(i.label),
      origin: text(i.origin),
      status: text(i.status),
      evidence: i.evidence ?? [],
    }),
  },
  {
    table: "company_references",
    key: "references",
    row: (i, cid) => ({
      company_id: cid,
      id: text(i.id),
      name: text(i.name),
      client: text(i.client),
      project_types: i.project_types ?? [],
      location: text(i.location),
      value_eur: num(i.contract_value_eur),
      completed_at: text(i.completed_at),
      capabilities: i.capabilities ?? [],
      origin: text(i.origin),
      status: text(i.status),
      evidence: i.evidence ?? [],
    }),
  },
  {
    table: "company_qualifications",
    key: "qualifications",
    row: (i, cid) => ({
      company_id: cid,
      id: text(i.id),
      type: text(i.type),
      label: text(i.label),
      knowledge_state: text(i.knowledge_state),
      status: text(i.status),
      valid_from: text(i.valid_from),
      valid_until: text(i.valid_until),
      freshness: text(i.freshness),
      origin: text(i.origin),
      evidence: i.evidence ?? [],
    }),
  },
  {
    table: "company_resources",
    key: "resources",
    row: (i, cid) => operationalRow(i, cid),
  },
  {
    table: "company_capacity",
    key: "capacity",
    row: (i, cid) => operationalRow(i, cid),
  },
  {
    table: "company_constraints",
    key: "constraints",
    row: (i, cid) => policyRow(i, cid),
  },
  {
    table: "company_preferences",
    key: "preferences",
    row: (i, cid) => policyRow(i, cid),
  },
  {
    table: "company_knowledge_gaps",
    key: "knowledge_gaps",
    row: (i, cid) => ({
      company_id: cid,
      id: text(i.id),
      type: text(i.type),
      state: text(i.state),
      reason: text(i.reason),
    }),
  },
];

function operationalRow(i: DbRow, companyId: string): DbRow {
  return {
    company_id: companyId,
    id: text(i.id),
    type: text(i.type),
    label: text(i.label),
    value: num(i.value),
    unit: text(i.unit),
    available_from: text(i.available_from),
    valid_as_of: text(i.valid_as_of),
    raw_value: text(i.raw_value),
    state: text(i.state),
    origin: text(i.origin),
    status: text(i.status),
    evidence: i.evidence ?? [],
  };
}

function policyRow(i: DbRow, companyId: string): DbRow {
  return {
    company_id: companyId,
    id: text(i.id),
    type: text(i.type),
    operator: text(i.operator),
    value: text(i.value),
    severity: text(i.severity),
    origin: text(i.origin),
    status: text(i.status),
    evidence: i.evidence ?? [],
    state: text(i.state),
    raw_value: text(i.raw_value),
  };
}

/** Returns the new revision, like the SQL function. */
export async function saveCompanyIntelligence(
  payload: DbRow,
  expectedRevision: number,
): Promise<number> {
  const companyId = String(payload.company_id);
  const identity = (payload.identity ?? {}) as DbRow;
  let nextRevision = expectedRevision + 1;

  await writeTable("companies", (rows) => {
    const at = rows.findIndex((r) => r.id === companyId);
    if (at === -1) throw new Error("Company not found");
    const current = Number(rows[at].revision ?? 0);
    if (current !== expectedRevision) {
      throw new Error("PROFILE_CONFLICT: Reload before saving");
    }
    nextRevision = current + 1;
    rows[at] = {
      ...rows[at],
      name: text(identity.name),
      headquarters: text(identity.headquarters) ?? "",
      employees: num(identity.employees),
      revenue_eur: num(identity.revenue_eur),
      website: text(identity.website),
      geography: payload.geography ?? null,
      commercial_profile: payload.commercial_profile ?? null,
      field_evidence: payload.field_evidence ?? {},
      cpv_prefixes: payload.cpv_prefixes ?? [],
      intelligence_version: 2,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
    };
    return [rows[at]];
  });

  for (const collection of COLLECTIONS) {
    const items = list(payload[collection.key]) as DbRow[];
    await writeTable(collection.table, (rows) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].company_id === companyId) rows.splice(i, 1);
      }
      const inserted = items.map((item) => ({
        ...collection.row(item, companyId),
        created_at: new Date().toISOString(),
      }));
      rows.push(...inserted);
      return inserted;
    });
  }

  return nextRevision;
}
