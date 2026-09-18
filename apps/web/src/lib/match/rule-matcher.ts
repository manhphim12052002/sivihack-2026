import { genId } from "@/lib/id";
import { formatEur } from "@/lib/status";
import type { MatchingTask, MatchResult, MatchStatus, CanonicalCompany } from "./types";

type RuleResult = Pick<MatchResult, "status" | "method" | "reason"> & { severity_override?: "HARD" | "SOFT" };

function pass(reason: string): RuleResult {
  return { status: "PASS", method: "DETERMINISTIC", reason };
}
function fail(reason: string): RuleResult {
  return { status: "FAIL", method: "DETERMINISTIC", reason };
}
function uncertain(reason: string): RuleResult {
  return { status: "UNCERTAIN", method: "DETERMINISTIC", reason };
}

// ─── Individual rule checks ───────────────────────────────────────────────────

function checkEstimatedValue(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  const value = typeof tenderValue === "number" ? tenderValue : null;
  if (value === null) return uncertain("Tender contract value not stated.");

  const min = company.commercial_profile.contract_min_eur;
  const max = company.commercial_profile.contract_max_eur;
  const partnerThreshold = company.commercial_profile.partner_threshold_eur;

  if (min !== null && min !== undefined && value < min) {
    return fail(`Tender value ${formatEur(value)} is below company minimum ${formatEur(min)}.`);
  }

  if (max !== null && max !== undefined && value > max) {
    // Check partner threshold before treating as a straight fail
    if (partnerThreshold !== null && partnerThreshold !== undefined && value >= partnerThreshold) {
      // Check for hard no-JV constraint
      const noJv = (company.constraints ?? []).find(
        (c) =>
          c.status !== "REJECTED" &&
          c.severity === "HARD" &&
          (c.type === "JV" || c.type === "CONSORTIUM") &&
          c.operator === "EXCLUDE",
      );
      if (noJv && noJv.status === "CONFIRMED") {
        return {
          ...fail(
            `${formatEur(value)} requires a partner/JV (threshold ${formatEur(partnerThreshold)}) but company has a hard no-JV constraint.`,
          ),
          severity_override: "HARD",
        };
      }
      return {
        status: "UNCERTAIN",
        method: "PARTNER_REQUIRED",
        reason: `${formatEur(value)} exceeds partner threshold ${formatEur(partnerThreshold)}. A partner/JV would be required.`,
        severity_override: "HARD",
      };
    }
    return fail(`Tender value ${formatEur(value)} exceeds company maximum ${formatEur(max)}.`);
  }

  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return uncertain("Company contract size limits not on file.");
  }
  return pass(`Tender value ${formatEur(value)} is within company range (${formatEur(min ?? null)}–${formatEur(max ?? null)}).`);
}

function checkGuarantees(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  // eForms BT-75 answers only WHETHER a guarantee is required; "false" is a real answer.
  if (tenderValue === false || tenderValue === "false" || tenderValue === "no") {
    return pass("The notice states that no guarantee (Sicherheitsleistung) is required.");
  }
  if (tenderValue === true || tenderValue === "true" || tenderValue === "yes") {
    return uncertain("A guarantee is required but its amount is only stated in the documents.");
  }
  const required = extractNumber(tenderValue);
  if (required === null) return uncertain("Guarantee amount not specified in tender.");

  const capacity = company.commercial_profile.guarantee_capacity_eur;
  if (capacity === null || capacity === undefined) {
    return uncertain("Company guarantee capacity not on file.");
  }
  if (required <= capacity) {
    return pass(`Required guarantee ${formatEur(required)} is within company capacity ${formatEur(capacity)}.`);
  }
  return fail(`Required guarantee ${formatEur(required)} exceeds company capacity ${formatEur(capacity)}.`);
}

function checkSelfPerformance(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  const required = extractNumber(tenderValue);
  if (required === null) return uncertain("Self-performance minimum not specified in tender.");

  const actual = company.commercial_profile.self_perform_share_pct;
  if (actual === null || actual === undefined) {
    return uncertain("Company self-performance share not on file.");
  }
  if (actual >= required) {
    return pass(`Company self-performance share ${actual}% meets or exceeds required ${required}%.`);
  }
  return fail(`Company self-performance share ${actual}% is below required ${required}%.`);
}

/** NUTS-1 code → federal state; region words a company profile may use for it. */
const NUTS1: Record<string, { state: string; words: string[] }> = {
  DE1: { state: "Baden-Württemberg", words: ["baden-württemberg", "baden-wuerttemberg", "südwesten", "southern germany", "süddeutschland"] },
  DE2: { state: "Bayern", words: ["bayern", "bavaria", "schwaben", "oberbayern", "niederbayern", "franken", "oberpfalz", "eastern bavaria", "ostbayern", "southern germany", "süddeutschland"] },
  DE3: { state: "Berlin", words: ["berlin"] },
  DE4: { state: "Brandenburg", words: ["brandenburg"] },
  DE5: { state: "Bremen", words: ["bremen", "northern germany", "norddeutschland"] },
  DE6: { state: "Hamburg", words: ["hamburg", "northern germany", "norddeutschland"] },
  DE7: { state: "Hessen", words: ["hessen", "hesse"] },
  DE8: { state: "Mecklenburg-Vorpommern", words: ["mecklenburg", "northern germany", "norddeutschland"] },
  DE9: { state: "Niedersachsen", words: ["niedersachsen", "lower saxony", "northern germany", "norddeutschland"] },
  DEA: { state: "Nordrhein-Westfalen", words: ["nordrhein-westfalen", "north rhine-westphalia", "nrw", "westfalen", "westphalia", "ruhr", "rheinland"] },
  DEB: { state: "Rheinland-Pfalz", words: ["rheinland-pfalz", "rhineland-palatinate"] },
  DEC: { state: "Saarland", words: ["saarland"] },
  DED: { state: "Sachsen", words: ["sachsen", "saxony", "vogtland"] },
  DEE: { state: "Sachsen-Anhalt", words: ["sachsen-anhalt", "saxony-anhalt"] },
  DEF: { state: "Schleswig-Holstein", words: ["schleswig-holstein", "northern germany", "norddeutschland"] },
  DEG: { state: "Thüringen", words: ["thüringen", "thuringia"] },
};

function checkPlaceOfPerformance(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  const place = typeof tenderValue === "string" ? tenderValue.toLowerCase() : null;
  if (!place) return uncertain("Place of performance not specified in tender.");

  const regions = company.regions ?? [];
  if (regions.length === 0) return uncertain("Company operating regions not on file.");

  // NUTS code (e.g. DEA5B) → federal state → is any company region word inside that state?
  const nuts1 = NUTS1[place.slice(0, 3).toUpperCase()];
  if (/^de[0-9a-g]/i.test(place) && nuts1) {
    const lowerRegions = regions.map((r) => r.toLowerCase());
    const inState = lowerRegions.some((r) => nuts1.words.some((w) => r.includes(w) || w.includes(r)));
    if (inState) return pass(`Place of performance ${tenderValue} lies in ${nuts1.state}, one of the company's stated regions (${regions.join(", ")}).`);
    // Whole-country wording only; "northern germany" is a part, not the whole.
    const germanyWide = lowerRegions.some((r) => /^(deutschland|germany|bundesweit|nationwide|deutschlandweit|germany-wide)$/.test(r.trim()));
    if (germanyWide) return pass(`Place of performance ${tenderValue} (${nuts1.state}); the company works Germany-wide.`);
    return fail(`Place of performance ${tenderValue} lies in ${nuts1.state}, outside the company's stated regions (${regions.join(", ")}${company.radius_km ? `, ~${company.radius_km} km radius` : ""}).`);
  }

  const match = regions.some(
    (r) => place.includes(r.toLowerCase()) || r.toLowerCase().includes(place),
  );
  if (match) return pass(`Tender location "${tenderValue}" is within company operating regions.`);

  const radius = company.radius_km;
  if (radius !== null && radius !== undefined) {
    return uncertain(
      `Tender location "${tenderValue}" not in stated regions — distance check requires coordinates (radius ${radius} km on file).`,
    );
  }
  return fail(`Tender location "${tenderValue}" is outside company operating regions: ${regions.join(", ")}.`);
}

function checkConstructionWindow(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  // tenderValue may be a string date range like "2026-03-01 – 2026-09-30" or an object
  const raw = typeof tenderValue === "string" ? tenderValue : JSON.stringify(tenderValue ?? "");
  if (!raw || raw === "null") return uncertain("Construction window not specified in tender.");

  const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return uncertain('Tender start date cannot be established.');
  const availability = company.capacity?.find(r => r.type === 'CREW_AVAILABILITY' && r.status === 'CONFIRMED' && r.state !== 'AMBIGUOUS' && r.available_from);
  if (!availability?.available_from) return uncertain('Company crew availability is unknown or ambiguous.');
  return dateMatch[1] >= availability.available_from
    ? pass(`Company crews available from ${availability.available_from}.`)
    : fail(`Tender starts before stated crew availability ${availability.available_from}.`);

}

function checkSubmissionDeadline(tenderValue: unknown): RuleResult {
  const raw = typeof tenderValue === "string" ? tenderValue : null;
  if (!raw) return uncertain("Submission deadline not specified.");

  const deadline = new Date(raw);
  if (isNaN(deadline.getTime())) {
    return uncertain(`Submission deadline "${raw}" could not be parsed.`);
  }
  if (deadline <= new Date()) {
    return fail(`Submission deadline ${raw} has already passed.`);
  }
  return pass(`Submission deadline ${raw} is in the future.`);
}

function checkConsortium(tenderValue: unknown): RuleResult {
  if (tenderValue === true || tenderValue === "yes" || tenderValue === "allowed") {
    return pass("Consortium bids are allowed.");
  }
  if (tenderValue === false || tenderValue === "no" || tenderValue === "not allowed") {
    return uncertain("Consortium bids are not allowed — solo bid only.");
  }
  return uncertain(`Consortium rules unclear: "${String(tenderValue)}".`);
}

function checkSideOffers(tenderValue: unknown): RuleResult {
  if (tenderValue === true || tenderValue === "yes" || tenderValue === "allowed") return pass("Side offers (Nebenangebote) are permitted.");
  if (tenderValue === false || tenderValue === "no" || tenderValue === "not-allowed" || tenderValue === "not allowed") return pass("Side offers are not permitted; main offer only.");
  return uncertain(`Side offers rule unclear: "${String(tenderValue)}".`);
}

function checkLots(tenderValue: unknown): RuleResult {
  const count = extractNumber(tenderValue);
  if (count === null) return uncertain("Lot structure not specified.");
  if (count <= 1) return pass("Single lot — no lot-selection complexity.");
  return pass(`${count} lots — individual lot evaluation applies.`);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function runRuleMatcher(task: MatchingTask, company: CanonicalCompany): MatchResult {
  let result: RuleResult;

  switch (task.requirement_id) {
    case "estimated_value":
      result = checkEstimatedValue(task.tender_value, company);
      break;
    case "guarantees":
      result = checkGuarantees(task.tender_value, company);
      break;
    case "self_performance_min_pct":
      result = checkSelfPerformance(task.tender_value, company);
      break;
    case "place_of_performance":
      result = checkPlaceOfPerformance(task.tender_value, company);
      break;
    case "construction_window":
      result = checkConstructionWindow(task.tender_value, company);
      break;
    case "submission_deadline":
      result = checkSubmissionDeadline(task.tender_value);
      break;
    case "consortium_allowed":
      result = checkConsortium(task.tender_value);
      break;
    case "side_offers_allowed":
      result = checkSideOffers(task.tender_value);
      break;
    case "lots":
      result = checkLots(task.tender_value);
      break;
    default:
      result = uncertain(`No rule defined for requirement "${task.requirement_id}".`);
  }

  return {
    id: genId("RES"),
    task_id: task.id,
    requirement_id: task.requirement_id,
    label: task.label,
    status: result.status as MatchStatus,
    severity: result.severity_override ?? task.severity,
    method: result.method,
    layer: "HARD_GATE",
    reason: result.reason,
    tender_evidence: task.tender_evidence,
    company_evidence: [],
    company_fact: companyFact(task.requirement_id, company),
    aspect: task.aspect,
  };
}

/** The company side of a deterministic comparison, for the card's "company says" column. */
function companyFact(requirementId: string, company: CanonicalCompany): string | null {
  const cp = company.commercial_profile;
  switch (requirementId) {
    case "estimated_value":
      return `${formatEur(cp.contract_min_eur)}–${formatEur(cp.contract_max_eur)}`;
    case "guarantees":
      return cp.guarantee_capacity_eur != null ? `${formatEur(cp.guarantee_capacity_eur)} guarantee capacity` : null;
    case "self_performance_min_pct":
      return cp.self_perform_share_pct != null ? `${cp.self_perform_share_pct} % self-performed` : null;
    case "place_of_performance":
      return `${(company.regions ?? []).join(", ")}${company.radius_km ? `, ~${company.radius_km} km` : ""}` || null;
    case "construction_window": {
      const a = company.capacity?.find((r) => r.type === "CREW_AVAILABILITY");
      return a ? `crews available from ${a.available_from ?? a.raw_value ?? "unknown"}` : null;
    }
    case "trade_scope":
      return (company.cpv_prefixes ?? []).length ? `CPV ${(company.cpv_prefixes ?? []).join(", ")}` : null;
    default:
      return null;
  }
}

/** trade_scope as a deterministic CPV-prefix check; null when the company lists no CPV prefixes. */
export function checkCpvScope(task: MatchingTask, company: CanonicalCompany): MatchResult | null {
  const prefixes = company.cpv_prefixes ?? [];
  const cpv = String(task.tender_value);
  if (prefixes.length === 0) return null;
  const hit = prefixes.find((p) => cpv.startsWith(p));
  const label = task.context?.cpv_label ? ` (${task.context.cpv_label})` : "";
  const result: RuleResult = hit
    ? pass(`CPV ${cpv}${label} matches the company's stated trade prefix ${hit}.`)
    : fail(`CPV ${cpv}${label} matches none of the company's stated trade prefixes (${prefixes.join(", ")}).`);
  return {
    id: genId("RES"), task_id: task.id, requirement_id: task.requirement_id, label: task.label,
    status: result.status, severity: task.severity, method: result.method, layer: "HARD_GATE",
    reason: result.reason, tender_evidence: task.tender_evidence, company_evidence: [],
    company_fact: companyFact("trade_scope", company), aspect: task.aspect,
  };
}

/** eForms BT-67 exclusion-ground codes, e.g. "bankr-nat; corruption; crime-org; ...". */
export function isExclusionGrounds(value: unknown): boolean {
  return typeof value === "string" && /\b(corruption|bankr-nat|crime-org|fraud|tax-pay|socsec-pay|misrepres)\b/.test(value);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const v = obj["value"] ?? obj["amount"] ?? obj["eur"];
    return extractNumber(v);
  }
  return null;
}
