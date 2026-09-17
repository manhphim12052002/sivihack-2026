/**
 * Placeholder tender fixtures.
 *
 * There is no real ingestion pipeline yet (see plans/260917-1945-tender-ingestion-pipeline) —
 * `/api/tenders` and `/api/screen` are stubs pending it. These nine tenders stand in for a
 * week's oeffentlichevergabe.de batch, each with a full fact sheet (as if document extraction
 * had already run) so the triage board, decision breakdown, and evidence viewer have something
 * real to render. Replace this module with a real fetch from the pipeline's store once it
 * lands — every route handler that reads it (`src/app/api/tenders/**`) only imports from here.
 *
 * Deliberately NOT keyed to specific company ids: `src/lib/screening/engine.ts` compares any
 * CompanyProfile against these fact sheets, so an unseen company profile screens correctly too.
 */
import type { Evidence, Fact, TenderDetail, TenderSummary } from "@/lib/api";

function fact(value: unknown, evidence: Evidence[] = [], confidence: Fact["confidence"] = "high"): Fact {
  return { value, confidence, evidence };
}

function notFound(): Fact {
  return { value: null, confidence: "not_found", evidence: [] };
}

export const TENDERS: TenderDetail[] = [
  {
    id: "t1",
    title: "Fahrbahnsanierung A96 Anschlussstelle Augsburg-West",
    buyer_name: "Autobahn GmbH – Niederlassung Südbayern",
    place_city: "Augsburg",
    place_nuts: "DE27A",
    cpv_main: "45233142",
    estimated_value_eur: 1850000,
    submission_deadline: "2026-10-15",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t1",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Fahrbahnerneuerung inkl. Tragschichtsanierung auf einer Länge von 2,4 km.",
    lots: [{ id: "t1-l1", title: "Fahrbahnerneuerung", cpv: "45233142", value_eur: 1850000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("Road construction — carriageway resurfacing and base-layer renewal", [
        { doc: "Leistungsverzeichnis.pdf", page: 3, quote_de: "Fahrbahnerneuerung inkl. Tragschichtsanierung auf einer Länge von 2,4 km, Asphaltdeckschicht gemäß ZTV Asphalt-StB." },
      ]),
      place_of_performance: fact("Augsburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Anschlussstelle Augsburg-West." },
      ]),
      estimated_value: fact(1850000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert: ca. 1.850.000 €." },
      ]),
      lots: fact(1, []),
      references_required: fact("None stated beyond standard road-construction references", []),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-16", end: "2027-03-01" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn ist für den 16.11.2026 vorgesehen, Bauzeit bis 01.03.2027." },
      ]),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, [
        { doc: "Vergabeunterlagen_Teil_B.pdf", page: 5, quote_de: "Vertragserfüllungsbürgschaft 5%, Gewährleistungsbürgschaft 3% der Bruttoauftragssumme." },
      ]),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, [
        { doc: "Vertragsbedingungen.pdf", page: 9, quote_de: "Vertragsstrafe 0,1% der Netto-Auftragssumme pro Werktag Verzug, begrenzt auf 5%." },
      ]),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-15", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebote sind bis zum 15.10.2026 einzureichen." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("Single trade — no general-contractor coordination required", []),
    },
  },
  {
    id: "t2",
    title: "Kanalsanierung Augsburg-Nord",
    buyer_name: "Stadtwerke Augsburg Wasserwirtschaft",
    place_city: "Augsburg",
    place_nuts: "DE27A",
    cpv_main: "45232400",
    estimated_value_eur: 2400000,
    submission_deadline: "2026-10-08",
    published: "2026-09-08",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t2",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Kanalsanierung im Trenn- und Mischsystem, Tiefbauarbeiten.",
    lots: [{ id: "t2-l1", title: "Kanalsanierung", cpv: "45232400", value_eur: 2400000, trade: "sewer" }],
    fact_sheet: {
      trade_scope: fact("Sewer renewal (separate and combined systems), earthworks", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Kanalsanierung im Trenn- und Mischsystem, Tiefbauarbeiten." },
      ]),
      place_of_performance: fact("Augsburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Augsburg-Nord." },
      ]),
      estimated_value: fact(2400000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert: ca. 2.400.000 €." },
      ]),
      lots: fact(1, []),
      references_required: fact("Two comparable sewer-renewal projects", [
        { doc: "Eignungskriterien.pdf", page: 6, quote_de: "Der Bieter muss mindestens zwei vergleichbare Kanalbaumaßnahmen der letzten fünf Jahre nachweisen." },
      ]),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-02", end: "2027-04-30" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn 02.11.2026, Bauzeit bis 30.04.2027." },
      ]),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, [
        { doc: "Vergabeunterlagen_Teil_B.pdf", page: 5, quote_de: "Vertragserfüllungsbürgschaft in Höhe von 5% sowie eine Gewährleistungsbürgschaft in Höhe von 3% der Bruttoauftragssumme." },
      ]),
      penalty: fact({ pct_per_day: 0.15, cap_pct: 6 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-08", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single trade", []),
    },
  },
  {
    id: "t3",
    title: "Ausbau Kreisstraße Gessertshausen–Fischach",
    buyer_name: "Landkreis Augsburg – Tiefbauamt",
    place_city: "Gessertshausen",
    place_nuts: "DE27A",
    cpv_main: "45233120",
    estimated_value_eur: 680000,
    submission_deadline: "2026-10-22",
    published: "2026-09-11",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t3",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Ausbau Kreisstraße, Fahrbahnverbreiterung, Entwässerung.",
    lots: [{ id: "t3-l1", title: "Kreisstraßenausbau", cpv: "45233120", value_eur: 680000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("County-road widening and drainage works", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Ausbau Kreisstraße, Fahrbahnverbreiterung, Entwässerung." },
      ]),
      place_of_performance: fact("Gessertshausen", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Gessertshausen–Fischach." },
      ]),
      estimated_value: fact(680000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert: ca. 680.000 €." },
      ]),
      lots: fact(1, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-02", end: "2027-02-27" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn ist für den 02.11.2026 vorgesehen, Bauzeit 4 Monate bis Ende Februar 2027." },
      ]),
      guarantees: notFound(),
      penalty: notFound(),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-22", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single trade", []),
    },
  },
  {
    id: "t4",
    title: "Zufahrtsstraße Bahnhofsviertel — Straßenbauarbeiten",
    buyer_name: "Stadt Augsburg / DB Netz AG",
    place_city: "Augsburg",
    place_nuts: "DE27A",
    cpv_main: "45233120",
    estimated_value_eur: 3100000,
    submission_deadline: "2026-10-29",
    published: "2026-09-09",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t4",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Straßenbauarbeiten im gleisnahen Zufahrtsbereich Bahnhofsviertel.",
    lots: [{ id: "t4-l1", title: "Zufahrtsstraße", cpv: "45233120", value_eur: 3100000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("Road construction, rail-adjacent access area", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Straßenbauarbeiten im Zufahrtsbereich Bahnhofsviertel, gleisnaher Bereich gemäß DB-Regelwerk." },
      ]),
      place_of_performance: fact("Augsburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Augsburg, Zufahrtsbereich Bahnhofsviertel." },
      ]),
      estimated_value: fact(3100000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert: ca. 3.100.000 €." },
      ]),
      lots: fact(1, []),
      references_required: fact("3 comparable rail-adjacent (gleisnahe) construction projects within 5 years", [
        { doc: "Eignungskriterien.pdf", page: 17, quote_de: "Der Bieter muss mindestens drei vergleichbare Baumaßnahmen im bahnnahen Bereich innerhalb der vergangenen fünf Jahre nachweisen." },
      ]),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-12-01", end: "2027-05-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.2, cap_pct: 10 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-29", []),
      special_qualifications: fact("DB-Sicherheitsschulung für Arbeiten im gleisnahen Bereich (Zone 1)", [
        { doc: "Eignungskriterien.pdf", page: 18, quote_de: "Nachweis einer gültigen DB-Sicherheitsschulung für Arbeiten im gleisnahen Bereich ist zwingend erforderlich." },
      ]),
      contractor_role: fact("Single trade", []),
    },
  },
  {
    id: "t5",
    title: "Sanierung Brückenüberbau B17",
    buyer_name: "Wasserstraßen- und Schifffahrtsamt Donau-Lech",
    place_city: "Augsburg",
    place_nuts: "DE27A",
    cpv_main: "45221111",
    estimated_value_eur: 2900000,
    submission_deadline: "2026-11-05",
    published: "2026-09-08",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t5",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Sanierung des Überbaus inkl. Spannbetonarbeiten und Bauwerksabdichtung nach ZTV-ING.",
    lots: [{ id: "t5-l1", title: "Brückensanierung", cpv: "45221111", value_eur: 2900000, trade: "bridge" }],
    fact_sheet: {
      trade_scope: fact("Bridge structural rehabilitation — prestressed concrete, waterproofing", [
        { doc: "Leistungsbeschreibung.pdf", page: 2, quote_de: "Sanierung des Überbaus inkl. Spannbetonarbeiten und Bauwerksabdichtung nach ZTV-ING." },
      ]),
      place_of_performance: fact("Augsburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Augsburg." },
      ]),
      estimated_value: fact(2900000, []),
      lots: fact(1, []),
      references_required: fact("2 comparable bridge-structure projects", []),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-20", end: "2027-06-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 5 }, []),
      penalty: fact({ pct_per_day: 0.2, cap_pct: 8 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-05", []),
      special_qualifications: fact("Zertifizierung für Spannbetonarbeiten nach ZTV-ING", []),
      contractor_role: fact("Single trade", []),
    },
  },
  {
    id: "t6",
    title: "Elektroinstallation Sporthalle Neubau",
    buyer_name: "Stadt Plauen – Hochbauamt",
    place_city: "Plauen",
    place_nuts: "DED43",
    cpv_main: "45310000",
    estimated_value_eur: 340000,
    submission_deadline: "2026-10-12",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t6",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Elektroinstallation, Beleuchtung, Brandmeldeanlage, Sporthalle Neubau.",
    lots: [{ id: "t6-l1", title: "Elektroinstallation", cpv: "45310000", value_eur: 340000, trade: "electrical" }],
    fact_sheet: {
      trade_scope: fact("Electrical installation, lighting, fire-alarm system — new-build gym", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Elektroinstallation, Beleuchtung, Brandmeldeanlage, Sporthalle Neubau." },
      ]),
      place_of_performance: fact("Plauen", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Plauen." },
      ]),
      estimated_value: fact(340000, []),
      lots: fact(1, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-10", end: "2027-02-28" }, []),
      guarantees: notFound(),
      penalty: notFound(),
      self_performance_min_pct: fact(50, [
        { doc: "Leistungsverzeichnis.pdf", page: 4, quote_de: "Eigenleistungsanteil mind. 50%." },
      ]),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-12", []),
      special_qualifications: notFound(),
      contractor_role: fact("Subcontracted electrical package", []),
    },
  },
  {
    id: "t7",
    title: "Schlüsselfertiger Neubau Gesamtschule",
    buyer_name: "Schulbau Hamburg",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45214200",
    estimated_value_eur: 42000000,
    submission_deadline: "2026-12-03",
    published: "2026-09-05",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t7",
    lot_count: 6,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Schlüsselfertiger Neubau Gesamtschule, Generalunternehmerleistung.",
    lots: [{ id: "t7-l1", title: "GU-Leistung Schulneubau", cpv: "45214200", value_eur: 42000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Turnkey new-build school, general-contractor scope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Schlüsselfertiger Neubau Gesamtschule, GU-Leistung." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg." },
      ]),
      estimated_value: fact(42000000, []),
      lots: fact(6, []),
      references_required: fact("2 comparable school-building GC projects over €20M", []),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-02-01", end: "2029-08-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-12-03", []),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor — trades subcontracted, GC holds overall coordination", [
        { doc: "Leistungsverzeichnis.pdf", page: 6, quote_de: "Gewerke können an Nachunternehmer vergeben werden; GU trägt Gesamtkoordination." },
      ]),
    },
  },
  {
    id: "t8",
    title: "Erweiterungsneubau Krankenhaus",
    buyer_name: "Klinikum Kiel",
    place_city: "Kiel",
    place_nuts: "DEF02",
    cpv_main: "45215140",
    estimated_value_eur: 19000000,
    submission_deadline: "2026-11-20",
    published: "2026-09-07",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t8",
    lot_count: 4,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Erweiterungsneubau Krankenhaus, GU-Leistung.",
    lots: [{ id: "t8-l1", title: "GU-Leistung Krankenhaus", cpv: "45215140", value_eur: 19000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Hospital extension, general-contractor scope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Erweiterungsneubau Krankenhaus, GU-Leistung." },
      ]),
      place_of_performance: fact("Kiel", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Kiel." },
      ]),
      estimated_value: fact(19000000, []),
      lots: fact(4, []),
      references_required: fact("1 comparable hospital-building GC project", []),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-01-15", end: "2029-03-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.2, cap_pct: 10 }, [
        { doc: "Vertragsbedingungen.pdf", page: 12, quote_de: "Bei Überschreitung der vereinbarten Fertigstellungstermine wird eine Vertragsstrafe von 0,2% der Netto-Auftragssumme pro Werktag, insgesamt begrenzt auf 10% der Auftragssumme, fällig." },
      ]),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-20", []),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor", []),
    },
  },
  {
    id: "t9",
    title: "Straßen- und Kanalbau-Paket Landkreis Tuttlingen",
    buyer_name: "Landkreis Tuttlingen – Tiefbauamt",
    place_city: "Tuttlingen",
    place_nuts: "DE143",
    cpv_main: "45233120",
    estimated_value_eur: 3600000,
    submission_deadline: "2026-11-12",
    published: "2026-09-06",
    notice_url: "https://www.oeffentlichevergabe.de/notice/t9",
    lot_count: 2,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Straßen- und Kanalbauarbeiten, Erdarbeiten, ggf. mit Teillos Gebäudetechnik.",
    lots: [{ id: "t9-l1", title: "Straßen- und Kanalbau", cpv: "45233120", value_eur: 3600000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("Bundled road and sewer works, earthworks", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Straßen- und Kanalbauarbeiten, Erdarbeiten." },
      ]),
      place_of_performance: fact("Tuttlingen", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Landkreis Tuttlingen." },
      ]),
      estimated_value: fact(3600000, []),
      lots: fact(2, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-01-05", end: "2027-09-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: notFound(),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-12", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single trade, possible separable building-technology lot (unconfirmed)", []),
    },
  },
];

export function toSummary(tender: TenderDetail): TenderSummary {
  return {
    id: tender.id,
    title: tender.title,
    buyer_name: tender.buyer_name,
    place_city: tender.place_city,
    place_nuts: tender.place_nuts,
    cpv_main: tender.cpv_main,
    estimated_value_eur: tender.estimated_value_eur,
    submission_deadline: tender.submission_deadline,
    published: tender.published,
    notice_url: tender.notice_url,
    lot_count: tender.lot_count,
    docs_retrieved: tender.docs_retrieved,
    source: tender.source,
  };
}

export function findTender(id: string): TenderDetail | undefined {
  return TENDERS.find((tender) => tender.id === id);
}
