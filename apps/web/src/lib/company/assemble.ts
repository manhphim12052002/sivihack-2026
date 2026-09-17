import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import { computeFreshness } from "@/lib/company/normalize";
import type {
  CanonicalCompany,
  CapabilityRow,
  ReferenceRow,
  QualificationRow,
  KnowledgeGapRow,
  SourceRow,
  Freshness,
} from "@/lib/company/types";

/** Assemble and persist the CanonicalCompany from all DB rows for a given company. */
export async function assembleCanonicalCompany(companyId: string): Promise<CanonicalCompany> {
  // Fetch company row
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();
  if (companyErr || !company) throw new Error(`Company ${companyId} not found`);

  // Fetch related rows in parallel
  const [capsRes, refsRes, qualsRes, sourcesRes] = await Promise.all([
    supabase.from("company_capabilities").select("*").eq("company_id", companyId),
    supabase.from("company_references").select("*").eq("company_id", companyId),
    supabase.from("company_qualifications").select("*").eq("company_id", companyId),
    supabase.from("sources").select("*").eq("entity_id", companyId).eq("entity_type", "company"),
  ]);

  const capabilities = (capsRes.data ?? []) as CapabilityRow[];
  const references = (refsRes.data ?? []) as ReferenceRow[];
  const today = new Date();
  const qualifications = ((qualsRes.data ?? []) as QualificationRow[]).map((q) => ({
    ...q,
    freshness: computeFreshness(q.valid_until, today) as Freshness,
  }));
  const sources = (sourcesRes.data ?? []) as SourceRow[];

  // Detect knowledge gaps
  const gaps = await detectAndPersistGaps(companyId, capabilities, qualifications);

  const c = company as Record<string, unknown>;
  return {
    company_id: companyId,
    identity: {
      name: c.name as string,
      headquarters: (c.headquarters as string) ?? "",
      employees: c.employees as number | null,
      revenue_eur: c.revenue_eur as number | null,
      website: c.website as string | null,
    },
    capabilities: capabilities as Array<CapabilityRow & { status: "PENDING" | "CONFIRMED" | "REJECTED" }>,
    references: references as Array<ReferenceRow & { status: "PENDING" | "CONFIRMED" | "REJECTED" }>,
    qualifications,
    commercial_profile: {
      contract_min_eur: c.contract_min_eur as number | null,
      contract_max_eur: c.contract_max_eur as number | null,
      guarantee_capacity_eur: c.guarantee_capacity_eur as number | null,
      self_perform_share_pct: c.self_perform_share_pct as number | null,
    },
    regions: (c.regions as string[]) ?? [],
    radius_km: c.radius_km as number | null,
    sources,
    knowledge_gaps: gaps,
  };
}

// ─── Gap detection ────────────────────────────────────────────────────────────

const EXPECTED_CAPABILITY_TYPES = ["ROAD_CONSTRUCTION", "CIVIL_ENGINEERING", "EARTHWORKS"];
const EXPECTED_QUALIFICATION_TYPES = ["PQ_VOB"];

async function detectAndPersistGaps(
  companyId: string,
  capabilities: CapabilityRow[],
  qualifications: QualificationRow[],
): Promise<KnowledgeGapRow[]> {
  // Clear old gaps for this company before re-detecting
  await supabase.from("company_knowledge_gaps").delete().eq("company_id", companyId);

  const gaps: KnowledgeGapRow[] = [];

  // Gap: no confirmed capabilities at all
  const confirmedCaps = capabilities.filter((c) => c.status === "CONFIRMED");
  if (confirmedCaps.length === 0) {
    gaps.push(await insertGap(companyId, "CAPABILITIES", "UNKNOWN", "No confirmed capabilities on file"));
  }

  // Gap: missing expected qualifications
  for (const qType of EXPECTED_QUALIFICATION_TYPES) {
    const confirmed = qualifications.find((q) => q.type === qType && q.status === "CONFIRMED");
    if (!confirmed) {
      const pending = qualifications.find((q) => q.type === qType);
      const state = pending ? "UNKNOWN" : "UNKNOWN";
      gaps.push(
        await insertGap(
          companyId,
          qType,
          state,
          pending
            ? `${qType} found in documents but not yet confirmed`
            : `No evidence for ${qType} found`,
        ),
      );
    }
  }

  // Gap: missing capability types with no evidence
  for (const capType of EXPECTED_CAPABILITY_TYPES) {
    const any = capabilities.find((c) => c.type === capType);
    if (!any && confirmedCaps.length === 0) {
      gaps.push(
        await insertGap(companyId, `CAPABILITY_${capType}`, "UNKNOWN", `No evidence for ${capType}`),
      );
    }
  }

  return gaps;
}

async function insertGap(
  companyId: string,
  type: string,
  state: string,
  reason: string,
): Promise<KnowledgeGapRow> {
  const row = {
    id: genId("GAP"),
    company_id: companyId,
    type,
    state,
    reason,
  };
  await supabase.from("company_knowledge_gaps").insert(row);
  return row as KnowledgeGapRow;
}
