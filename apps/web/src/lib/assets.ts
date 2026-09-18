/**
 * Demo board store, over the data port (lib/db).
 *
 * The triage UI screens a flat CompanyProfile against a flat TenderDetail fact sheet. Those two
 * shapes live in their own relations rather than being derived from the canonical company
 * aggregate (`companies` + `company_*`) or the pipeline's `lots`/`observations`:
 *
 *   company_profiles — the company profiles the board screens with; POST /api/companies adds to it
 *   demo_lots        — the pre-built lots the board screens against
 *
 * Both relations are checked into the store as `data/json-db/{company_profiles,demo_lots}.json`,
 * so the demo content is data, not a bundled fixture, and a created company survives a restart.
 * `scripts/load-demo-board.mjs` loads the same two files into Postgres for DATA_BACKEND=supabase.
 *
 * See supabase/migrations/20260918060000_demo_board.sql and lib/db/schema.ts for the columns.
 */
import { db } from "@/lib/db";
import type { CompanyProfile, TenderDetail, TenderSummary } from "@/lib/api";

const COMPANY_TABLE = "company_profiles";
const LOT_TABLE = "demo_lots";

/**
 * Projections that return exactly the API model's fields, so the store's bookkeeping columns
 * (created_at / updated_at) stay out of the responses.
 */
const COMPANY_COLUMNS = [
  "id",
  "name",
  "home_base",
  "home_base_geo",
  "regions",
  "radius_km",
  "trades",
  "cpv_prefixes",
  "contract_min_eur",
  "contract_max_eur",
  "partner_threshold_eur",
  "guarantee_capacity_eur",
  "self_perform_share_pct",
  "earliest_start",
  "capacity_per_week",
  "references_held",
  "hard_exclusions",
  "raw_text",
].join(",");

const LOT_COLUMNS = [
  "id",
  "title",
  "buyer_name",
  "place_city",
  "place_nuts",
  "cpv_main",
  "estimated_value_eur",
  "submission_deadline",
  "published",
  "notice_url",
  "lot_count",
  "docs_retrieved",
  "source",
  "description",
  "lots",
  "notice",
  "documents",
  "fact_sheet",
].join(",");

function fail(table: string, message: string): never {
  throw new Error(`${table}: ${message}`);
}

// ── Companies ──────────────────────────────────────────────────────────────────

export async function listCompanies(): Promise<CompanyProfile[]> {
  const { data, error } = await db
    .from(COMPANY_TABLE)
    .select(COMPANY_COLUMNS)
    .order("created_at");
  if (error) fail(COMPANY_TABLE, error.message);
  return (data ?? []) as unknown as CompanyProfile[];
}

export async function getCompany(
  id: string,
): Promise<CompanyProfile | undefined> {
  const { data, error } = await db
    .from(COMPANY_TABLE)
    .select(COMPANY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail(COMPANY_TABLE, error.message);
  return (data as unknown as CompanyProfile) ?? undefined;
}

export async function upsertCompany(company: CompanyProfile): Promise<void> {
  const { error } = await db
    .from(COMPANY_TABLE)
    .upsert({ ...company, updated_at: new Date().toISOString() });
  if (error) fail(COMPANY_TABLE, error.message);
}

/** True when a row was removed, false when the id was unknown. */
export async function deleteCompany(id: string): Promise<boolean> {
  const { data, error } = await db
    .from(COMPANY_TABLE)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) fail(COMPANY_TABLE, error.message);
  return (data ?? []).length > 0;
}

// ── Lots ───────────────────────────────────────────────────────────────────────

export async function listLots(): Promise<TenderDetail[]> {
  const { data, error } = await db
    .from(LOT_TABLE)
    .select(LOT_COLUMNS)
    .order("created_at");
  if (error) fail(LOT_TABLE, error.message);
  return (data ?? []) as unknown as TenderDetail[];
}

export async function getLot(id: string): Promise<TenderDetail | undefined> {
  const { data, error } = await db
    .from(LOT_TABLE)
    .select(LOT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail(LOT_TABLE, error.message);
  return (data as unknown as TenderDetail) ?? undefined;
}

export function lotToSummary(lot: TenderDetail): TenderSummary {
  return {
    id: lot.id,
    title: lot.title,
    buyer_name: lot.buyer_name,
    place_city: lot.place_city,
    place_nuts: lot.place_nuts,
    cpv_main: lot.cpv_main,
    estimated_value_eur: lot.estimated_value_eur,
    submission_deadline: lot.submission_deadline,
    published: lot.published,
    notice_url: lot.notice_url,
    lot_count: lot.lot_count,
    docs_retrieved: lot.docs_retrieved,
    source: lot.source,
  };
}
