/**
 * Read tenders from the pipeline's Supabase tables.
 *
 * The pipeline writes to `lots` (one row per lot per notice version) and
 * `observations` (immutable fact readings). We read from:
 *   - `lots_latest`          — one row per lot at its newest notice version
 *   - `observations_resolved` — resolved value per (scope_key, attribute)
 *
 * The result is shaped into the same TenderSummary / TenderDetail the mock
 * tenders use, so the match engine and UI need no changes.
 */

import { supabase } from "@/lib/supabase";
import type { components } from "@/lib/api-types";

type TenderDetail = components["schemas"]["TenderDetail"];
type TenderSummary = components["schemas"]["TenderSummary"];
type TenderFactSheet = components["schemas"]["TenderFactSheet"];
type Fact = components["schemas"]["Fact"];
type Evidence = components["schemas"]["Evidence"];
type Lot = components["schemas"]["Lot"];

// The 15 fact-sheet attributes (same list as pipeline/factsheet.py)
const FACT_SHEET_ATTRIBUTES = [
  "trade_scope",
  "place_of_performance",
  "estimated_value",
  "lots",
  "references_required",
  "eligibility_proofs",
  "construction_window",
  "guarantees",
  "penalty",
  "self_performance_min_pct",
  "side_offers_allowed",
  "consortium_allowed",
  "submission_deadline",
  "special_qualifications",
  "contractor_role",
] as const;

// ─── Row types (from Supabase) ────────────────────────────────────────────────

interface LotRow {
  lot_key: string;
  procedure_key: string;
  source: string;
  notice_id: string;
  notice_version: string;
  lot_id: string;
  title: string | null;
  buyer_name: string | null;
  place_city: string | null;
  place_nuts: string | null;
  cpv_main: string | null;
  cpv_additional: string[] | null;
  estimated_value: number | null;
  estimated_value_currency: string | null;
  submission_deadline: string | null;
  published: string | null;
  notice_url: string | null;
  lot_count: number;
  description: string | null;
  extra: Record<string, unknown> | null;
}

interface ObservationRow {
  scope_key: string;
  attribute: string;
  state: string;
  value_text: string | null;
  value_num: number | null;
  unit: string | null;
  confidence: string;
  evidence: Array<{
    source_id: string;
    extractor: string;
    locator: string | null;
    page: number | null;
    quote: string | null;
    value: unknown;
  }> | null;
}

// ─── Converters ───────────────────────────────────────────────────────────────

function observationToFact(obs: ObservationRow): Fact {
  const evidence: Evidence[] = (obs.evidence ?? []).map((e) => ({
    doc: e.locator ?? e.source_id,
    page: e.page ?? null,
    quote_de: e.quote ?? "",
  }));

  const value = obs.value_num !== null ? obs.value_num : obs.value_text;
  const confidence = (obs.confidence ?? "not_found") as Fact["confidence"];

  return { value, confidence, evidence };
}

function buildFactSheet(
  lotObs: ObservationRow[],
  procObs: ObservationRow[],
): TenderFactSheet {
  const byAttr = new Map<string, ObservationRow>();
  // Lot-scope observations override procedure-scope for the same attribute
  for (const o of procObs) byAttr.set(o.attribute, o);
  for (const o of lotObs) byAttr.set(o.attribute, o);

  const sheet: Partial<TenderFactSheet> = {};
  for (const attr of FACT_SHEET_ATTRIBUTES) {
    const obs = byAttr.get(attr);
    if (obs && obs.state !== "NOT_FOUND") {
      (sheet as Record<string, Fact>)[attr] = observationToFact(obs);
    }
  }
  return sheet as TenderFactSheet;
}

function lotRowToSummary(row: LotRow): TenderSummary {
  return {
    id: row.lot_key,
    title: row.title,
    buyer_name: row.buyer_name,
    place_city: row.place_city,
    place_nuts: row.place_nuts,
    cpv_main: row.cpv_main,
    estimated_value_eur: row.estimated_value,
    submission_deadline: row.submission_deadline,
    published: row.published,
    notice_url: row.notice_url,
    lot_count: row.lot_count ?? 1,
    docs_retrieved: false,
    source: row.source ?? "oeffentlichevergabe.de",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** List all lots (latest version) as TenderSummary, newest first. */
export async function listTenders(limit = 100): Promise<TenderSummary[]> {
  const { data, error } = await supabase
    .from("lots_latest")
    .select(
      "lot_key,procedure_key,source,notice_id,notice_version,lot_id,title,buyer_name,place_city,place_nuts,cpv_main,estimated_value,submission_deadline,published,ingested_at,notice_url,lot_count",
    )
    .order("ingested_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as LotRow[]).map(lotRowToSummary);
}

/** Load a single lot by lot_key and build a full TenderDetail with fact_sheet. */
export async function getTender(lotKey: string): Promise<TenderDetail | null> {
  const { data: rows, error } = await supabase
    .from("lots_latest")
    .select("*")
    .eq("lot_key", lotKey)
    .limit(1);

  if (error || !rows || rows.length === 0) return null;
  const row = rows[0] as LotRow;

  // Fetch resolved observations for both LOT (this lot_key) and PROCEDURE scopes
  const [lotObsResult, procObsResult] = await Promise.all([
    supabase
      .from("observations_resolved")
      .select("scope_key,attribute,state,value_text,value_num,unit,confidence,evidence")
      .eq("scope_key", row.lot_key)
      .in("attribute", [...FACT_SHEET_ATTRIBUTES]),
    supabase
      .from("observations_resolved")
      .select("scope_key,attribute,state,value_text,value_num,unit,confidence,evidence")
      .eq("scope_key", row.procedure_key)
      .in("attribute", [...FACT_SHEET_ATTRIBUTES]),
  ]);

  const lotObs = (lotObsResult.data ?? []) as ObservationRow[];
  const procObs = (procObsResult.data ?? []) as ObservationRow[];
  const fact_sheet = buildFactSheet(lotObs, procObs);

  // Build sibling lots for the same procedure (for lot-scoped evaluation)
  const { data: siblingRows } = await supabase
    .from("lots_latest")
    .select("lot_key,lot_id,title,cpv_main,estimated_value")
    .eq("procedure_key", row.procedure_key);

  const lots: Lot[] = ((siblingRows ?? []) as Array<{
    lot_key: string;
    lot_id: string;
    title: string | null;
    cpv_main: string | null;
    estimated_value: number | null;
  }>).map((s) => ({
    id: s.lot_key,          // use lot_key as lot id so match engine can look it up
    title: s.title,
    cpv: s.cpv_main,
    value_eur: s.estimated_value,
    trade: null,
  }));

  return {
    id: row.lot_key,
    title: row.title,
    buyer_name: row.buyer_name,
    place_city: row.place_city,
    place_nuts: row.place_nuts,
    cpv_main: row.cpv_main,
    estimated_value_eur: row.estimated_value,
    submission_deadline: row.submission_deadline,
    published: row.published,
    notice_url: row.notice_url,
    lot_count: row.lot_count ?? 1,
    docs_retrieved: lotObs.length > 0 || procObs.length > 0,
    source: row.source ?? "oeffentlichevergabe.de",
    description: row.description,
    lots: lots.length > 0 ? lots : undefined,
    fact_sheet: Object.keys(fact_sheet).length > 0 ? fact_sheet : null,
  };
}
