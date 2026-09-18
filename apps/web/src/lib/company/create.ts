import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";

import type { CompanyProfile } from "@/lib/api";

/** Map a DB row to the API CompanyProfile shape. */
export function rowToProfile(row: Record<string, unknown>): CompanyProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    home_base: (row.home_base as string) ?? "",
    regions: (row.regions as string[]) ?? [],
    radius_km: row.radius_km as number | null,
    trades: (row.trades as string[]) ?? [],
    cpv_prefixes: (row.cpv_prefixes as string[]) ?? [],
    contract_min_eur: row.contract_min_eur as number | null,
    contract_max_eur: row.contract_max_eur as number | null,
    partner_threshold_eur: row.partner_threshold_eur as number | null,
    guarantee_capacity_eur: row.guarantee_capacity_eur as number | null,
    self_perform_share_pct: row.self_perform_share_pct as number | null,
    earliest_start: row.earliest_start as string | null,
    capacity_per_week: (row.capacity_per_week as number) ?? null,
    references_held: (row.references_held as string[]) ?? [],
    hard_exclusions: (row.hard_exclusions as string[]) ?? [],
    raw_text: (row.raw_text as string) ?? "",
  };
}

/** Create a minimal company shell from basic info. */
export async function createCompany(input: {
  name: string;
  headquarters?: string;
  raw_text?: string;
}): Promise<CompanyProfile> {
  const id = genId("COMP");
  const { data, error } = await supabase
    .from("companies")
    .insert({
      id,
      name: input.name,
      headquarters: input.headquarters ?? "",
      home_base: input.headquarters ?? "",
      raw_text: input.raw_text ?? "",
      status: "ONBOARDING",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToProfile(data as Record<string, unknown>);
}

/** Legacy entry point now delegates to the same source/chunk pipeline as file uploads. */
export async function normalizeAndUpdate(
  companyId: string,
  rawText: string,
): Promise<CompanyProfile> {
  const { ingestSource } = await import("./ingest-source");
  const { extractCompanyIntelligence } = await import("./extract");
  const { assembleCanonicalCompany } = await import("./assemble");
  const { toCompanyProfile } = await import("./model");
  await ingestSource(
    companyId,
    "company-description.txt",
    Buffer.from(rawText),
  );
  await extractCompanyIntelligence(companyId);
  return toCompanyProfile(await assembleCanonicalCompany(companyId));
}
