import { db } from "@/lib/db";
import { computeFreshness } from "./normalize";
import { emptyCompany, gapsFor, importLegacy, mergeRows } from "./model";
import { rowToProfile } from "./create";
import { CompanyError } from "./errors";
import type {
  CanonicalCompany,
  CapabilityRow,
  QualificationRow,
  ReferenceRow,
  SourceRow,
  ChunkRow,
  OperationalItem,
  PolicyItem,
} from "./types";

/** Read-only assembly. Normalized tables are the sole authority after legacy import. */
export async function assembleCanonicalCompany(
  companyId: string,
): Promise<CanonicalCompany> {
  const { data: row, error } = await db
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();
  if (error || !row)
    throw new CompanyError(
      "COMPANY_NOT_FOUND",
      error?.message ?? "Company not found",
      404,
    );
  const tables = [
    "company_capabilities",
    "company_references",
    "company_qualifications",
    "company_resources",
    "company_capacity",
    "company_constraints",
    "company_preferences",
  ];
  const responses = await Promise.all(
    tables.map((t) => db.from(t).select("*").eq("company_id", companyId)),
  );
  for (const r of responses)
    if (r.error) throw new CompanyError("DATABASE_ERROR", r.error.message, 500);
  const [caps, refs, quals, resources, capacity, constraints, preferences] =
    responses.map((r) => r.data ?? []);
  const sourcesRes = await db
    .from("sources")
    .select("*")
    .eq("entity_id", companyId)
    .eq("entity_type", "company");
  if (sourcesRes.error)
    throw new CompanyError("DATABASE_ERROR", sourcesRes.error.message, 500);
  const c =
    row.intelligence_version === 2
      ? emptyCompany(companyId, row.name)
      : importLegacy(rowToProfile(row));
  c.identity = {
    name: row.name,
    headquarters: row.headquarters || row.home_base || "",
    employees: row.employees ?? null,
    revenue_eur: row.revenue_eur ?? null,
    website: row.website ?? null,
  };
  c.geography = row.geography ?? c.geography;
  c.commercial_profile = row.commercial_profile ?? c.commercial_profile;
  c.regions = c.geography?.regions ?? [];
  c.radius_km = c.geography?.radius_km ?? null;
  c.capabilities =
    row.intelligence_version === 2
      ? (caps as CanonicalCompany["capabilities"])
      : mergeRows(
          c.capabilities,
          caps as CanonicalCompany["capabilities"],
          (r) => (r.type === "OTHER" ? r.label : r.type),
        );
  c.references =
    refs.length || row.intelligence_version === 2
      ? ((refs as (ReferenceRow & { value_eur?: number | null })[]).map(
          (r) => ({
            ...r,
            contract_value_eur: r.value_eur ?? r.contract_value_eur ?? null,
          }),
        ) as CanonicalCompany["references"])
      : c.references;
  c.qualifications = (quals as QualificationRow[]).map((q) => ({
    ...q,
    freshness: computeFreshness(q.valid_until),
  }));
  c.resources = resources as OperationalItem[];
  c.capacity = capacity as OperationalItem[];
  c.constraints =
    constraints.length || row.intelligence_version === 2
      ? (constraints as PolicyItem[])
      : c.constraints;
  c.preferences = preferences as PolicyItem[];
  c.sources = (sourcesRes.data as SourceRow[]) ?? [];
  if (c.sources.length) {
    const res = await db
      .from<ChunkRow>("chunks")
      .select("*")
      .in(
        "source_id",
        c.sources.map((s) => s.id),
      );
    if (res.error)
      throw new CompanyError("DATABASE_ERROR", res.error.message, 500);
    c.chunks = res.data ?? [];
  }
  c.raw_text = row.raw_text ?? "";
  c.cpv_prefixes = row.cpv_prefixes ?? [];
  c.field_evidence = row.field_evidence ?? {};
  c.revision = row.revision ?? 0;
  c.knowledge_gaps = gapsFor(c);
  return c;
}
