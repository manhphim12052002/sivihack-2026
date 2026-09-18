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
    c.identity.employees = [140, 45, 620, 65, 32, 70, 9][idx];
    c.identity.revenue_eur = [31000000, 8000000, 310000000, 12000000, 6000000, 15000000, 1800000][idx];
    c.identity.headquarters = ["Augsburg", "Plauen", "Hamburg", "Lippstadt", "Arnsberg", "Köln", "Soest"][idx];
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
      [
        "Aluminium fire doors T30/RS, fire station Warstein",
        "Exterior aluminium doors and F30 glazing, school campus Soest",
        "Entrance doors with automatic drives, town hall Lippstadt",
      ],
      [
        "Aluminium windows and entrance doors, primary school Meschede",
        "Aluminium exterior doors, sports hall Arnsberg",
        "Conservatory and terrace doors, care home Sundern",
      ],
      [
        "Aluminium fire doors T30 and hold-open systems, logistics hall Köln-Niehl",
        "Steel fire doors and sectional gates, depot Leverkusen",
        "Smoke protection doors, office building Düsseldorf",
      ],
      [
        "Aluminium entrance and fire doors, kindergarten Soest",
        "Fire doors T30, community hall Bad Sassendorf",
        "Railings and doors, town hall annex Werl",
      ],
    ][idx];
    // Reference facts stated in the fourth profile's own text (year, value, kind of work).
    const stated: Record<number, Array<{ completed_at: string; value: number; types: string[] }>> = {
      3: [
        { completed_at: "2024-09-30", value: 140000, types: ["FIRE_PROTECTION_DOORS", "ALUMINIUM_DOORS"] },
        { completed_at: "2025-06-30", value: 310000, types: ["ALUMINIUM_DOORS", "FIRE_PROTECTION_GLAZING"] },
        { completed_at: "2023-11-30", value: 95000, types: ["ALUMINIUM_DOORS", "AUTOMATIC_DOORS"] },
      ],
      4: [
        { completed_at: "2025-05-31", value: 210000, types: ["ALUMINIUM_WINDOWS", "ALUMINIUM_DOORS"] },
        { completed_at: "2024-08-31", value: 75000, types: ["ALUMINIUM_DOORS"] },
        { completed_at: "2023-10-31", value: 120000, types: ["CONSERVATORY", "ALUMINIUM_DOORS"] },
      ],
      5: [
        { completed_at: "2025-03-31", value: 180000, types: ["FIRE_PROTECTION_DOORS", "ALUMINIUM_DOORS", "HOLD_OPEN_SYSTEMS"] },
        { completed_at: "2021-06-30", value: 260000, types: ["FIRE_PROTECTION_DOORS", "STEEL_DOORS", "SECTIONAL_GATES"] },
        { completed_at: "2020-09-30", value: 95000, types: ["SMOKE_PROTECTION_DOORS"] },
      ],
      6: [
        { completed_at: "2025-07-31", value: 48000, types: ["ALUMINIUM_DOORS", "FIRE_PROTECTION_DOORS"] },
        { completed_at: "2024-04-30", value: 35000, types: ["FIRE_PROTECTION_DOORS"] },
        { completed_at: "2023-09-30", value: 62000, types: ["RAILINGS", "ALUMINIUM_DOORS"] },
      ],
    };
    // Qualifications each fourth-plus profile states, including what it says it does NOT have.
    const statedQualifications: Record<number, Array<{ label: string; type: string; knowledge_state: "KNOWN_PRESENT" | "KNOWN_ABSENT" }>> = {
      3: [
        { label: "System-partner certificate, T30 aluminium fire doors (approved manufacturer system)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Fachkraft für Feststellanlagen (hold-open systems), 2 staff", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Handwerksrolle Metallbau", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "ISO 9001 (system manufacturer)", type: "ISO_9001", knowledge_state: "KNOWN_PRESENT" },
        { label: "Powder coating via partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Cooperates with the client-appointed SiGeKo per Baustellenverordnung", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "General building authority approval (allgemeine bauaufsichtliche Zulassung) and system test certificate (Prüfzeugnis) for the T30 fire-door system, held via the manufacturer partnership, incl. tested system glasses/infills/fittings", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
      ],
      4: [
        { label: "Handwerksrolle Metallbau", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "System partnership with an approved fire-door manufacturer", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_ABSENT" },
        { label: "Fachkraft für Feststellanlagen (hold-open systems)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_ABSENT" },
      ],
      5: [
        { label: "System-partner certificate, fire doors steel and aluminium (approved manufacturer system)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Fachkraft für Feststellanlagen (hold-open systems), 2 staff", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "ISO 9001", type: "ISO_9001", knowledge_state: "KNOWN_PRESENT" },
        { label: "Handwerksrolle Metallbau", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "Powder coating via partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Cooperates with the client-appointed SiGeKo per Baustellenverordnung", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "General building authority approval (allgemeine bauaufsichtliche Zulassung) and system test certificate (Prüfzeugnis) for the T30 fire-door system, held via the manufacturer partnership, incl. tested system glasses/infills/fittings", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
      ],
      6: [
        { label: "System-partner certificate, T30 fire doors (approved manufacturer system)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Handwerksrolle Metallbau", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "Powder coating via partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität)", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
        { label: "Cooperates with the client-appointed SiGeKo per Baustellenverordnung", type: "OTHER", knowledge_state: "KNOWN_PRESENT" },
        { label: "General building authority approval (allgemeine bauaufsichtliche Zulassung) and system test certificate (Prüfzeugnis) for the T30 fire-door system, held via the manufacturer partnership, incl. tested system glasses/infills/fittings", type: "SPECIALIST_LICENSE", knowledge_state: "KNOWN_PRESENT" },
      ],
    };
    const statedAvailability: Record<number, { from: string; raw: string }> = {
      3: { from: "2027-01-01", raw: "January 2027" },
      4: { from: "2027-02-01", raw: "February 2027" },
      5: { from: "2027-01-01", raw: "January 2027" },
      6: { from: "2026-11-01", raw: "November 2026" },
    };
    c.references = names.map((name, i) => ({
      ...rowMeta(profile.id, "REF", ids, "CONFIRMED"),
      name,
      client: null,
      location: null,
      completed_at: stated[idx]?.[i]?.completed_at ?? null,
      contract_value_eur: idx === 0 && i === 0 ? 2900000 : stated[idx]?.[i]?.value ?? null,
      project_types: idx === 0 && i === 0 ? ["ROAD_REHABILITATION"] : stated[idx]?.[i]?.types ?? [],
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
    if (statedQualifications[idx]) {
      c.qualifications = statedQualifications[idx].map((q) => ({
        ...rowMeta(profile.id, "QUAL", ids, "CONFIRMED"),
        label: q.label,
        type: q.type,
        knowledge_state: q.knowledge_state,
        valid_from: null,
        valid_until: null,
        freshness: "CURRENT" as const,
      }));
      c.capacity = [
        {
          ...manualOperational(profile.id),
          origin: "DOCUMENT_EXTRACTED",
          evidence: ids,
          type: "CREW_AVAILABILITY",
          label: `Free from ${statedAvailability[idx].raw}`,
          value: null,
          unit: null,
          available_from: statedAvailability[idx].from,
          raw_value: statedAvailability[idx].raw,
          state: "EXPLICIT",
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
