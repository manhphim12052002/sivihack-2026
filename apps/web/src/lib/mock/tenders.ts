/**
 * Demo lot fixtures for the triage board — each entry represents ONE LOT of a public tender.
 * Designed to produce realistic verdicts through the real screening engine (lib/screening/engine.ts)
 * for Hanseatische Bau AG (Hamburg, building GC, €8M–€90M, 300km radius, northern Germany).
 *
 * Verdict breakdown (Hanseatische Bau AG):
 *   PURSUE  (3): lot-hh-schule, lot-ki-klinikum, lot-hb-logistik
 *   REVIEW  (3): lot-hh-wohnen (size↓), lot-be-buero (penalty), lot-ki-berufsschule (refs)
 *   SKIP    (6): Bavaria / Baden-Württemberg exclusion, CPV mismatch (road/sewer/roofing),
 *                contract too small
 *
 * Replace with real pipeline data after hackathon.
 */
import type { Evidence, Fact, TenderDetail, TenderSummary } from "@/lib/api";

function fact(value: unknown, evidence: Evidence[] = [], confidence: Fact["confidence"] = "high"): Fact {
  return { value, confidence, evidence };
}

function notFound(): Fact {
  return { value: null, confidence: "not_found", evidence: [] };
}

export const TENDERS: TenderDetail[] = [
  // ── PURSUE ──────────────────────────────────────────────────────────────────

  {
    id: "lot-hh-schule",
    title: "Neubau Schulcampus Hamburg-Altona, Los 2 – Rohbau und Ausbau",
    buyer_name: "Behörde für Schule und Berufsbildung Hamburg",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45214200",
    estimated_value_eur: 22000000,
    submission_deadline: "2026-11-14",
    published: "2026-09-05",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hh-schule",
    lot_count: 3,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Neubau einer zweigeschossigen Schulanlage mit Sporthalle, Los 2 Rohbau und Ausbau.",
    lots: [{ id: "lot-hh-schule-l2", title: "Rohbau und Ausbau Schulcampus", cpv: "45214200", value_eur: 22000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Educational building construction — new-build school campus, shell and fit-out works", [
        { doc: "Leistungsverzeichnis.pdf", page: 2, quote_de: "Neubau Schulcampus Hamburg-Altona, Rohbau und Ausbau inkl. Sporthalle, Los 2." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg-Altona, Schulstraße 12." },
      ]),
      estimated_value: fact(22000000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert Los 2: ca. 22.000.000 €." },
      ]),
      lots: fact(3, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-12-01", end: "2028-07-31" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn 01.12.2026, Fertigstellung voraussichtlich Juli 2028." },
      ]),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, [
        { doc: "Vergabeunterlagen_Teil_B.pdf", page: 7, quote_de: "Vertragserfüllungsbürgschaft 5%, Gewährleistungsbürgschaft 3%." },
      ]),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, [
        { doc: "Vertragsbedingungen.pdf", page: 9, quote_de: "Vertragsstrafe 0,1% pro Werktag Verzug, max. 5% der Netto-Auftragssumme." },
      ]),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-14", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 14.11.2026, 12:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor — shell and fit-out, trades subcontracted", []),
    },
  },

  {
    id: "lot-ki-klinikum",
    title: "Erweiterungsbau Universitätsklinikum Kiel, Los 1 – Rohbau und Gebäudehülle",
    buyer_name: "Universitätsklinikum Schleswig-Holstein (UKSH)",
    place_city: "Kiel",
    place_nuts: "DEF02",
    cpv_main: "45215140",
    estimated_value_eur: 34000000,
    submission_deadline: "2026-11-28",
    published: "2026-09-08",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-ki-klinikum",
    lot_count: 4,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Erweiterungsneubau Krankenhaus, Los 1 Rohbau und Gebäudehülle, GU-Leistung.",
    lots: [{ id: "lot-ki-klinikum-l1", title: "Rohbau und Gebäudehülle Klinikum", cpv: "45215140", value_eur: 34000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Hospital extension, general-contractor scope — reinforced-concrete shell and building envelope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Erweiterungsneubau UKSH Kiel, Los 1 Rohbau und Gebäudehülle, GU-Leistung." },
      ]),
      place_of_performance: fact("Kiel", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Kiel, UKSH Campus Arnold-Heller-Str." },
      ]),
      estimated_value: fact(34000000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert Los 1: ca. 34.000.000 €." },
      ]),
      lots: fact(4, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-01-15", end: "2029-09-30" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn 15.01.2027, Fertigstellung September 2029." },
      ]),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-28", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 28.11.2026, 14:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor — hospital extension, medical trades subcontracted", []),
    },
  },

  {
    id: "lot-hb-logistik",
    title: "Neubau Logistikzentrum Bremen-Hafen, Los 3 – Schlüsselfertig",
    buyer_name: "Bremer Logistik Invest GmbH & Co. KG",
    place_city: "Bremen",
    place_nuts: "DE501",
    cpv_main: "45213152",
    estimated_value_eur: 17000000,
    submission_deadline: "2026-10-31",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hb-logistik",
    lot_count: 4,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Neubau Hochregallager und Bürogebäude, schlüsselfertige Errichtung, Los 3.",
    lots: [{ id: "lot-hb-logistik-l3", title: "Schlüsselfertig Logistikzentrum", cpv: "45213152", value_eur: 17000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Logistics warehouse and office building — turnkey new-build, general-contractor scope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Neubau Hochregallager und Bürogebäude, schlüsselfertig, GU-Leistung, Los 3." },
      ]),
      place_of_performance: fact("Bremen", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Bremen, Hafengebiet Überseestadt." },
      ]),
      estimated_value: fact(17000000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert Los 3: ca. 17.000.000 €." },
      ]),
      lots: fact(4, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-12-15", end: "2028-03-31" }, [
        { doc: "Bauzeitenplan.pdf", page: 1, quote_de: "Baubeginn 15.12.2026, Fertigstellung März 2028." },
      ]),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 4 }, [
        { doc: "Vertragsbedingungen.pdf", page: 8, quote_de: "Vertragsstrafe max. 4% der Netto-Auftragssumme." },
      ]),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-31", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 31.10.2026, 12:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor — turnkey, all trades subcontracted", []),
    },
  },

  // ── REVIEW ──────────────────────────────────────────────────────────────────

  {
    id: "lot-hh-wohnen",
    title: "Seniorenwohnanlage Hamburg-Wandsbek, Los 1 – Neubau Wohngebäude",
    buyer_name: "Hamburger Pflege und Wohnen GmbH",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45211300",
    estimated_value_eur: 7100000,
    submission_deadline: "2026-10-22",
    published: "2026-09-09",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hh-wohnen",
    lot_count: 2,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Neubau Seniorenwohnanlage, Los 1 Wohngebäude mit 48 barrierefreien Einheiten.",
    lots: [{ id: "lot-hh-wohnen-l1", title: "Neubau Seniorenwohngebäude", cpv: "45211300", value_eur: 7100000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Residential building construction — new-build senior care housing, 48 barrier-free units", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Neubau Seniorenwohnanlage, 48 barrierefreie Wohneinheiten, Hamburg-Wandsbek." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg-Wandsbek, Walddörferstraße." },
      ]),
      estimated_value: fact(7100000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert Los 1: ca. 7.100.000 €." },
      ]),
      lots: fact(2, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-01-10", end: "2028-04-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-22", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 22.10.2026, 12:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor", []),
    },
  },

  {
    id: "lot-be-buero",
    title: "Büropark Berlin-Spandau, Los 2 – Bürogebäude B und C schlüsselfertig",
    buyer_name: "Spandauer Stadtentwicklung GmbH",
    place_city: "Berlin",
    place_nuts: "DE300",
    cpv_main: "45211000",
    estimated_value_eur: 13000000,
    submission_deadline: "2026-11-07",
    published: "2026-09-08",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-be-buero",
    lot_count: 3,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Büro- und Gewerbepark Neubau, Los 2 Bürogebäude B und C, schlüsselfertig.",
    lots: [{ id: "lot-be-buero-l2", title: "Bürogebäude B und C schlüsselfertig", cpv: "45211000", value_eur: 13000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Office building construction — new-build office park, two buildings, turnkey general-contractor scope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Neubau Bürogebäude B und C, schlüsselfertig, GU-Leistung, Los 2." },
      ]),
      place_of_performance: fact("Berlin", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Berlin-Spandau, Brunsbütteler Damm." },
      ]),
      estimated_value: fact(13000000, [
        { doc: "Bekanntmachung.pdf", page: 2, quote_de: "Geschätzter Auftragswert Los 2: ca. 13.000.000 €." },
      ]),
      lots: fact(3, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-02-01", end: "2028-09-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.2, cap_pct: 8 }, [
        { doc: "Vertragsbedingungen.pdf", page: 11, quote_de: "Vertragsstrafe: 0,2% pro Werktag Verzug, begrenzt auf 8% der Netto-Auftragssumme." },
      ]),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-07", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 07.11.2026, 14:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor — turnkey, trades subcontracted", []),
    },
  },

  {
    id: "lot-ki-berufsschule",
    title: "Anbau Berufsschulzentrum Kiel, Los 3 – Vorhangfassade und Fenster",
    buyer_name: "Stadt Kiel – Amt für Schulentwicklung",
    place_city: "Kiel",
    place_nuts: "DEF02",
    cpv_main: "45214100",
    estimated_value_eur: 9500000,
    submission_deadline: "2026-11-21",
    published: "2026-09-07",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-ki-berufsschule",
    lot_count: 5,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Erweiterungsneubau Berufsschulzentrum, Los 3 Vorhangfassade, Fenster und Sonnenschutz.",
    lots: [{ id: "lot-ki-berufsschule-l3", title: "Vorhangfassade und Fenster Berufsschulzentrum", cpv: "45214100", value_eur: 9500000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Education building extension — curtain-wall facade, glazing and solar-shading specialist package", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Vorhangfassade, Fenster und Sonnenschutz, Erweiterung Berufsschulzentrum Kiel, Los 3." },
      ]),
      place_of_performance: fact("Kiel", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Kiel, Berufsschulzentrum Westring." },
      ]),
      estimated_value: fact(9500000, []),
      lots: fact(5, []),
      references_required: fact("2 curtain-wall facade projects on educational or public buildings, each contract ≥ €5M, within 8 years", [
        { doc: "Eignungskriterien.pdf", page: 4, quote_de: "Mindestens zwei vergleichbare Vorhangfassaden-Projekte an öffentlichen Gebäuden oder Schulen, jeweils Auftragswert mind. 5 Mio. €, innerhalb der letzten acht Jahre." },
      ]),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-03-01", end: "2028-06-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-21", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Angebotsfrist: 21.11.2026, 12:00 Uhr." },
      ]),
      special_qualifications: notFound(),
      contractor_role: fact("Trade contractor — curtain-wall facade specialist", []),
    },
  },

  // ── SKIP ────────────────────────────────────────────────────────────────────

  {
    id: "lot-muc-buero",
    title: "Neubau Bürokomplex München-Schwabing, Los 1 – Rohbau",
    buyer_name: "Münchener Gewerbebau AG",
    place_city: "München",
    place_nuts: "DE212",
    cpv_main: "45213110",
    estimated_value_eur: 19000000,
    submission_deadline: "2026-11-10",
    published: "2026-09-09",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-muc-buero",
    lot_count: 2,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Neubau Büro- und Verwaltungskomplex, Los 1 Rohbauarbeiten, Standort Bavaria.",
    lots: [{ id: "lot-muc-buero-l1", title: "Rohbau Bürokomplex München", cpv: "45213110", value_eur: 19000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Office and administration building construction in Bavaria — new-build shell works", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Rohbauarbeiten Büro- und Verwaltungskomplex, München, Bavaria." },
      ]),
      place_of_performance: fact("München", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: München-Schwabing, Leopoldstraße, Bavaria." },
      ]),
      estimated_value: fact(19000000, []),
      lots: fact(2, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-02-01", end: "2028-10-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-10", []),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor", []),
    },
  },

  {
    id: "lot-stu-klinik",
    title: "Neubau Klinik Stuttgart-West, Los 1 – Rohbau und Gebäudehülle",
    buyer_name: "Klinikverbund Baden-Württemberg GmbH",
    place_city: "Stuttgart",
    place_nuts: "DE111",
    cpv_main: "45215140",
    estimated_value_eur: 25000000,
    submission_deadline: "2026-12-01",
    published: "2026-09-07",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-stu-klinik",
    lot_count: 3,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Krankenhausneubau Stuttgart-West, Baden-Württemberg. Los 1 Rohbau und Gebäudehülle.",
    lots: [{ id: "lot-stu-klinik-l1", title: "Rohbau Klinik Stuttgart", cpv: "45215140", value_eur: 25000000, trade: "building" }],
    fact_sheet: {
      trade_scope: fact("Hospital new-build in Baden-Württemberg — reinforced-concrete shell and building envelope", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Krankenhausneubau Stuttgart, Baden-Württemberg, Los 1 Rohbau und Gebäudehülle." },
      ]),
      place_of_performance: fact("Stuttgart", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Stuttgart-West, Baden-Württemberg." },
      ]),
      estimated_value: fact(25000000, []),
      lots: fact(3, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-03-01", end: "2029-06-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-12-01", []),
      special_qualifications: notFound(),
      contractor_role: fact("General contractor", []),
    },
  },

  {
    id: "lot-hh-kanal",
    title: "Kanalsanierung Hamburg-Eimsbüttel, Los 2 – Druckleitung und Schächte",
    buyer_name: "Hamburg Wasser AöR",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45232400",
    estimated_value_eur: 8500000,
    submission_deadline: "2026-10-18",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hh-kanal",
    lot_count: 3,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Kanalsanierung Abwasserdruckleitung und Schachtbauwerke, Tiefbau sewer works.",
    lots: [{ id: "lot-hh-kanal-l2", title: "Druckleitung und Schächte Hamburg", cpv: "45232400", value_eur: 8500000, trade: "sewer" }],
    fact_sheet: {
      trade_scope: fact("Sewer construction — wastewater pressure main, manhole structures and connections", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Kanalsanierung, Druckleitung DN300 und Schachtbauwerke, Hamburg-Eimsbüttel." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg-Eimsbüttel, Osterstraße." },
      ]),
      estimated_value: fact(8500000, []),
      lots: fact(3, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-23", end: "2027-08-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-18", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single civil trade contractor", []),
    },
  },

  {
    id: "lot-hh-strasse",
    title: "Fahrbahndeckenerneuerung B75 Hamburg-Harburg, Los 1",
    buyer_name: "Landesbetrieb Straßen, Brücken und Gewässer Hamburg (LSBG)",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45233141",
    estimated_value_eur: 6000000,
    submission_deadline: "2026-10-10",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hh-strasse",
    lot_count: 2,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Fahrbahndeckenerneuerung B75, road construction works, Asphalteinbau und Markierung.",
    lots: [{ id: "lot-hh-strasse-l1", title: "Fahrbahndeckenerneuerung B75", cpv: "45233141", value_eur: 6000000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("Road construction — carriageway surface renewal, asphalt paving and road markings", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Fahrbahndeckenerneuerung, road construction, Asphalteinbau und Markierung B75, Los 1." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg-Harburg, Bundesstraße B75." },
      ]),
      estimated_value: fact(6000000, []),
      lots: fact(2, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-09", end: "2027-04-30" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-10", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single road trade contractor", []),
    },
  },

  {
    id: "lot-hh-dach",
    title: "Dachsanierung Sportanlage Hamburg-Eppendorf, Los 1 – Flachdach",
    buyer_name: "Hamburger Sportbund – Liegenschaftsverwaltung",
    place_city: "Hamburg",
    place_nuts: "DE600",
    cpv_main: "45261100",
    estimated_value_eur: 720000,
    submission_deadline: "2026-10-05",
    published: "2026-09-10",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-hh-dach",
    lot_count: 1,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Dachsanierung Sporthalle, Flachdach und Dachabdichtung, Instandsetzung.",
    lots: [{ id: "lot-hh-dach-l1", title: "Dachsanierung Sporthalle Eppendorf", cpv: "45261100", value_eur: 720000, trade: "roofing" }],
    fact_sheet: {
      trade_scope: fact("Roof repair and waterproofing — flat-roof rehabilitation, roofing specialist works", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Dachsanierung Sporthalle, Flachdach und Dachabdichtung, Instandsetzung." },
      ]),
      place_of_performance: fact("Hamburg", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Hamburg-Eppendorf, Sportanlage Lattenkamp." },
      ]),
      estimated_value: fact(720000, []),
      lots: fact(1, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2026-11-02", end: "2027-02-28" }, []),
      guarantees: notFound(),
      penalty: notFound(),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(true, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-10-05", []),
      special_qualifications: notFound(),
      contractor_role: fact("Specialist roofing contractor", []),
    },
  },

  {
    id: "lot-be-strasse",
    title: "Ausbau B96 Berlin-Treptow, Los 2 – Straßenbau und Entwässerung",
    buyer_name: "Senatsverwaltung für Mobilität, Verkehr, Klimaschutz und Umwelt Berlin",
    place_city: "Berlin",
    place_nuts: "DE300",
    cpv_main: "45233120",
    estimated_value_eur: 9200000,
    submission_deadline: "2026-11-14",
    published: "2026-09-09",
    notice_url: "https://www.oeffentlichevergabe.de/notice/lot-be-strasse",
    lot_count: 3,
    docs_retrieved: true,
    source: "oeffentlichevergabe.de",
    description: "Straßenaus- und -neubauarbeiten B96, road construction and drainage, Los 2.",
    lots: [{ id: "lot-be-strasse-l2", title: "Straßenbau B96 Berlin", cpv: "45233120", value_eur: 9200000, trade: "road" }],
    fact_sheet: {
      trade_scope: fact("Road widening and drainage — federal road B96 widening, road construction and stormwater", [
        { doc: "Leistungsverzeichnis.pdf", page: 1, quote_de: "Straßenneubau und Entwässerung B96, road construction, Los 2." },
      ]),
      place_of_performance: fact("Berlin", [
        { doc: "Bekanntmachung.pdf", page: 1, quote_de: "Baustelle: Berlin-Treptow, Bundesstraße B96." },
      ]),
      estimated_value: fact(9200000, []),
      lots: fact(3, []),
      references_required: notFound(),
      eligibility_proofs: notFound(),
      construction_window: fact({ start: "2027-01-04", end: "2027-10-31" }, []),
      guarantees: fact({ performance_pct: 5, warranty_pct: 3 }, []),
      penalty: fact({ pct_per_day: 0.1, cap_pct: 5 }, []),
      self_performance_min_pct: notFound(),
      side_offers_allowed: fact(false, []),
      consortium_allowed: fact(true, []),
      submission_deadline: fact("2026-11-14", []),
      special_qualifications: notFound(),
      contractor_role: fact("Single road trade contractor — road construction", []),
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
