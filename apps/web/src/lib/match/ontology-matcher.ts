import { genId } from "@/lib/id";
import {
  normalizeCapabilityType,
  normalizeQualificationType,
  computeFreshness,
} from "@/lib/company/normalize";
import type { MatchingTask, MatchResult, MatchStatus, CanonicalCompany } from "./types";
import type { CapabilityRow, QualificationRow } from "@/lib/company/types";

type OntologyResult = Pick<MatchResult, "status" | "method" | "reason" | "company_evidence">;

// ─── Capability matching ──────────────────────────────────────────────────────

function matchCapabilities(
  tenderValue: unknown,
  capabilities: Array<CapabilityRow & { status: string }>,
): OntologyResult {
  const confirmed = capabilities.filter((c) => c.status === "CONFIRMED");
  if (confirmed.length === 0) {
    return {
      status: "UNCERTAIN",
      method: "ONTOLOGY",
      reason: "No confirmed capabilities on file — cannot verify scope match.",
      company_evidence: [],
    };
  }

  // Extract required capability types from tender value (string or string[])
  const labels: string[] = [];
  if (typeof tenderValue === "string") labels.push(tenderValue);
  else if (Array.isArray(tenderValue)) labels.push(...(tenderValue as string[]));

  if (labels.length === 0) {
    return {
      status: "UNCERTAIN",
      method: "ONTOLOGY",
      reason: "Trade scope not parseable from tender fact.",
      company_evidence: [],
    };
  }

  const required = labels.map((l) => normalizeCapabilityType(l));
  const companyTypes = new Set(confirmed.map((c) => c.type));

  const matched = required.filter((r) => companyTypes.has(r) || r === "OTHER");
  const unmatched = required.filter((r) => !companyTypes.has(r) && r !== "OTHER");

  if (unmatched.length === 0) {
    return {
      status: "PASS",
      method: "ONTOLOGY",
      reason: `Company capabilities cover required scope: ${required.join(", ")}.`,
      company_evidence: confirmed.filter((c) => required.includes(c.type as typeof required[number])).map((c) => c.id),
    };
  }

  if (matched.length > 0) {
    return {
      status: "UNCERTAIN",
      method: "ONTOLOGY",
      reason: `Partial match — company covers ${matched.join(", ")} but not ${unmatched.join(", ")}.`,
      company_evidence: confirmed.map((c) => c.id),
    };
  }

  return {
    status: "FAIL",
    method: "ONTOLOGY",
    reason: `Company capabilities (${[...companyTypes].join(", ")}) do not match required scope: ${required.join(", ")}.`,
    company_evidence: confirmed.map((c) => c.id),
  };
}

// ─── Qualification matching ───────────────────────────────────────────────────

function matchQualifications(
  tenderValue: unknown,
  qualifications: Array<QualificationRow & { freshness: string }>,
): OntologyResult {
  const confirmed = qualifications.filter((q) => q.status === "CONFIRMED");

  // Extract qualification labels from tender
  const labels: string[] = [];
  if (typeof tenderValue === "string") labels.push(tenderValue);
  else if (Array.isArray(tenderValue)) labels.push(...(tenderValue as string[]));

  if (labels.length === 0) {
    return {
      status: "UNCERTAIN",
      method: "ONTOLOGY",
      reason: "Eligibility proof requirements not parseable from tender fact.",
      company_evidence: [],
    };
  }

  const results: Array<{ type: string; status: MatchStatus; note: string; ids: string[] }> = [];

  for (const label of labels) {
    const required = normalizeQualificationType(label);
    const matching = confirmed.filter((q) => q.type === required);

    if (matching.length === 0) {
      const pending = qualifications.find((q) => q.type === required);
      results.push({
        type: required,
        status: pending ? "UNCERTAIN" : "FAIL",
        note: pending
          ? `${required} found in documents but not yet confirmed.`
          : `No evidence for ${required} (${label}).`,
        ids: [],
      });
    } else {
      const expired = matching.filter((q) => q.freshness === "EXPIRED");
      const current = matching.filter((q) => q.freshness !== "EXPIRED");
      if (current.length > 0) {
        const expiring = current.filter((q) => q.freshness === "EXPIRING");
        results.push({
          type: required,
          status: "PASS",
          note: expiring.length > 0 ? `${required} confirmed but expiring soon.` : `${required} confirmed and current.`,
          ids: current.map((q) => q.id),
        });
      } else {
        results.push({
          type: required,
          status: "FAIL",
          note: `${required} is expired.`,
          ids: expired.map((q) => q.id),
        });
      }
    }
  }

  const allIds = results.flatMap((r) => r.ids);
  const anyFail = results.some((r) => r.status === "FAIL");
  const anyUncertain = results.some((r) => r.status === "UNCERTAIN");
  const notes = results.map((r) => r.note).join(" ");

  if (anyFail) return { status: "FAIL", method: "ONTOLOGY", reason: notes, company_evidence: allIds };
  if (anyUncertain) return { status: "UNCERTAIN", method: "ONTOLOGY", reason: notes, company_evidence: allIds };
  return { status: "PASS", method: "ONTOLOGY", reason: notes, company_evidence: allIds };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function runOntologyMatcher(task: MatchingTask, company: CanonicalCompany): MatchResult {
  let result: OntologyResult;

  if (task.requirement_id === "trade_scope") {
    result = matchCapabilities(task.tender_value, company.capabilities as Array<CapabilityRow & { status: string }>);
  } else if (task.requirement_id === "eligibility_proofs") {
    const quals = company.qualifications.map((q) => ({
      ...q,
      freshness: computeFreshness(q.valid_until ?? null),
    })) as Array<QualificationRow & { freshness: string }>;
    result = matchQualifications(task.tender_value, quals);
  } else {
    result = {
      status: "UNCERTAIN",
      method: "ONTOLOGY",
      reason: `No ontology matcher defined for "${task.requirement_id}".`,
      company_evidence: [],
    };
  }

  return {
    id: genId("RES"),
    task_id: task.id,
    requirement_id: task.requirement_id,
    label: task.label,
    status: result.status,
    severity: task.severity,
    method: result.method,
    reason: result.reason,
    tender_evidence: task.tender_evidence,
    company_evidence: result.company_evidence,
    aspect: task.aspect,
  };
}
