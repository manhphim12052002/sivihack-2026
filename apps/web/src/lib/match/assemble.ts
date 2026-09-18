import { db } from "@/lib/db";
import { genId } from "@/lib/id";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { generateTasks } from "./tasks";
import { routeAndRun } from "./router";
import type {
  BidScope,
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
  TenderFactSheet,
  Fact,
} from "./types";
import type { Lot } from "@/lib/api-types";

// ─── Lot-scoped fact sheet ────────────────────────────────────────────────────

function makeFact(value: unknown): Fact {
  return { value, confidence: "high", evidence: [] };
}

/**
 * Build a fact sheet for a single lot evaluation.
 * Tender-level facts are inherited; lot-specific trade and value override.
 * The `lots` fact is stripped (not relevant per-lot).
 */
function buildLotFactSheet(
  lot: Lot,
  tenderFactSheet: TenderFactSheet | null | undefined,
): TenderFactSheet {
  const base = { ...(tenderFactSheet ?? {}) } as Record<string, Fact | undefined>;
  delete base["lots"]; // lots count is a tender-level fact, not per-lot

  // Lot-specific overrides
  if (lot.trade) {
    base["trade_scope"] = makeFact(lot.trade);
  }
  if (lot.value_eur !== null && lot.value_eur !== undefined) {
    base["estimated_value"] = makeFact(lot.value_eur);
  }

  return base as TenderFactSheet;
}

// ─── Viability ────────────────────────────────────────────────────────────────

function computeViability(results: MatchResult[]): ViabilityResult {
  const hardFails     = results.filter((r) => r.status === "FAIL"      && r.severity === "HARD");
  const hardUncertain = results.filter((r) => r.status === "UNCERTAIN" && r.severity === "HARD");
  const softConcerns  = results.filter((r) => r.status !== "PASS"      && r.severity === "SOFT");

  let status: ViabilityStatus;
  if (hardFails.length > 0)     status = "BLOCKED";
  else if (hardUncertain.length > 0) status = "REVIEW";
  else                          status = "VIABLE";

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
  bidScope: BidScope,
  results: MatchResult[],
  gaps: KnowledgeGapEntry[],
  viability: ViabilityResult,
): Promise<void> {
  await db.from("match_evaluations").upsert({
    id: evaluationId,
    tender_id: tenderId,
    company_id: companyId,
    scope_type: bidScope.type === "LOT" ? "LOT" : "WHOLE_TENDER",
    scope_id: bidScope.lot_id,
    status: viability.status,
    hard_blockers: viability.hard_blockers,
    hard_unknowns: viability.hard_unknowns,
    soft_concerns: viability.soft_concerns,
    updated_at: new Date().toISOString(),
  });

  for (const result of results) {
    await db.from("matching_tasks").upsert({
      id: result.task_id,
      evaluation_id: evaluationId,
      requirement_id: result.requirement_id,
      label: result.label,
      matcher_type: result.method,
      severity: result.severity,
    });
  }

  for (const result of results) {
    await db.from("match_results").upsert({
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

  await db.from("match_knowledge_gaps").delete().eq("evaluation_id", evaluationId);
  for (const gap of gaps) {
    await db.from("match_knowledge_gaps").insert({
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
  const { data: evalRow } = await db
    .from("match_evaluations")
    .select("*")
    .eq("id", evaluationId)
    .single();
  if (!evalRow) return null;
  const row = evalRow as MatchEvaluationRow;

  const { data: resultRows } = await db
    .from("match_results")
    .select("*")
    .eq("evaluation_id", evaluationId);

  const { data: gapRows } = await db
    .from("match_knowledge_gaps")
    .select("*")
    .eq("evaluation_id", evaluationId);

  const results: MatchResult[] = ((resultRows ?? []) as MatchResultRow[]).map((r) => ({
    id: r.id,
    task_id: r.task_id,
    requirement_id: r.task_id,
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

  const bidScope: BidScope = {
    type: row.scope_type === "LOT" ? "LOT" : "TENDER",
    lot_id: row.scope_id,
    lot_title: null,
  };

  return {
    id: row.id,
    tender_id: row.tender_id,
    company_id: row.company_id,
    scope_type: row.scope_type as "WHOLE_TENDER" | "LOT",
    scope_id: row.scope_id,
    bid_scope: bidScope,
    matrix,
    viability,
    created_at: row.created_at,
  };
}

// ─── Core evaluation (single scope) ──────────────────────────────────────────

async function runScopedEvaluation(
  tender: TenderDetail,
  company: CanonicalCompany,
  factSheet: TenderFactSheet | null,
  bidScope: BidScope,
): Promise<MatchEvaluation> {
  const evaluationId = genId("EVAL");

  const { tasks, skipped_gaps } = generateTasks(
    factSheet,
    (reqId) => getCompanyValue(reqId, company),
    company,
  );

  const results: MatchResult[] = await Promise.all(
    tasks.map((task) => routeAndRun(task, company)),
  );

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

  await persistEvaluation(evaluationId, tender.id, company.company_id, bidScope, results, gaps, viability);

  return {
    id: evaluationId,
    tender_id: tender.id,
    company_id: company.company_id,
    scope_type: bidScope.type === "LOT" ? "LOT" : "WHOLE_TENDER",
    scope_id: bidScope.lot_id,
    bid_scope: bidScope,
    matrix,
    viability,
    created_at: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Evaluate a company against a specific lot (or whole tender when lotId is omitted). */
export async function runMatchEvaluation(
  tender: TenderDetail,
  companyId: string,
  lotId?: string,
): Promise<MatchEvaluation> {
  const company = await assembleCanonicalCompany(companyId);

  if (lotId) {
    const lot = (tender.lots ?? []).find((l) => l.id === lotId);
    if (!lot) throw new Error(`Lot ${lotId} not found in tender ${tender.id}`);
    const lotFactSheet = buildLotFactSheet(lot, tender.fact_sheet);
    const bidScope: BidScope = {
      type: "LOT",
      lot_id: lot.id,
      lot_title: lot.title ?? null,
    };
    return runScopedEvaluation(tender, company, lotFactSheet, bidScope);
  }

  const bidScope: BidScope = { type: "TENDER", lot_id: null, lot_title: null };
  return runScopedEvaluation(tender, company, tender.fact_sheet ?? null, bidScope);
}

/** Evaluate a company against every lot in a multi-lot tender (or whole tender if no lots). */
export async function runAllLotEvaluations(
  tender: TenderDetail,
  companyId: string,
): Promise<MatchEvaluation[]> {
  const lots = tender.lots ?? [];

  if (lots.length <= 1 || tender.lot_count <= 1) {
    return [await runMatchEvaluation(tender, companyId)];
  }

  const company = await assembleCanonicalCompany(companyId);

  return Promise.all(
    lots.map((lot) => {
      const lotFactSheet = buildLotFactSheet(lot, tender.fact_sheet);
      const bidScope: BidScope = {
        type: "LOT",
        lot_id: lot.id,
        lot_title: lot.title ?? null,
      };
      return runScopedEvaluation(tender, company, lotFactSheet, bidScope);
    }),
  );
}
