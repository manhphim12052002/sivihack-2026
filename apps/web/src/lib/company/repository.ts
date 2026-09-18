import { supabase } from "@/lib/supabase";
import type { CanonicalCompany } from "./types";
import { gapsFor } from "./model";
import { CompanyError } from "./errors";

export async function saveCanonicalCompany(
  c: CanonicalCompany,
): Promise<CanonicalCompany> {
  c.geography = {
    headquarters: c.identity.headquarters,
    regions: c.geography?.regions ?? c.regions,
    radius_km: c.geography?.radius_km ?? c.radius_km,
    countries: c.geography?.countries ?? [],
  };
  c.regions = c.geography.regions;
  c.radius_km = c.geography.radius_km;
  c.knowledge_gaps = gapsFor(c);
  const { data, error } = await supabase.rpc("save_company_intelligence", {
    payload: c,
    expected_revision: c.revision ?? 0,
  });
  if (error)
    throw new CompanyError(
      error.message.includes("PROFILE_CONFLICT")
        ? "PROFILE_CONFLICT"
        : "DATABASE_ERROR",
      error.message,
      error.message.includes("PROFILE_CONFLICT") ? 409 : 500,
    );
  return { ...c, revision: data as number };
}
