/**
 * Placeholder screening rule engine.
 *
 * Stands in for the real decision pipeline (docs/design.md, ADR-0003: "model extracts, rules
 * decide, templates explain") until it's built. Compares a real `CompanyProfile`
 * (stored, via /api/companies) against a mock `TenderDetail` fact sheet (`lib/mock/tenders.ts`)
 * and produces the same `Verdict`/`CriterionResult` shapes the real pipeline will one day
 * return — so swapping this module out later is a route-handler change, not a frontend one.
 *
 * Deliberately company-agnostic: every comparison reads structured `CompanyProfile` fields
 * (home_base, radius_km, contract_min/max_eur, trades, cpv_prefixes, hard_exclusions, ...), not
 * a hardcoded company id, so an unseen company profile screens correctly — this is the
 * "generalizes to unseen company/tender pairs" bonus the challenge brief calls out.
 *
 * Criteria not modeled yet (lots, eligibility proofs, side offers, consortium, special
 * qualifications, contractor role) are left out of the criteria list entirely rather than
 * faked — they still show up in the tender's fact sheet for transparency.
 */
import type { CompanyProfile, CriterionResult, Fact, TenderDetail, Verdict } from "@/lib/api";
import { CITY_COORDS, distanceKm, lookupCity } from "./geo";

type Status = CriterionResult["status"];

function keywordHit(haystack: string | null | undefined, needles: string[]): string | null {
  if (!haystack) return null;
  const lower = haystack.toLowerCase();
  return needles.find((needle) => needle.trim() && lower.includes(needle.trim().toLowerCase())) ?? null;
}

function textOf(fact: Fact | undefined): string {
  if (!fact || fact.value == null) return "";
  return typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value);
}

function result(
  criterion: string,
  status: Status,
  kind: CriterionResult["kind"],
  reason_en: string,
  opts: Partial<Pick<CriterionResult, "tender_evidence" | "tender_value" | "company_fact">> = {},
): CriterionResult {
  return {
    criterion,
    status,
    kind,
    reason_en,
    tender_evidence: opts.tender_evidence ?? [],
    tender_value: opts.tender_value ?? null,
    company_fact: opts.company_fact ?? null,
  };
}

// ─── Individual criteria ───────────────────────────────────────────────────────

function scopeCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fs = tender.fact_sheet;
  const scopeText = textOf(fs?.trade_scope);
  const qualText = textOf(fs?.special_qualifications);
  const combined = `${scopeText} ${qualText} ${tender.description ?? ""}`;

  const exclusionHit = keywordHit(combined, company.hard_exclusions ?? []);
  if (exclusionHit) {
    return result(
      "Trade & scope",
      "Blocker",
      "semantic",
      `Matches a stated hard exclusion ("${exclusionHit}") — this company doesn't take this kind of work regardless of size or location.`,
      { tender_evidence: fs?.trade_scope?.evidence ?? fs?.special_qualifications?.evidence, company_fact: exclusionHit },
    );
  }

  const cpvPrefixes = company.cpv_prefixes ?? [];
  if (cpvPrefixes.length > 0 && tender.cpv_main) {
    const matches = cpvPrefixes.some((prefix) => tender.cpv_main!.startsWith(prefix));
    if (matches) {
      return result("Trade & scope", "OK", "numeric", "CPV code matches one of the company's stated trade prefixes.", {
        tender_evidence: fs?.trade_scope?.evidence,
        tender_value: tender.cpv_main,
        company_fact: cpvPrefixes.join(", "),
      });
    }
    return result(
      "Trade & scope",
      "Blocker",
      "numeric",
      `Tender's CPV code (${tender.cpv_main}) doesn't match any of the company's stated trade prefixes.`,
      { tender_evidence: fs?.trade_scope?.evidence, tender_value: tender.cpv_main, company_fact: cpvPrefixes.join(", ") },
    );
  }

  const trades = company.trades ?? [];
  if (trades.length > 0) {
    const hit = keywordHit(combined, trades);
    if (hit) {
      return result("Trade & scope", "OK", "semantic", `Scope mentions "${hit}", one of the company's stated trades.`, {
        tender_evidence: fs?.trade_scope?.evidence,
        company_fact: trades.join(", "),
      });
    }
    return result(
      "Trade & scope",
      "Blocker",
      "semantic",
      "Scope text doesn't mention any of the company's stated trades.",
      { tender_evidence: fs?.trade_scope?.evidence, company_fact: trades.join(", ") },
    );
  }

  return result("Trade & scope", "Unknown", "semantic", "Company profile has no stated trades or CPV prefixes to compare against.");
}

function geographyCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const companyPoint = company.home_base_geo ?? lookupCity(company.home_base);
  const tenderPoint = lookupCity(tender.place_city);
  const fs = tender.fact_sheet;

  if (!companyPoint || !tenderPoint) {
    return result(
      "Geography",
      "Unknown",
      "numeric",
      "Distance couldn't be computed — company home base or tender location isn't in the placeholder city lookup yet.",
      { tender_evidence: fs?.place_of_performance?.evidence, tender_value: tender.place_city, company_fact: company.home_base },
    );
  }

  const km = Math.round(distanceKm(companyPoint, tenderPoint));
  const radius = company.radius_km;
  if (radius == null) {
    return result("Geography", "Unknown", "numeric", `${km} km from the company's home base — no stated operating radius to compare against.`, {
      tender_evidence: fs?.place_of_performance?.evidence,
      tender_value: `${km} km`,
    });
  }
  if (km <= radius) {
    return result("Geography", "OK", "numeric", `${km} km from ${company.home_base} — within the stated ${radius} km operating radius.`, {
      tender_evidence: fs?.place_of_performance?.evidence,
      tender_value: `${km} km`,
      company_fact: `${radius} km radius`,
    });
  }
  if (km <= radius * 1.3) {
    return result(
      "Geography",
      "Risk",
      "numeric",
      `${km} km from ${company.home_base} — just outside the stated ${radius} km radius; may be worth an exception.`,
      { tender_evidence: fs?.place_of_performance?.evidence, tender_value: `${km} km`, company_fact: `${radius} km radius` },
    );
  }
  return result(
    "Geography",
    "Risk",
    "numeric",
    `${km} km from ${company.home_base} — well outside the stated ${radius} km radius.`,
    { tender_evidence: fs?.place_of_performance?.evidence, tender_value: `${km} km`, company_fact: `${radius} km radius` },
  );
}

function contractSizeCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const value = tender.estimated_value_eur;
  const min = company.contract_min_eur;
  const max = company.contract_max_eur;
  const fs = tender.fact_sheet;
  const range = min != null && max != null ? `€${min.toLocaleString("de-DE")}–${max.toLocaleString("de-DE")}` : null;

  if (value == null || (min == null && max == null)) {
    return result("Contract size", "Unknown", "numeric", "No estimated value or no stated target contract range to compare.", {
      tender_evidence: fs?.estimated_value?.evidence,
      tender_value: value,
      company_fact: range,
    });
  }

  const withinBand = (min == null || value >= min * 0.8) && (max == null || value <= max * 1.2);
  const withinRange = (min == null || value >= min) && (max == null || value <= max);

  if (withinRange) {
    return result("Contract size", "OK", "numeric", `Sits within the company's stated ${range} target contract range.`, {
      tender_evidence: fs?.estimated_value?.evidence,
      tender_value: value,
      company_fact: range,
    });
  }
  if (withinBand) {
    return result("Contract size", "Risk", "numeric", `Just outside the company's stated ${range} target range.`, {
      tender_evidence: fs?.estimated_value?.evidence,
      tender_value: value,
      company_fact: range,
    });
  }
  return result("Contract size", "Blocker", "numeric", `Far outside the company's stated ${range} target contract range.`, {
    tender_evidence: fs?.estimated_value?.evidence,
    tender_value: value,
    company_fact: range,
  });
}

function referencesCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fact = tender.fact_sheet?.references_required;
  if (!fact || fact.confidence === "not_found") {
    return result("References required", "OK", "semantic", "No reference requirement stated in the tender.");
  }
  const held = company.references_held ?? [];
  if (held.length === 0) {
    return result(
      "References required",
      "Unknown",
      "semantic",
      "Tender states a reference requirement; company profile doesn't list any references held yet.",
      { tender_evidence: fact.evidence, tender_value: textOf(fact) },
    );
  }
  const scopeText = textOf(tender.fact_sheet?.trade_scope);
  const matched = held.find((ref) => keywordHit(scopeText, [ref]) || keywordHit(textOf(fact), [ref]));
  if (matched) {
    return result("References required", "OK", "semantic", `Company holds a reference ("${matched}") that plausibly matches this requirement.`, {
      tender_evidence: fact.evidence,
      tender_value: textOf(fact),
      company_fact: held.join(", "),
    });
  }
  return result(
    "References required",
    "Risk",
    "semantic",
    "Tender states a reference requirement that doesn't clearly match any reference the company holds — worth a closer read of the actual documents.",
    { tender_evidence: fact.evidence, tender_value: textOf(fact), company_fact: held.join(", ") },
  );
}

function guaranteesCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fact = tender.fact_sheet?.guarantees;
  if (!fact || fact.confidence === "not_found" || fact.value == null) {
    return result("Guarantees", "OK", "numeric", "No guarantee (Bürgschaft) requirement stated in the tender.");
  }
  const { performance_pct, warranty_pct } = fact.value as { performance_pct?: number; warranty_pct?: number };
  const totalPct = (performance_pct ?? 0) + (warranty_pct ?? 0);
  const value = tender.estimated_value_eur ?? 0;
  const requiredEur = Math.round((value * totalPct) / 100);
  const capacity = company.guarantee_capacity_eur;

  if (capacity == null) {
    return result("Guarantees", "Unknown", "numeric", `Requires ~€${requiredEur.toLocaleString("de-DE")} in bonding capacity — company profile has no stated guarantee capacity.`, {
      tender_evidence: fact.evidence,
      tender_value: requiredEur,
    });
  }
  if (requiredEur <= capacity * 0.6) {
    return result("Guarantees", "OK", "numeric", `Requires ~€${requiredEur.toLocaleString("de-DE")}, comfortably within the €${capacity.toLocaleString("de-DE")} guarantee capacity.`, {
      tender_evidence: fact.evidence,
      tender_value: requiredEur,
      company_fact: `€${capacity.toLocaleString("de-DE")} capacity`,
    });
  }
  if (requiredEur <= capacity) {
    return result("Guarantees", "Risk", "numeric", `Requires ~€${requiredEur.toLocaleString("de-DE")}, approaching the €${capacity.toLocaleString("de-DE")} guarantee ceiling — check exposure against other bids this week.`, {
      tender_evidence: fact.evidence,
      tender_value: requiredEur,
      company_fact: `€${capacity.toLocaleString("de-DE")} capacity`,
    });
  }
  return result("Guarantees", "Blocker", "numeric", `Requires ~€${requiredEur.toLocaleString("de-DE")}, above the €${capacity.toLocaleString("de-DE")} guarantee capacity.`, {
    tender_evidence: fact.evidence,
    tender_value: requiredEur,
    company_fact: `€${capacity.toLocaleString("de-DE")} capacity`,
  });
}

function selfPerformanceCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fact = tender.fact_sheet?.self_performance_min_pct;
  if (!fact || fact.confidence === "not_found" || fact.value == null) {
    return result("Self-performance", "OK", "numeric", "No minimum self-performance share stated in the tender.");
  }
  const required = Number(fact.value);
  const share = company.self_perform_share_pct;
  if (share == null) {
    return result("Self-performance", "Unknown", "numeric", `Tender requires ≥${required}% self-performance — company profile has no stated self-performance share.`, {
      tender_evidence: fact.evidence,
      tender_value: required,
    });
  }
  const gap = required - share;
  if (gap <= 0) {
    return result("Self-performance", "OK", "numeric", `Required minimum (${required}%) is within the company's stated self-performance share (${share}%).`, {
      tender_evidence: fact.evidence,
      tender_value: required,
      company_fact: `${share}%`,
    });
  }
  if (gap <= 20) {
    return result("Self-performance", "Risk", "numeric", `Required minimum (${required}%) is above the company's stated ${share}% — a modest gap to close.`, {
      tender_evidence: fact.evidence,
      tender_value: required,
      company_fact: `${share}%`,
    });
  }
  return result("Self-performance", "Blocker", "numeric", `Required minimum (${required}%) is far above the company's stated ${share}% self-performance share.`, {
    tender_evidence: fact.evidence,
    tender_value: required,
    company_fact: `${share}%`,
  });
}

function constructionWindowCriterion(company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fact = tender.fact_sheet?.construction_window;
  if (!fact || fact.confidence === "not_found" || fact.value == null) {
    return result("Construction window", "OK", "semantic", "No construction start date stated in the tender.");
  }
  const { start } = fact.value as { start?: string };
  if (!start) {
    return result("Construction window", "OK", "semantic", "No construction start date stated in the tender.");
  }
  const earliest = company.earliest_start;
  if (!earliest) {
    return result("Construction window", "Unknown", "semantic", `Tender's planned start is ${start} — company profile has no stated earliest availability.`, {
      tender_evidence: fact.evidence,
      tender_value: start,
    });
  }
  if (new Date(start) >= new Date(earliest)) {
    return result("Construction window", "OK", "semantic", `Planned start (${start}) is on or after the company's stated earliest availability (${earliest}).`, {
      tender_evidence: fact.evidence,
      tender_value: start,
      company_fact: earliest,
    });
  }
  return result(
    "Construction window",
    "Risk",
    "semantic",
    `Planned start (${start}) is before the company's stated earliest availability (${earliest}) — would need a crew reshuffle or a subcontracted early phase.`,
    { tender_evidence: fact.evidence, tender_value: start, company_fact: earliest },
  );
}

function penaltyCriterion(_company: CompanyProfile, tender: TenderDetail): CriterionResult {
  const fact = tender.fact_sheet?.penalty;
  if (!fact || fact.confidence === "not_found" || fact.value == null) {
    return result("Penalty clause", "OK", "numeric", "No penalty (Vertragsstrafe) clause stated in the tender.");
  }
  const { cap_pct } = fact.value as { cap_pct?: number };
  const cap = cap_pct ?? 0;
  // Placeholder risk threshold — no company field states a penalty-risk tolerance yet.
  if (cap <= 5) {
    return result("Penalty clause", "OK", "numeric", `Penalty capped at ${cap}% of contract value — within the usual comfort range.`, {
      tender_evidence: fact.evidence,
      tender_value: `${cap}%`,
    });
  }
  if (cap <= 10) {
    return result("Penalty clause", "Risk", "numeric", `Penalty capped at ${cap}% of contract value — above the usual 5% comfort threshold, worth a contract-risk review.`, {
      tender_evidence: fact.evidence,
      tender_value: `${cap}%`,
    });
  }
  return result("Penalty clause", "Blocker", "numeric", `Penalty capped at ${cap}% of contract value — unusually high.`, {
    tender_evidence: fact.evidence,
    tender_value: `${cap}%`,
  });
}

function timelineCriterion(_company: CompanyProfile, tender: TenderDetail, now: Date): CriterionResult {
  if (!tender.submission_deadline) {
    return result("Submission timeline", "Unknown", "numeric", "No submission deadline stated.");
  }
  const deadline = new Date(tender.submission_deadline);
  const daysLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 7) {
    return result("Submission timeline", "Blocker", "numeric", `Only ${daysLeft} day(s) left to submit — not enough time to prepare a serious bid.`, {
      tender_value: tender.submission_deadline,
    });
  }
  if (daysLeft < 21) {
    return result("Submission timeline", "Risk", "numeric", `${daysLeft} days left to submit — a tight but workable turnaround.`, {
      tender_value: tender.submission_deadline,
    });
  }
  return result("Submission timeline", "OK", "numeric", `${daysLeft} days left to submit — comfortable turnaround.`, {
    tender_value: tender.submission_deadline,
  });
}

// ─── Verdict assembly ───────────────────────────────────────────────────────────

function summarize(criteria: CriterionResult[], overall: Verdict["overall"]): string {
  const blocker = criteria.find((c) => c.status === "Blocker");
  const risk = criteria.find((c) => c.status === "Risk");
  if (overall === "NoGo" && blocker) return blocker.reason_en;
  if (overall === "Consider" && risk) return risk.reason_en;
  return "Strong opportunity — no blockers or risks identified against the company's stated profile.";
}

export function screenTender(company: CompanyProfile, tender: TenderDetail, now: Date = new Date()): Verdict {
  const criteria = [
    scopeCriterion(company, tender),
    geographyCriterion(company, tender),
    contractSizeCriterion(company, tender),
    referencesCriterion(company, tender),
    guaranteesCriterion(company, tender),
    selfPerformanceCriterion(company, tender),
    constructionWindowCriterion(company, tender),
    penaltyCriterion(company, tender),
    timelineCriterion(company, tender, now),
  ];

  const blockers = criteria.filter((c) => c.status === "Blocker").length;
  const risks = criteria.filter((c) => c.status === "Risk").length;
  const unknowns = criteria.filter((c) => c.status === "Unknown").length;
  const overall: Verdict["overall"] = blockers > 0 ? "NoGo" : risks > 0 ? "Consider" : "Bid";

  return {
    tender_id: tender.id,
    company_id: company.id,
    overall,
    criteria,
    summary_en: summarize(criteria, overall),
    blockers,
    risks,
    unknowns,
    rank: null,
  };
}

/** Ranks the "Bid" verdicts (fewest risks, then higher value first) — used for the weekly portfolio. */
export function rankVerdicts(verdicts: Verdict[], tenderValue: (tenderId: string) => number | null): Verdict[] {
  const bidVerdicts = verdicts.filter((v) => v.overall === "Bid");
  const ranked = [...bidVerdicts].sort((a, b) => {
    if (a.risks !== b.risks) return a.risks - b.risks;
    return (tenderValue(b.tender_id) ?? 0) - (tenderValue(a.tender_id) ?? 0);
  });
  const rankById = new Map(ranked.map((v, index) => [v.tender_id, index + 1]));
  return verdicts.map((v) => ({ ...v, rank: rankById.get(v.tender_id) ?? null }));
}

// Re-exported so route handlers/tests can reach the city lookup without a second import path.
export { CITY_COORDS };
