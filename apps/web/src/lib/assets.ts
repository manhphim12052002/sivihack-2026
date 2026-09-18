/**
 * File-backed asset store replacing Supabase for the demo.
 *
 * assets/companies.json — the 3 pre-built company profiles (CompanyProfile[])
 * assets/lots.json      — the 12 pre-built lots (TenderDetail[])
 *
 * New companies created at runtime (POST /api/companies) are held in a
 * module-level Map so they survive within the server process lifetime.
 */
import type { CompanyProfile, TenderDetail, TenderSummary } from "@/lib/api";
import companiesJson from "@/assets/companies.json";
import lotsJson from "@/assets/lots.json";

// ── Companies ──────────────────────────────────────────────────────────────────

const store = new Map<string, CompanyProfile>(
  (companiesJson as CompanyProfile[]).map((c) => [c.id, c]),
);

export function listCompanies(): CompanyProfile[] {
  return [...store.values()];
}

export function getCompany(id: string): CompanyProfile | undefined {
  return store.get(id);
}

export function upsertCompany(company: CompanyProfile): void {
  store.set(company.id, company);
}

export function deleteCompany(id: string): boolean {
  return store.delete(id);
}

// ── Lots ───────────────────────────────────────────────────────────────────────

const LOTS = lotsJson as TenderDetail[];

export function listLots(): TenderDetail[] {
  return LOTS;
}

export function getLot(id: string): TenderDetail | undefined {
  return LOTS.find((l) => l.id === id);
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
