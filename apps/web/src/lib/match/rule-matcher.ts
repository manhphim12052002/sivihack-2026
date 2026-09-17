import { genId } from "@/lib/id";
import { formatEur } from "@/lib/status";
import type { MatchingTask, MatchResult, MatchStatus, CanonicalCompany } from "./types";

type RuleResult = Pick<MatchResult, "status" | "method" | "reason">;

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

  if (min !== null && min !== undefined && value < min) {
    return fail(`Tender value ${formatEur(value)} is below company minimum ${formatEur(min)}.`);
  }
  if (max !== null && max !== undefined && value > max) {
    return fail(`Tender value ${formatEur(value)} exceeds company maximum ${formatEur(max)}.`);
  }
  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return uncertain("Company contract size limits not on file.");
  }
  return pass(`Tender value ${formatEur(value)} is within company range (${formatEur(min ?? null)}–${formatEur(max ?? null)}).`);
}

function checkGuarantees(tenderValue: unknown, company: CanonicalCompany): RuleResult {
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

function checkPlaceOfPerformance(tenderValue: unknown, company: CanonicalCompany): RuleResult {
  const place = typeof tenderValue === "string" ? tenderValue.toLowerCase() : null;
  if (!place) return uncertain("Place of performance not specified in tender.");

  const regions = company.regions ?? [];
  if (regions.length === 0) return uncertain("Company operating regions not on file.");

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

  const earliest = company.regions; // not directly applicable here
  // Extract a start date from the tender value string
  const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return uncertain(`Construction window present ("${raw}") but not parseable as a date.`);

  const tenderStart = new Date(dateMatch[1]);
  const companyEarliest = company.identity
    ? null
    : null; // earliest_start not in CanonicalCompany identity; use raw_text fallback

  // We don't have earliest_start in CanonicalCompany directly — mark as uncertain
  // unless the date is clearly in the future
  const now = new Date();
  if (tenderStart < now) {
    return fail(`Construction window starts ${dateMatch[1]}, which is in the past.`);
  }
  return uncertain(`Construction window "${raw}" — company capacity calendar not on file.`);
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
  if (tenderValue === true || tenderValue === "yes") return pass("Side offers are permitted.");
  if (tenderValue === false || tenderValue === "no") return pass("Side offers not relevant (not required).");
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
    severity: task.severity,
    method: result.method,
    reason: result.reason,
    tender_evidence: task.tender_evidence,
    company_evidence: [],
    aspect: task.aspect,
  };
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
