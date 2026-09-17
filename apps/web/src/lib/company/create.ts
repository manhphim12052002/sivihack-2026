import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import { llmClient, PROFILE_SYSTEM_PROMPT } from "@/lib/llm";
import type { CompanyProfile } from "@/lib/api";
import type { NormalizedProfile } from "@/lib/company/types";

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
    capacity_per_week: (row.capacity_per_week as number) ?? 3,
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

/** Normalize free text into a typed profile via LLM, then upsert those fields. */
export async function normalizeAndUpdate(
  companyId: string,
  rawText: string,
): Promise<CompanyProfile> {
  if (llmClient) {
    try {
      const json = await llmClient.extract(PROFILE_SYSTEM_PROMPT, rawText);
      if (json) {
        const parsed = JSON.parse(json) as Partial<NormalizedProfile>;
        const update: Record<string, unknown> = { raw_text: rawText, updated_at: new Date().toISOString() };
        if (parsed.name) update.name = parsed.name;
        if (parsed.home_base) update.home_base = parsed.home_base;
        if (parsed.headquarters) update.headquarters = parsed.headquarters;
        if (parsed.regions) update.regions = parsed.regions;
        if (parsed.radius_km != null) update.radius_km = parsed.radius_km;
        if (parsed.trades) update.trades = parsed.trades;
        if (parsed.cpv_prefixes) update.cpv_prefixes = parsed.cpv_prefixes;
        if (parsed.contract_min_eur != null) update.contract_min_eur = parsed.contract_min_eur;
        if (parsed.contract_max_eur != null) update.contract_max_eur = parsed.contract_max_eur;
        if (parsed.guarantee_capacity_eur != null) update.guarantee_capacity_eur = parsed.guarantee_capacity_eur;
        if (parsed.self_perform_share_pct != null) update.self_perform_share_pct = parsed.self_perform_share_pct;
        if (parsed.earliest_start) update.earliest_start = parsed.earliest_start;
        if (parsed.capacity_per_week) update.capacity_per_week = parsed.capacity_per_week;
        if (parsed.references_held) update.references_held = parsed.references_held;
        if (parsed.hard_exclusions) update.hard_exclusions = parsed.hard_exclusions;

        const { data, error } = await supabase
          .from("companies")
          .update(update)
          .eq("id", companyId)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return rowToProfile(data as Record<string, unknown>);
      }
    } catch {
      // LLM failed — return current profile without normalization
    }
  }

  // Fallback: just store raw text
  const { data, error } = await supabase
    .from("companies")
    .update({ raw_text: rawText, updated_at: new Date().toISOString() })
    .eq("id", companyId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data as Record<string, unknown>);
}
