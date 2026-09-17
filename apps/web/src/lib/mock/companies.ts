/**
 * Mock company profiles — the three example companies from Track-2.md Appendix A.
 * Used as seed data / demo fallback when Supabase has no rows yet.
 *
 * Field mapping:
 *   trades        → plain-English trade categories (matches screening engine vocab)
 *   cpv_prefixes  → 5-digit CPV code prefixes (45 = construction)
 *   hard_exclusions → strings the screening engine treats as automatic disqualifiers
 */
import type { CompanyProfile } from "@/lib/api";

export const MOCK_COMPANIES: CompanyProfile[] = [
  {
    id: "COMP-brenner",
    name: "Brenner & Sohn Tiefbau GmbH",
    home_base: "Augsburg, Bavaria",
    regions: ["Bavaria", "Schwaben", "Oberbayern"],
    radius_km: 150,
    trades: ["road construction", "sewer renewal", "pipeline construction", "earthworks", "municipal civil engineering"],
    cpv_prefixes: ["45233", "45232", "45111", "45112"],
    contract_min_eur: 400000,
    contract_max_eur: 4000000,
    partner_threshold_eur: 5000000,
    guarantee_capacity_eur: 1500000,
    self_perform_share_pct: 80,
    earliest_start: "2026-03-01",
    capacity_per_week: 3,
    references_held: [
      "€2.9M state road rehabilitation (Augsburg)",
      "District sewer renewal (Landkreis Augsburg)",
      "Housing-estate site development (Schwaben)",
      "Municipal earthworks package (Oberbayern)",
    ],
    hard_exclusions: [
      "rail-adjacent work",
      "rail-side construction",
      "DB qualification required",
      "bridge construction",
      "outside Germany",
      "Brücke",
    ],
    raw_text:
      "Brenner & Sohn Tiefbau GmbH, Augsburg, Bavaria. ~€31M revenue, 140 employees, family-owned since 1962. " +
      "Does: road construction, sewers and pipelines, earthworks, municipal civil engineering. Own machinery. " +
      "Where: Bavaria, mainly Schwaben and Oberbayern, up to ~150 km from Augsburg — crews go home at night. " +
      "Contract size: €400k–€4M. Below that the overhead isn't worth it; above €5M they'd need a partner. " +
      "References: a €2.9M state road rehabilitation, a district sewer renewal, several housing-estate site developments. " +
      "Cannot show: anything rail-side (no DB qualification, no certified safety staff), no bridges, nothing outside Germany. " +
      "Financial limit: their bank supports guarantees up to about €1.5M in total at any one time. " +
      "Free from: March — two crews are committed until then.",
  },
  {
    id: "COMP-vogtland",
    name: "Elektro Vogtland GmbH",
    home_base: "Plauen, Saxony",
    regions: ["Saxony", "Thuringia", "eastern Bavaria"],
    radius_km: 200,
    trades: [
      "electrical installation",
      "power installation",
      "lighting systems",
      "fire alarm systems",
      "building automation",
    ],
    cpv_prefixes: ["45310", "45311", "45312", "45315", "45316"],
    contract_min_eur: 80000,
    contract_max_eur: 900000,
    partner_threshold_eur: null,
    guarantee_capacity_eur: 300000,
    self_perform_share_pct: 70,
    earliest_start: null,
    capacity_per_week: 2,
    references_held: [
      "School refurbishment electrical works (Saxony)",
      "Hospital ward block electrical installation (Thuringia)",
      "Office fit-out electrical and automation (Saxony)",
      "Two care-home electrical installations (Saxony / eastern Bavaria)",
    ],
    hard_exclusions: [
      "high voltage",
      "explosion-protected installation",
      "ATEX",
      "main contractor on multi-trade",
      "Generalunternehmer",
      "road construction",
      "civil engineering",
    ],
    raw_text:
      "Elektro Vogtland GmbH, Plauen, Saxony. ~€8M revenue, 45 employees, founded 1991. " +
      "Does: electrical installation for buildings — power, lighting, fire alarm systems, building automation. " +
      "Usually as a subcontractor to a general contractor. " +
      "Where: Saxony, Thuringia, eastern Bavaria, up to ~200 km. " +
      "Contract size: €80k–€900k. " +
      "References: school refurbishments, a hospital ward block, office fit-outs, two care homes. " +
      "Cannot show: high voltage, explosion-protected installations, or acting as main contractor on a multi-trade job. " +
      "Financial limit: guarantees up to about €300k.",
  },
  {
    id: "COMP-hanseatische",
    name: "Hanseatische Bau AG",
    home_base: "Hamburg",
    regions: ["Hamburg", "Schleswig-Holstein", "Lower Saxony", "Mecklenburg-Vorpommern", "Bremen"],
    radius_km: 300,
    trades: [
      "building construction",
      "turnkey projects",
      "school construction",
      "hospital construction",
      "housing construction",
      "logistics buildings",
      "general contractor",
    ],
    cpv_prefixes: ["45210", "45211", "45212", "45213", "45214", "45215", "45216"],
    contract_min_eur: 8000000,
    contract_max_eur: 90000000,
    partner_threshold_eur: null,
    guarantee_capacity_eur: null,
    self_perform_share_pct: 20,
    earliest_start: null,
    capacity_per_week: 3,
    references_held: [
      "University building new-build (Hamburg, ~€38M)",
      "Two school campuses turnkey (northern Germany, €12M and €18M)",
      "Hospital extension as GC (Schleswig-Holstein, €21M)",
      "Large residential quarter, 250 units (Hamburg, €45M)",
    ],
    hard_exclusions: [
      "road construction as lead contractor",
      "sewer construction as lead contractor",
      "bridge construction as lead contractor",
      "southern Germany",
      "Bavaria",
      "Baden-Württemberg",
      "high self-performance share required",
    ],
    raw_text:
      "Hanseatische Bau AG, Hamburg. ~€310M revenue, 620 employees, founded 1954. " +
      "Does: building construction and turnkey projects — offices, schools, hospitals, housing, logistics. They coordinate; the trades are subcontracted. " +
      "Where: northern Germany. " +
      "Contract size: €8M–€90M. Below €5M the overhead is disproportionate. " +
      "References: a university building, two school campuses, a hospital extension, large residential quarters. " +
      "Cannot show: civil engineering as lead contractor (no roads, sewers or bridges), nothing in southern Germany in a decade. " +
      "Constraint: not money — bidding capacity. The estimating department can seriously pursue about three tenders a week.",
  },
];

export function findCompany(id: string): CompanyProfile | undefined {
  return MOCK_COMPANIES.find((c) => c.id === id);
}
