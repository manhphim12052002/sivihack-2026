import { db } from "@/lib/db";
import { MOCK_COMPANIES } from "@/lib/mock/companies";
import { importLegacy, rowMeta, manualOperational, gapsFor } from "./model";
import { ingestSource } from "./ingest-source";
import { saveCanonicalCompany } from "./repository";
import { CompanyError } from "./errors";

let seeding: Promise<void> | undefined;
export async function ensureDemoCompanies() {
  if (seeding) return seeding;
  seeding = seed();
  try {
    await seeding;
  } finally {
    seeding = undefined;
  }
}
async function seed() {
  for (const profile of MOCK_COMPANIES) {
    const { data: existing, error } = await db
      .from("companies")
      .select("id")
      .eq("id", profile.id)
      .maybeSingle();
    if (error) throw new CompanyError("DATABASE_ERROR", error.message, 500);
    if (existing) continue;
    const created = await db
      .from("companies")
      .insert({ id: profile.id, name: profile.name, status: "ONBOARDING" });
    if (created.error) {
      if (created.error.code === "23505") continue;
      throw new CompanyError("DATABASE_ERROR", created.error.message, 500);
    }
    const source = await ingestSource(
      profile.id,
      "demo-company.txt",
      Buffer.from(profile.raw_text),
    );
    const ids = source.chunks.map((ch) => ch.id);
    const c = importLegacy(profile);
    c.sources = [source.source];
    c.chunks = source.chunks;
    const idx = MOCK_COMPANIES.indexOf(profile);
    c.identity.employees = [140, 45, 620][idx];
    c.identity.revenue_eur = [31000000, 8000000, 310000000][idx];
    c.identity.headquarters = ["Augsburg", "Plauen", "Hamburg"][idx];
    // Existing sample descriptions, not fabricated project dates or locations.
    const names = [
      [
        "State road rehabilitation",
        "District sewer renewal",
        "Housing-estate site developments",
      ],
      [
        "School refurbishments",
        "Hospital ward block",
        "Office fit-outs",
        "Two care homes",
      ],
      [
        "University building",
        "Two school campuses",
        "Hospital extension",
        "Large residential quarters",
      ],
    ][idx];
    c.references = names.map((name, i) => ({
      ...rowMeta(profile.id, "REF", ids, "CONFIRMED"),
      name,
      client: null,
      location: null,
      completed_at: null,
      contract_value_eur: idx === 0 && i === 0 ? 2900000 : null,
      project_types: idx === 0 && i === 0 ? ["ROAD_REHABILITATION"] : [],
      capabilities: idx === 0 && i === 0 ? ["ROAD_CONSTRUCTION"] : [],
    }));
    for (const r of [...c.capabilities, ...(c.constraints ?? [])]) {
      r.evidence = ids;
      r.origin = "DOCUMENT_EXTRACTED";
      r.status = "CONFIRMED";
    }
    c.commercial_profile.self_perform_share_pct = null; // Legacy fixture percentages are not stated in the descriptions.
    if (idx === 0) {
      c.qualifications = ["DB qualification", "Rail safety staff"].map(
        (label, i) => ({
          ...rowMeta(profile.id, "QUAL", ids, "CONFIRMED"),
          label,
          type: i === 0 ? "DB_PREQUALIFICATION" : "RAIL_SAFETY",
          knowledge_state: "KNOWN_ABSENT",
          valid_from: null,
          valid_until: null,
          freshness: "STALE",
        }),
      );
      c.resources = [
        {
          ...manualOperational(profile.id),
          origin: "DOCUMENT_EXTRACTED",
          evidence: ids,
          type: "MACHINERY",
          label: "Own machinery",
          unit: null,
        },
      ];
      c.capacity = [
        {
          ...manualOperational(profile.id),
          origin: "DOCUMENT_EXTRACTED",
          evidence: ids,
          type: "CREW_AVAILABILITY",
          label: "Two crews committed until March",
          value: null,
          unit: null,
          raw_value: "March",
          state: "AMBIGUOUS",
        },
      ];
    }
    if (idx === 2)
      c.capacity = [
        {
          ...manualOperational(profile.id),
          origin: "DOCUMENT_EXTRACTED",
          evidence: ids,
          type: "ESTIMATOR_CAPACITY",
          label: "Estimating department",
          value: 3,
          unit: "BIDS_PER_WEEK",
          raw_value: "about three tenders a week",
        },
      ];
    c.knowledge_gaps = gapsFor(c);
    await saveCanonicalCompany(c);
  }
}
