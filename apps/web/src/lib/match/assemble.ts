import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { generateTasks } from "./tasks";
import { routeAndRun } from "./router";
import type {
  MatchEvaluation,
  MatchEvaluationRow,
  MatchResult,
  MatchResultRow,
  MatchKnowledgeGapRow,
  ViabilityResult,
  ViabilityStatus,
  EvaluationMatrix,
  KnowledgeGapEntry,
  CanonicalCompany,
  TenderDetail,
} from "./types";

// ─── Viability ────────────────────────────────────────────────────────────────

function computeViability(results: MatchResult[]): ViabilityResult {
  const hardFails     = results.filter((r) => r.status === "FAIL" && r.severity === "HARD");
  const hardUncertain = results.filter((r) => r.status === "UNCERTAIN" && r.severity === "HARD");
  const softConcerns  = results.filter((r) => r.status !== "PASS" && r.severity === "SOFT");

  let status: ViabilityStatus;
  if (hardFails.length > 0) status = "BLOCKED";
  else if (hardUncertain.length > 0) status = "REVIEW";
  else status = "VIABLE";

  return {
    status,
    hard_blockers: hardFails.length,
    hard_unknowns: hardUncertain.length,
    soft_concerns: softConcerns.length,
  };
}

// ─── Company value extractor for task generation ──────────────────────────────

function getCompanyValue(requirementId: string, company: CanonicalCompany): unknown {
  switch (requirementId) {
    case "estimated_value":
      return {
        min: company.commercial_profile.contract_min_eur,
        max: company.commercial_profile.contract_max_eur,
      };
    case "guarantees":
      return company.commercial_profile.guarantee_capacity_eur;
    case "self_performance_min_pct":
      return company.commercial_profile.self_perform_share_pct;
    case "place_of_performance":
      return company.regions;
    case "trade_scope":
      return company.capabilities.map((c) => (c as { type: string }).type);
    case "eligibility_proofs":
      return company.qualifications.map((q) => (q as { type: string }).type);
    case "references_required":
      return company.references.length;
    default:
      return null;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function persistEvaluation(
  evaluationId: string,
  tenderId: string,
  companyId: string,
  results: MatchResult[],
  gaps: KnowledgeGapEntry[],
  viability: ViabilityResult,
): Promise<void> {
  // Upsert evaluation row
  await supabase.from("match_evaluations").upsert({
    id: evaluationId,
    tender_id: tenderId,
    company_id: companyId,
    scope_type: "WHOLE_TENDER",
    scope_id: null,
    status: viability.status,
    hard_blockers: viability.hard_blockers,
    hard_unknowns: viability.hard_unknowns,
    soft_concerns: viability.soft_concerns,
    updated_at: new Date().toISOString(),
  });

  // Insert tasks (use result task_ids as proxy — task rows inserted inline)
  for (const result of results) {
    await supabase.from("matching_tasks").upsert({
      id: result.task_id,
      evaluation_id: evaluationId,
      requirement_id: result.requirement_id,
      label: result.label,
      matcher_type: result.method,
      severity: result.severity,
    });
  }

  // Insert results
  for (const result of results) {
    await supabase.from("match_results").upsert({
      id: result.id,
      evaluation_id: evaluationId,
      task_id: result.task_id,
      status: result.status,
      severity: result.severity,
      method: result.method,
      reason: result.reason,
      tender_evidence: result.tender_evidence,
      company_evidence: result.company_evidence,
      aspect: result.aspect,
    });
  }

  // Clear and re-insert knowledge gaps
  await supabase.from("match_knowledge_gaps").delete().eq("evaluation_id", evaluationId);
  for (const gap of gaps) {
    await supabase.from("match_knowledge_gaps").insert({
      id: genId("GAP"),
      evaluation_id: evaluationId,
      task_id: gap.task_id || null,
      concept: gap.concept,
      importance: gap.importance,
      triggered_by: gap.triggered_by,
    });
  }
}

// ─── Re-hydration from DB ─────────────────────────────────────────────────────

export async function loadMatchEvaluation(evaluationId: string): Promise<MatchEvaluation | null> {
  const { data: evalRow } = await supabase
    .from("match_evaluations")
    .select("*")
    .eq("id", evaluationId)
    .single();
  if (!evalRow) return null;
  const row = evalRow as MatchEvaluationRow;

  const { data: resultRows } = await supabase
    .from("match_results")
    .select("*")
    .eq("evaluation_id", evaluationId);

  const { data: gapRows } = await supabase
    .from("match_knowledge_gaps")
    .select("*")
    .eq("evaluation_id", evaluationId);

  const results: MatchResult[] = ((resultRows ?? []) as MatchResultRow[]).map((r) => ({
    id: r.id,
    task_id: r.task_id,
    requirement_id: r.task_id, // approximation; real requirement_id from matching_tasks
    label: r.reason,
    status: (r.override_status ?? r.status) as "PASS" | "FAIL" | "UNCERTAIN",
    severity: r.severity as "HARD" | "SOFT",
    method: r.method,
    reason: r.reason,
    tender_evidence: r.tender_evidence ?? [],
    company_evidence: r.company_evidence ?? [],
    aspect: (r.aspect ?? "SCOPE_CAPABILITY") as MatchResult["aspect"],
  }));

  const gaps: KnowledgeGapEntry[] = ((gapRows ?? []) as MatchKnowledgeGapRow[]).map((g) => ({
    concept: g.concept,
    importance: g.importance as "HARD" | "SOFT",
    triggered_by: g.triggered_by ?? "",
    task_id: g.task_id ?? "",
  }));

  const viability = computeViability(results);
  const matrix: EvaluationMatrix = {
    evaluation_id: evaluationId,
    results,
    hard_blockers: results.filter((r) => r.status === "FAIL" && r.severity === "HARD"),
    soft_concerns: results.filter((r) => r.status !== "PASS" && r.severity === "SOFT"),
    knowledge_gaps: gaps,
  };

  return {
    id: row.id,
    tender_id: row.tender_id,
    company_id: row.company_id,
    scope_type: row.scope_type as "WHOLE_TENDER" | "LOT",
    scope_id: row.scope_id,
    matrix,
    viability,
    created_at: row.created_at,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runMatchEvaluation(
  tender: TenderDetail,
  companyId: string,
): Promise<MatchEvaluation> {
  const evaluationId = genId("EVAL");

  // Load canonical company from our Supabase pipeline
  const company = await assembleCanonicalCompany(companyId);

  // Generate tasks from TenderFactSheet
  const { tasks, skipped_gaps } = generateTasks(
    tender.fact_sheet ?? null,
    (reqId) => getCompanyValue(reqId, company),
  );

  // Run all matchers
  const results: MatchResult[] = await Promise.all(
    tasks.map((task) => routeAndRun(task, company)),
  );

  // Knowledge gaps: from skipped HARD fields + HARD UNCERTAIN results
  const gaps: KnowledgeGapEntry[] = [
    ...skipped_gaps,
    ...results
      .filter((r) => r.status === "UNCERTAIN" && r.severity === "HARD")
      .map((r) => ({
        concept: r.requirement_id.toUpperCase(),
        importance: "HARD" as const,
        triggered_by: r.requirement_id,
        task_id: r.task_id,
      })),
  ];

  const viability = computeViability(results);

  const matrix: EvaluationMatrix = {
    evaluation_id: evaluationId,
    results,
    hard_blockers: results.filter((r) => r.status === "FAIL" && r.severity === "HARD"),
    soft_concerns: results.filter((r) => r.status !== "PASS" && r.severity === "SOFT"),
    knowledge_gaps: gaps,
  };

  await persistEvaluation(evaluationId, tender.id, companyId, results, gaps, viability);

  return {
    id: evaluationId,
    tender_id: tender.id,
    company_id: companyId,
    scope_type: "WHOLE_TENDER",
    scope_id: null,
    matrix,
    viability,
    created_at: new Date().toISOString(),
  };
}
