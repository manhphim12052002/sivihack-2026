/**
 * Map an evaluation card onto the `Verdict` shape the triage board and the briefing header
 * already render, so the UI components stay untouched while the engine behind them changes.
 *   BLOCKED → NoGo · REVIEW → Consider · VIABLE → Bid
 *   HARD FAIL → Blocker · SOFT non-PASS → Risk · UNCERTAIN (HARD) → Unknown · PASS → OK
 */
import type { CriterionResult, Verdict } from "@/lib/api";
import type { MatchEvaluation, MatchResult } from "./types";

const OVERALL: Record<MatchEvaluation["viability"]["status"], Verdict["overall"]> = {
  BLOCKED: "NoGo",
  REVIEW: "Consider",
  VIABLE: "Bid",
};

function statusOf(r: MatchResult): CriterionResult["status"] {
  if (r.status === "PASS") return "OK";
  if (r.status === "FAIL") return r.severity === "HARD" ? "Blocker" : "Risk";
  return r.severity === "HARD" ? "Unknown" : "Risk";
}

export function resultToCriterion(r: MatchResult): CriterionResult {
  return {
    criterion: r.label,
    status: statusOf(r),
    kind: r.layer === "SEMANTIC" ? "semantic" : "numeric",
    reason_en: r.reasoning ? `${r.reason} ${r.reasoning}` : r.reason,
    tender_evidence: r.tender_evidence,
    tender_value: null,
    company_fact: r.company_fact ?? (r.company_evidence.length ? r.company_evidence.join(", ") : null),
  };
}

export function evaluationToVerdict(evaluation: MatchEvaluation, companyId: string): Verdict {
  const criteria = evaluation.matrix.results.map(resultToCriterion);
  const blockers = criteria.filter((c) => c.status === "Blocker").length;
  const risks = criteria.filter((c) => c.status === "Risk").length;
  const unknowns = criteria.filter((c) => c.status === "Unknown").length;
  const overall = OVERALL[evaluation.viability.status];

  const lead =
    evaluation.matrix.hard_blockers[0]?.reason ??
    evaluation.matrix.results.find((r) => r.status === "UNCERTAIN" && r.severity === "HARD")?.reason ??
    evaluation.matrix.results.find((r) => r.layer === "SEMANTIC" && r.status === "PASS")?.reason ??
    "Every checked requirement passes against the company's stated profile.";
  const skipped = evaluation.skipped_semantic
    ? ` ${evaluation.skipped_semantic} document check${evaluation.skipped_semantic > 1 ? "s" : ""} not run: the lot is already blocked.`
    : "";

  return {
    tender_id: evaluation.tender_id,
    company_id: companyId,
    overall,
    criteria,
    summary_en: `${lead}${skipped}`,
    blockers,
    risks,
    unknowns,
    rank: null,
  };
}

/** Desk order among the "Bid" verdicts: fewest risks first, then the value hint. A stated rule, not a score. */
export function rankVerdicts(verdicts: Verdict[], tenderValue: (tenderId: string) => number | null): Verdict[] {
  const bidVerdicts = verdicts.filter((v) => v.overall === "Bid");
  const ranked = [...bidVerdicts].sort((a, b) => {
    if (a.risks !== b.risks) return a.risks - b.risks;
    return (tenderValue(b.tender_id) ?? 0) - (tenderValue(a.tender_id) ?? 0);
  });
  const rankById = new Map(ranked.map((v, index) => [v.tender_id, index + 1]));
  return verdicts.map((v) => ({ ...v, rank: rankById.get(v.tender_id) ?? null }));
}
