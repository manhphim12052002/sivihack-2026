/**
 * Read tenders from the pipeline's Supabase tables.
 *
 * The pipeline writes to `lots` (one row per lot per notice version), `observations`
 * (immutable fact readings), `sources`/`chunks` (documents and their pages or GAEB
 * positions) and `document_files` (which files a lot links). We read from:
 *   - `lots_latest`           — one row per lot at its newest notice version
 *   - `observations_resolved` — resolved value per (scope_key, attribute), with evidence
 *   - `document_files` → `sources` → `chunks` — the lot's documents and their passages
 *
 * The result is shaped into the TenderSummary / TenderDetail the UI renders, extended with
 * the typed Requirement conditions, the unmatched requirements ("stated, not checked") and
 * the document status the decision engine and the briefing page need.
 */

import { db } from "@/lib/db";
import type { components } from "@/lib/api-types";
import type {
  DocumentStatus,
  FactWithCondition,
  Passage,
  TenderDetailWithDocuments,
  UnmatchedRequirement,
} from "@/lib/match/types";

type TenderSummary = components["schemas"]["TenderSummary"];
type TenderFactSheet = components["schemas"]["TenderFactSheet"];
type Evidence = components["schemas"]["Evidence"];
type Lot = components["schemas"]["Lot"];

// The 15 fact-sheet attributes (same list as pipeline/factsheet.py)
export const FACT_SHEET_ATTRIBUTES = [
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
  kind: string;
  attribute: string;
  state: string;
  value_text: string | null;
  value_num: number | null;
  unit: string | null;
  condition: Record<string, unknown> | null;
  category: string | null;
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

interface SourceRow {
  id: string;
  type: string;
  filename: string | null;
  status: string;
  pages: number | null;
}

interface ChunkRow {
  id: string;
  source_id: string;
  page: number | null;
  section: string | null;
  text: string;
}

const OBSERVATION_COLUMNS =
  "scope_key,kind,attribute,state,value_text,value_num,unit,condition,category,confidence,evidence";

// ─── Converters ───────────────────────────────────────────────────────────────

/** "Bedingungen.pdf#p.2" → "Bedingungen.pdf"; "xpath:BT-750" stays as is. */
function docOf(locator: string | null, sourceId: string): string {
  if (!locator) return sourceId;
  return locator.includes("#") ? locator.split("#")[0] : locator;
}

function observationToFact(obs: ObservationRow): FactWithCondition {
  const evidence: Evidence[] = (obs.evidence ?? []).map((e) => ({
    doc: docOf(e.locator, e.source_id),
    page: e.page ?? null,
    quote_de: e.quote ?? "",
  }));

  const value = obs.value_num !== null ? obs.value_num : obs.value_text;
  const confidence = (obs.confidence ?? "not_found") as FactWithCondition["confidence"];

  return { value, confidence, evidence, condition: obs.condition ?? null };
}

function buildFactSheet(lotObs: ObservationRow[], procObs: ObservationRow[]): TenderFactSheet {
  const byAttr = new Map<string, ObservationRow>();
  // Lot-scope observations override procedure-scope for the same attribute. Rows without a
  // `kind` (older exports) are facts; requirement and unmatched rows are read elsewhere.
  const isFact = (o: ObservationRow) => !o.kind || o.kind === "fact";
  for (const o of procObs) if (isFact(o)) byAttr.set(o.attribute, o);
  for (const o of lotObs) if (isFact(o)) byAttr.set(o.attribute, o);

  const sheet: Record<string, FactWithCondition> = {};
  for (const attr of FACT_SHEET_ATTRIBUTES) {
    const obs = byAttr.get(attr);
    if (obs && obs.state !== "NOT_FOUND") sheet[attr] = observationToFact(obs);
  }
  return sheet as TenderFactSheet;
}

function unmatchedOf(rows: ObservationRow[]): UnmatchedRequirement[] {
  return rows
    .filter((o) => o.kind === "unmatched" && o.state === "KNOWN" && o.value_text)
    .map((o) => {
      const ev = o.evidence?.[0];
      const locator = ev?.locator ?? null;
      return {
        category: o.category ?? o.attribute.split("#")[0],
        quote_de: o.value_text ?? "",
        doc: docOf(locator, ev?.source_id ?? ""),
        page: ev?.page ?? null,
        section: locator && locator.includes("#") && !/#p\.\d+$/.test(locator) ? locator.split("#")[1] : null,
      };
    });
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

// ─── Documents and passages ───────────────────────────────────────────────────

async function lotSources(lotKey: string): Promise<SourceRow[]> {
  const { data: links } = await db.from("document_files").select("source_id").eq("lot_key", lotKey);
  const ids = [...new Set((links ?? []).map((l) => (l as { source_id: string }).source_id))];
  if (ids.length === 0) return [];
  const { data } = await db.from("sources").select("id,type,filename,status,pages").in("id", ids);
  return (data ?? []) as SourceRow[];
}

/** Every readable passage of the lot's documents: PDF pages and GAEB positions/blocks. */
export async function loadLotPassages(lotKey: string): Promise<Passage[]> {
  const sources = await lotSources(lotKey);
  const readable = sources.filter((s) => s.status === "AVAILABLE");
  if (readable.length === 0) return [];
  const { data } = await db
    .from("chunks")
    .select("id,source_id,page,section,text")
    .in("source_id", readable.map((s) => s.id));
  const nameOf = new Map(readable.map((s) => [s.id, s.filename ?? s.id]));
  return ((data ?? []) as ChunkRow[]).map((c) => ({
    chunk_id: c.id,
    doc: nameOf.get(c.source_id) ?? c.source_id,
    page: c.page,
    section: c.section,
    text: c.text,
  }));
}

async function documentStatus(lotKey: string): Promise<DocumentStatus[]> {
  const sources = await lotSources(lotKey);
  if (sources.length === 0) return [];
  const { data: chunkRows } = await db
    .from("chunks")
    .select("source_id")
    .in("source_id", sources.map((s) => s.id));
  const counts = new Map<string, number>();
  for (const c of (chunkRows ?? []) as { source_id: string }[]) counts.set(c.source_id, (counts.get(c.source_id) ?? 0) + 1);
  return sources
    .map((s) => ({
      name: s.filename ?? s.id,
      type: s.type,
      status: s.status,
      pages: s.pages,
      chunks: counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** List all lots (latest version) as TenderSummary, newest first. */
export async function listTenders(limit = 100): Promise<TenderSummary[]> {
  const { data, error } = await db
    .from("lots_latest")
    .select(
      "lot_key,procedure_key,source,notice_id,notice_version,lot_id,title,buyer_name,place_city,place_nuts,cpv_main,estimated_value,submission_deadline,published,ingested_at,notice_url,lot_count",
    )
    .order("ingested_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as LotRow[]).map(lotRowToSummary);
}

/** Every known lot id, uncapped — for screening the whole store rather than a batch. */
export async function listAllTenderIds(): Promise<string[]> {
  const { data } = await db.from("lots_latest").select("lot_key");
  return ((data ?? []) as Array<{ lot_key: string }>).map((r) => r.lot_key);
}

/**
 * The week's batch for the triage board: lots whose documents were read come first (they
 * carry the document-backed reasons), then open lots by soonest deadline, up to `limit`.
 */
export async function listTriageTenders(limit = 40): Promise<TenderSummary[]> {
  const { data: docLots } = await db.from("documents").select("lot_key").eq("status", "RETRIEVED");
  const withDocs = [...new Set((docLots ?? []).map((d) => (d as { lot_key: string }).lot_key))];

  const columns =
    "lot_key,procedure_key,source,notice_id,notice_version,lot_id,title,buyer_name,place_city,place_nuts,cpv_main,estimated_value,submission_deadline,published,notice_url,lot_count";
  const first = withDocs.length
    ? ((await db.from("lots_latest").select(columns).in("lot_key", withDocs)).data ?? [])
    : [];
  // The db port has no range filter; take the soonest deadlines and drop the expired ones here.
  const { data: byDeadline } = await db
    .from("lots_latest")
    .select(columns)
    .order("submission_deadline", { ascending: true });
  const now = new Date().toISOString();
  const rest = ((byDeadline ?? []) as unknown as LotRow[]).filter((r) => (r.submission_deadline ?? "") >= now).slice(0, limit);

  const seen = new Set<string>();
  const rows: LotRow[] = [];
  for (const r of [...(first as unknown as LotRow[]), ...rest]) {
    if (seen.has(r.lot_key) || rows.length >= limit) continue;
    seen.add(r.lot_key);
    rows.push(r);
  }
  return rows.map((r) => ({ ...lotRowToSummary(r), docs_retrieved: withDocs.includes(r.lot_key) }));
}

/** Load a single lot by lot_key and build a full TenderDetail with fact sheet, unmatched
 *  requirements and document status. */
export async function getTender(lotKey: string): Promise<TenderDetailWithDocuments | null> {
  const { data: rows, error } = await db.from("lots_latest").select("*").eq("lot_key", lotKey).limit(1);

  if (error || !rows || rows.length === 0) return null;
  const row = rows[0] as LotRow;

  // Resolved observations for both LOT (this lot_key) and PROCEDURE scopes
  const [lotObsResult, procObsResult, documents] = await Promise.all([
    db.from("observations_resolved").select(OBSERVATION_COLUMNS).eq("scope_key", row.lot_key),
    db.from("observations_resolved").select(OBSERVATION_COLUMNS).eq("scope_key", row.procedure_key),
    documentStatus(row.lot_key),
  ]);

  const lotObs = (lotObsResult.data ?? []) as ObservationRow[];
  const procObs = (procObsResult.data ?? []) as ObservationRow[];
  const fact_sheet = buildFactSheet(lotObs, procObs);
  const unmatched = unmatchedOf([...procObs, ...lotObs]);

  // Sibling lots of the same procedure (for lot-scoped evaluation)
  const { data: siblingRows } = await db
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
    id: s.lot_key, // lot_key as lot id so the match engine can look it up
    title: s.title,
    cpv: s.cpv_main,
    value_eur: s.estimated_value,
    trade: null,
  }));

  const cpvDescriptions = (row.extra?.cpv_descriptions ?? {}) as Record<string, string>;

  return {
    id: row.lot_key,
    lot_key: row.lot_key,
    procedure_key: row.procedure_key,
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
    docs_retrieved: documents.some((d) => d.status === "AVAILABLE"),
    source: row.source ?? "oeffentlichevergabe.de",
    description: row.description,
    lots: lots.length > 0 ? lots : undefined,
    fact_sheet: Object.keys(fact_sheet).length > 0 ? fact_sheet : null,
    notice: row.cpv_main && cpvDescriptions[row.cpv_main] ? { cpv_label: cpvDescriptions[row.cpv_main] } : undefined,
    documents: documents.map((d) => ({
      name: d.name,
      pages: d.pages,
      text_extracted: d.status === "AVAILABLE",
    })),
    document_status: documents,
    unmatched_requirements: unmatched,
  };
}
