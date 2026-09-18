/**
 * Passage selection for layer 2: which pieces of the lot's documents a matcher gets to read.
 *
 * Retrieval never decides anything. It ranks the lot's passages by keyword overlap with the
 * question — a keyword floor first (the German vocabulary of the requirement kind), then plain
 * token overlap — and hands the top few to the model, which must quote them verbatim. When the
 * whole document set is small, everything is returned and retrieval does nothing.
 */

import type { Passage } from "./types";

const STOPWORDS = new Set([
  "aber", "alle", "allen", "aller", "also", "auch", "bzw", "dass", "dem", "den", "der", "des", "die", "dies",
  "diese", "dieser", "dieses", "durch", "eine", "einem", "einen", "einer", "eines", "für", "gegen", "hat",
  "ist", "mit", "nach", "nicht", "oder", "sind", "sowie", "und", "vom", "von", "wird", "werden", "wenn",
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "must", "shall",
]);

/** German vocabulary per requirement kind; a passage containing one of these is always a candidate. */
export const KIND_KEYWORDS: Record<string, string[]> = {
  references_required: ["referenz", "vergleichbar", "nachweis", "erfahrung", "leistungsfähigkeit"],
  guarantees: ["sicherheit", "bürgschaft", "vertragserfüllung", "gewährleistung", "mängelansprüche"],
  penalty: ["vertragsstrafe", "verzug", "pönale"],
  self_performance_min_pct: ["eigenleistung", "nachunternehmer", "eigenen betrieb", "unteraufträge"],
  construction_window: ["ausführungsfrist", "bauzeit", "baubeginn", "fertigstellung", "termin", "bauzeitenplan"],
  contractor_role: ["generalunternehmer", "nachunternehmer", "bietergemeinschaft", "fachlos"],
  special_qualifications: ["zulassung", "zertifikat", "nachweis", "qualifikation", "fachkraft", "sachkundige",
    "iso 9001", "präqualifikation", "prüfzeugnis", "abnahme", "gütezeichen", "gsb", "qualicoat"],
  document_qualifications: ["zulassung", "zertifikat", "nachweis", "qualifikation", "fachkraft", "sachkundige",
    "iso 9001", "präqualifikation", "prüfzeugnis", "abnahme", "gütezeichen", "gsb", "qualicoat", "zugelassen"],
  eligibility_proofs: ["eignung", "eigenerklärung", "präqualifikation", "nachweis", "erklärung"],
  QUALIFICATION: ["zulassung", "zertifikat", "nachweis", "qualifikation", "fachkraft", "iso 9001", "präqualifikation"],
  FINANCIAL: ["umsatz", "bürgschaft", "sicherheit", "versicherung", "bilanz"],
  INSURANCE: ["versicherung", "haftpflicht", "deckungssumme", "bauwesenversicherung"],
  PERSONNEL: ["personal", "beschäftigte", "arbeitskräfte", "mitarbeiter", "bauleiter"],
  REFERENCE: ["referenz", "vergleichbar"],
  EXECUTION: ["ausführung", "bauzeit", "termin", "baustelle"],
  SUBMISSION: ["angebot", "frist", "formblatt", "einzureichen", "vorzulegen"],
  CONTRACTUAL: ["vertrag", "abrechnung", "zahlung", "vertragsstrafe", "sicherheit"],
  LEGAL: ["handelsregister", "handwerksrolle", "gewerbe", "gesetz"],
};

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Top-`k` passages for a question. `kind` selects the keyword floor; `queryText` adds the
 * requirement's own wording (typed condition, quote, company facts) for token overlap.
 */
export function selectPassages(passages: Passage[], kind: string, queryText: string, k = 4): Passage[] {
  if (passages.length <= k) return passages;
  const keywords = KIND_KEYWORDS[kind] ?? [];
  const query = new Set(tokens(queryText));

  const scored = passages.map((p) => {
    const lower = p.text.toLowerCase();
    const floor = keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
    const words = new Set(tokens(p.text));
    let overlap = 0;
    for (const t of query) if (words.has(t)) overlap++;
    // Keyword hits weigh more than incidental token overlap; length-normalise lightly so a
    // 3,000-character preamble does not outrank a focused position purely by size.
    const score = floor * 3 + overlap - Math.log10(Math.max(p.text.length, 100)) / 4;
    return { p, score, hit: floor > 0 || overlap > 0 };
  });

  return scored
    .filter((s) => s.hit)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.p);
}

/** Whitespace-normalised substring check: the same gate the pipeline applies to model quotes. */
export function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function quoteIsIn(quote: string, passage: Passage): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(passage.text).includes(q);
}
