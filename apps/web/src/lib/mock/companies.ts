/**
 * Mock company profiles — the three example companies from Track-2.md Appendix A.
 * Used as seed data / demo fallback when the data backend has no rows yet.
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
    earliest_start: null,
    capacity_per_week: null,
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
    capacity_per_week: null,
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
  {
    // Fourth profile, written in the Appendix A form the brief allows ("extend them, or write
    // your own"): the obvious yes for a single-trade aluminium-door lot in Westfalen.
    id: "COMP-metallbau-westfalen",
    name: "Metallbau Westfalen GmbH",
    home_base: "Lippstadt, North Rhine-Westphalia",
    regions: ["North Rhine-Westphalia", "Westfalen", "Ruhr"],
    radius_km: 120,
    trades: [
      "aluminium windows and doors",
      "aluminium facades",
      "fire protection doors T30",
      "smoke protection doors RS",
      "automatic door drives",
      "metal construction",
    ],
    cpv_prefixes: ["45421", "45441", "44221", "45420"],
    contract_min_eur: 50000,
    contract_max_eur: 1500000,
    partner_threshold_eur: null,
    guarantee_capacity_eur: 600000,
    self_perform_share_pct: 85,
    earliest_start: "2027-01-01",
    capacity_per_week: null,
    references_held: [
      "Aluminium fire doors T30/RS, fire station Warstein (2024, €140k)",
      "Exterior aluminium doors and F30 glazing, school campus Soest (2025, €310k)",
      "Entrance doors with automatic drives, town hall Lippstadt (2023, €95k)",
    ],
    hard_exclusions: [
      "steel structures",
      "facades above 20 m",
      "outside Germany",
    ],
    raw_text:
      "Metallbau Westfalen GmbH, Lippstadt, North Rhine-Westphalia. ~€12M revenue, 65 employees, founded 1978. " +
      "Does: aluminium windows, doors and facades; fire- and smoke-protection doors (T30, RS) as system partner of an approved manufacturer; automatic door drives; own workshop, powder coating through a GSB-certified partner. " +
      "Where: North Rhine-Westphalia, mainly Westfalen and the Ruhr, up to ~120 km from Lippstadt. " +
      "Contract size: €50k–€1.5M. " +
      "Can show: aluminium fire doors for the Warstein fire station (2024, €140k); exterior doors and F30 glazing for a school campus in Soest (2025, €310k); entrance doors with automatic drives for Lippstadt town hall (2023, €95k). " +
      "Cannot show: steel structures, facades above 20 m, anything outside Germany. " +
      "Qualifications: Handwerksrolle Metallbau; two staff certified for hold-open systems (Feststellanlagen); system-partner certificate for T30 aluminium fire doors; ISO 9001 at the system manufacturer; powder coating through a partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität); cooperates with the client-appointed SiGeKo per Baustellenverordnung on every site. " +
      "Financial limit: guarantees up to about €600k. " +
      "Free from: January 2027. " +
      "In their words: Doors and glass in public buildings are our bread and butter. We bid directly when the package is one trade and the fire-protection paperwork is clear.",
  },
  {
    // Passes the hard gate, fails in layer 2: the documents demand approved fire-door systems
    // and the profile says the company has none.
    id: "COMP-alu-sauerland",
    name: "Alu-Fenster Sauerland GmbH",
    home_base: "Arnsberg, North Rhine-Westphalia",
    regions: ["North Rhine-Westphalia", "Sauerland", "Westfalen"],
    radius_km: 100,
    trades: ["aluminium windows", "aluminium exterior doors", "conservatories", "metal construction"],
    cpv_prefixes: ["45421", "45441", "44221"],
    contract_min_eur: 30000,
    contract_max_eur: 800000,
    partner_threshold_eur: null,
    guarantee_capacity_eur: 250000,
    self_perform_share_pct: 90,
    earliest_start: "2027-02-01",
    capacity_per_week: null,
    references_held: [
      "Aluminium windows and entrance doors, primary school Meschede (2025, €210k)",
      "Aluminium exterior doors, sports hall Arnsberg (2024, €75k)",
      "Conservatory and terrace doors, care home Sundern (2023, €120k)",
    ],
    hard_exclusions: ["steel structures", "outside Germany"],
    raw_text:
      "Alu-Fenster Sauerland GmbH, Arnsberg, North Rhine-Westphalia. ~€6M revenue, 32 employees, founded 1995. " +
      "Does: aluminium windows and exterior doors, conservatories, small metal construction. Own workshop. " +
      "Where: North Rhine-Westphalia, mainly Sauerland and Westfalen, up to ~100 km from Arnsberg. " +
      "Contract size: €30k–€800k. " +
      "Can show: windows and entrance doors for a primary school in Meschede (2025, €210k); exterior doors for a sports hall in Arnsberg (2024, €75k); conservatory and terrace doors for a care home in Sundern (2023, €120k). " +
      "Cannot show: fire- or smoke-protection doors — no system partnership with an approved fire-door manufacturer and no certified hold-open-system staff; no steel structures; nothing outside Germany. " +
      "Financial limit: guarantees up to about €250k. " +
      "Free from: February 2027. " +
      "In their words: Windows and doors we do well. Fire protection we have always left to the specialists.",
  },
  {
    // Passes the hard gate; the reference check stays open: one comparable job in three years, two required.
    id: "COMP-tueren-rheinland",
    name: "Türen & Tore Rheinland GmbH",
    home_base: "Köln, North Rhine-Westphalia",
    regions: ["North Rhine-Westphalia", "Rheinland", "Ruhr"],
    radius_km: 200,
    trades: ["fire protection doors", "smoke protection doors", "industrial doors and gates", "automatic door drives", "metal construction"],
    cpv_prefixes: ["45421", "44221", "45420"],
    contract_min_eur: 40000,
    contract_max_eur: 1200000,
    partner_threshold_eur: null,
    guarantee_capacity_eur: 500000,
    self_perform_share_pct: 80,
    earliest_start: "2027-01-01",
    capacity_per_week: null,
    references_held: [
      "Aluminium fire doors T30 and hold-open systems, logistics hall Köln-Niehl (2025, €180k)",
      "Steel fire doors and sectional gates, depot Leverkusen (2021, €260k)",
      "Smoke protection doors, office building Düsseldorf (2020, €95k)",
    ],
    hard_exclusions: ["facades", "outside Germany"],
    raw_text:
      "Türen & Tore Rheinland GmbH, Köln, North Rhine-Westphalia. ~€15M revenue, 70 employees, founded 1982. " +
      "Does: fire- and smoke-protection doors in steel and aluminium as system partner of an approved manufacturer, industrial doors and gates, automatic door drives; two staff certified for hold-open systems (Feststellanlagen); ISO 9001; powder coating through a partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität); cooperates with the client-appointed SiGeKo per Baustellenverordnung on every site. " +
      "Where: North Rhine-Westphalia, mainly Rheinland and the Ruhr, up to ~200 km from Köln. " +
      "Contract size: €40k–€1.2M. " +
      "Can show: aluminium fire doors T30 with hold-open systems for a logistics hall in Köln-Niehl (2025, €180k); steel fire doors and sectional gates for a depot in Leverkusen (2021, €260k); smoke protection doors for an office building in Düsseldorf (2020, €95k). " +
      "Cannot show: facades, anything outside Germany. " +
      "Financial limit: guarantees up to about €500k. " +
      "Free from: January 2027. " +
      "In their words: Fire doors are our core. Public clients ask for recent references, and most of ours are a few years old now.",
  },
  {
    // Passes trade, region and timing; the lot is above the contract ceiling but below the
    // partner threshold, so the value check asks for a partner instead of failing.
    id: "COMP-hellweg",
    name: "Schlosserei Hellweg e.K.",
    home_base: "Soest, North Rhine-Westphalia",
    regions: ["North Rhine-Westphalia", "Westfalen", "Kreis Soest"],
    radius_km: 60,
    trades: ["metal construction", "aluminium doors", "fire protection doors", "railings and stairs"],
    cpv_prefixes: ["45421", "44221", "45262"],
    contract_min_eur: 10000,
    contract_max_eur: 80000,
    partner_threshold_eur: 60000,
    guarantee_capacity_eur: 60000,
    self_perform_share_pct: 95,
    earliest_start: "2026-11-01",
    capacity_per_week: null,
    references_held: [
      "Aluminium entrance and fire doors, kindergarten Soest (2025, €48k)",
      "Fire doors T30, community hall Bad Sassendorf (2024, €35k)",
      "Railings and doors, town hall annex Werl (2023, €62k)",
    ],
    hard_exclusions: ["facades", "outside Germany"],
    raw_text:
      "Schlosserei Hellweg e.K., Soest, North Rhine-Westphalia. ~€1.8M revenue, 9 employees, founded 2004. " +
      "Does: metal construction, aluminium doors, fire-protection doors as system partner of an approved manufacturer, railings and stairs; powder coating through a partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität); cooperates with the client-appointed SiGeKo per Baustellenverordnung on every site. " +
      "Where: Kreis Soest and neighbouring districts, up to ~60 km. " +
      "Contract size: €10k–€80k. Above about €60k they team up with a larger partner. " +
      "Can show: aluminium entrance and fire doors for a kindergarten in Soest (2025, €48k); T30 fire doors for a community hall in Bad Sassendorf (2024, €35k); railings and doors for the town hall annex in Werl (2023, €62k). " +
      "Cannot show: facades, anything outside Germany. " +
      "Financial limit: guarantees up to about €60k. " +
      "Free from: November 2026. " +
      "In their words: We are small and quick. A €90k door package is at the edge of what we carry alone.",
  },
];

export function findCompany(id: string): CompanyProfile | undefined {
  return MOCK_COMPANIES.find((c) => c.id === id);
}
