/**
 * The decision engine's orchestration: one evaluation = one lot × one company × one bid scope.
 *
 * Two ordered layers (docs/arctis_matching_engine.md, re-scoped 18.09):
 *   LAYER 1  hard gate — deterministic matchers (RULE, ONTOLOGY, CONSTRAINT) over typed facts
 *            and typed company constraints; runs on every lot; any HARD FAIL ⇒ BLOCKED and
 *            layer 2 is skipped, so the model is never paid for a lot that is out anyway.
 *   LAYER 2  semantic reasoning — SEMANTIC and REFERENCE matchers read the lot's document
 *            passages plus the company evidence and argue per condition, quoting the documents.
 * Viability is a stated rule, not a score: HARD FAIL → BLOCKED, HARD UNCERTAIN → REVIEW, else VIABLE.
 */
import { db } from "@/lib/db";
import { genId } from "@/lib/id";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { loadLotPassages } from "@/lib/tender/db";
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
  TenderDetailWithDocuments,
  TenderFactSheet,
  Fact,
  Passage,
  MatchingTask,
} from "./types";
import type { Lot } from "@/lib/api-types";

const SEMANTIC_MATCHERS = new Set(["SEMANTIC", "REFERENCE"]);

// ─── Lot-scoped fact sheet ────────────────────────────────────────────────────

function makeFact(value: unknown): Fact {
  return { value, confidence: "high", evidence: [] };
}

/**
 * Build a fact sheet for a single lot evaluation.
 * Tender-level facts are inherited; lot-specific trade and value override.
 * The `lots` fact is stripped (not relevant per-lot).
 */
function buildLotFactSheet(lot: Lot, tenderFactSheet: TenderFactSheet | null | undefined): TenderFactSheet {
  const base = { ...(tenderFactSheet ?? {}) } as Record<string, Fact | undefined>;
  delete base["lots"]; // lots count is a tender-level fact, not per-lot

  if (lot.trade) base["trade_scope"] = makeFact(lot.trade);
  if (lot.value_eur !== null && lot.value_eur !== undefined) base["estimated_value"] = makeFact(lot.value_eur);

  return base as TenderFactSheet;
}

// ─── Viability ────────────────────────────────────────────────────────────────

export function computeViability(results: MatchResult[]): ViabilityResult {
  const hardFails     = results.filter((r) => r.status === "FAIL"      && r.severity === "HARD");
  const hardUncertain = results.filter((r) => r.status === "UNCERTAIN" && r.severity === "HARD");
  const softConcerns  = results.filter((r) => r.status !== "PASS"      && r.severity === "SOFT");

  let status: ViabilityStatus;
  if (hardFails.length > 0)          status = "BLOCKED";
  else if (hardUncertain.length > 0) status = "REVIEW";
  else                               status = "VIABLE";

  return { status, hard_blockers: hardFails.length, hard_unknowns: hardUncertain.length, soft_concerns: softConcerns.length };
}

// ─── Company value extractor for task generation ──────────────────────────────

function getCompanyValue(requirementId: string, company: CanonicalCompany): unknown {
  switch (requirementId) {
    case "estimated_value":
      return { min: company.commercial_profile.contract_min_eur, max: company.commercial_profile.contract_max_eur };
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

async function persistEvaluation(evaluation: MatchEvaluation, results: MatchResult[]): Promise<void> {
  const { viability, bid_scope } = evaluation;
  const head = await db.from("match_evaluations").upsert({
    id: evaluation.id,
    tender_id: evaluation.tender_id,
    company_id: evaluation.company_id,
    scope_type: bid_scope.type === "LOT" ? "LOT" : "WHOLE_TENDER",
    scope_id: bid_scope.lot_id,
    status: viability.status,
    hard_blockers: viability.hard_blockers,
    hard_unknowns: viability.hard_unknowns,
    soft_concerns: viability.soft_concerns,
    updated_at: new Date().toISOString(),
  });
  if (head.error) {
    console.warn("match_evaluations upsert failed:", head.error.message);
    return;
  }

  if (results.length) {
    await db.from("matching_tasks").upsert(
      results.map((r) => ({
        id: r.task_id, evaluation_id: evaluation.id, requirement_id: r.requirement_id,
        label: r.label, matcher_type: r.method, severity: r.severity,
      })),
    );
    await db.from("match_results").upsert(
      results.map((r) => ({
        id: r.id, evaluation_id: evaluation.id, task_id: r.task_id, status: r.status, severity: r.severity,
        method: r.method, reason: r.reasoning ? `${r.reason}\n\n${r.reasoning}` : r.reason,
        tender_evidence: r.tender_evidence, company_evidence: r.company_evidence, aspect: r.aspect,
      })),
    );
  }

  await db.from("match_knowledge_gaps").delete().eq("evaluation_id", evaluation.id);
  if (evaluation.matrix.knowledge_gaps.length) {
    await db.from("match_knowledge_gaps").insert(
      evaluation.matrix.knowledge_gaps.map((gap) => ({
        id: genId("GAP"), evaluation_id: evaluation.id, task_id: gap.task_id || null,
        concept: gap.concept, importance: gap.importance, triggered_by: gap.triggered_by,
      })),
    );
  }
}

// ─── Re-hydration from DB ─────────────────────────────────────────────────────

export async function loadMatchEvaluation(evaluationId: string): Promise<MatchEvaluation | null> {
  const { data: evalRow } = await db.from("match_evaluations").select("*").eq("id", evaluationId).single();
  if (!evalRow) return null;
  const row = evalRow as MatchEvaluationRow;

  const [{ data: resultRows }, { data: taskRows }, { data: gapRows }] = await Promise.all([
    db.from("match_results").select("*").eq("evaluation_id", evaluationId),
    db.from("matching_tasks").select("id,requirement_id,label").eq("evaluation_id", evaluationId),
    db.from("match_knowledge_gaps").select("*").eq("evaluation_id", evaluationId),
  ]);
  const taskById = new Map(((taskRows ?? []) as Array<{ id: string; requirement_id: string; label: string }>).map((t) => [t.id, t]));

  const results: MatchResult[] = ((resultRows ?? []) as MatchResultRow[]).map((r) => {
    const task = taskById.get(r.task_id);
    const [reason, ...rest] = r.reason.split("\n\n");
    return {
      id: r.id,
      task_id: r.task_id,
      requirement_id: task?.requirement_id ?? r.task_id,
      label: task?.label ?? r.task_id,
      status: (r.override_status ?? r.status) as MatchResult["status"],
      severity: r.severity as MatchResult["severity"],
      method: r.method,
      layer: SEMANTIC_MATCHERS.has(r.method) ? "SEMANTIC" : "HARD_GATE",
      reason: r.override_reason ? `${reason} (estimator override: ${r.override_reason})` : reason,
      reasoning: rest.join("\n\n") || undefined,
      tender_evidence: r.tender_evidence ?? [],
      company_evidence: r.company_evidence ?? [],
      aspect: (r.aspect ?? "SCOPE_CAPABILITY") as MatchResult["aspect"],
    };
  });

  const gaps: KnowledgeGapEntry[] = ((gapRows ?? []) as MatchKnowledgeGapRow[]).map((g) => ({
    concept: g.concept,
    importance: g.importance as "HARD" | "SOFT",
    triggered_by: g.triggered_by ?? "",
    task_id: g.task_id ?? "",
  }));

  return {
    id: row.id,
    tender_id: row.tender_id,
    company_id: row.company_id,
    scope_type: row.scope_type as "WHOLE_TENDER" | "LOT",
    scope_id: row.scope_id,
    bid_scope: { type: row.scope_type === "LOT" ? "LOT" : "TENDER", lot_id: row.scope_id, lot_title: null },
    matrix: buildMatrix(row.id, results, gaps),
    viability: computeViability(results),
    skipped_semantic: 0,
    stated_not_checked: [],
    documents: [],
    created_at: row.created_at,
  };
}

function buildMatrix(evaluationId: string, results: MatchResult[], gaps: KnowledgeGapEntry[]): EvaluationMatrix {
  return {
    evaluation_id: evaluationId,
    results,
    hard_blockers: results.filter((r) => r.status === "FAIL" && r.severity === "HARD"),
    soft_concerns: results.filter((r) => r.status !== "PASS" && r.severity === "SOFT"),
    knowledge_gaps: gaps,
  };
}

/**
 * Newest stored evaluation per tender for one company, in two queries. The triage board calls
 * this before computing anything: a lot screened earlier is rendered from the store, so switching
 * company on a 40-lot board costs two round trips, not forty evaluations.
 */
export async function loadStoredEvaluations(companyId: string, tenderIds: string[]): Promise<Map<string, MatchEvaluation>> {
  const out = new Map<string, MatchEvaluation>();
  if (tenderIds.length === 0) return out;
  const { data: heads } = await db
    .from("match_evaluations")
    .select("*")
    .eq("company_id", companyId)
    .in("tender_id", tenderIds)
    .order("updated_at", { ascending: false });
  const newest = new Map<string, MatchEvaluationRow>();
  for (const h of (heads ?? []) as MatchEvaluationRow[]) if (!newest.has(h.tender_id)) newest.set(h.tender_id, h);
  if (newest.size === 0) return out;

  const evalIds = [...newest.values()].map((h) => h.id);
  const [{ data: resultRows }, { data: taskRows }] = await Promise.all([
    db.from("match_results").select("*").in("evaluation_id", evalIds),
    db.from("matching_tasks").select("id,requirement_id,label").in("evaluation_id", evalIds),
  ]);
  const taskById = new Map(((taskRows ?? []) as Array<{ id: string; requirement_id: string; label: string }>).map((t) => [t.id, t]));
  const byEval = new Map<string, MatchResult[]>();
  for (const r of (resultRows ?? []) as MatchResultRow[]) {
    const task = taskById.get(r.task_id);
    const [reason, ...rest] = r.reason.split("\n\n");
    const list = byEval.get(r.evaluation_id) ?? [];
    list.push({
      id: r.id, task_id: r.task_id, requirement_id: task?.requirement_id ?? r.task_id, label: task?.label ?? r.task_id,
      status: (r.override_status ?? r.status) as MatchResult["status"], severity: r.severity as MatchResult["severity"],
      method: r.method, layer: SEMANTIC_MATCHERS.has(r.method) ? "SEMANTIC" : "HARD_GATE",
      reason: r.override_reason ? `${reason} (estimator override: ${r.override_reason})` : reason,
      reasoning: rest.join("\n\n") || undefined,
      tender_evidence: r.tender_evidence ?? [], company_evidence: r.company_evidence ?? [],
      aspect: (r.aspect ?? "SCOPE_CAPABILITY") as MatchResult["aspect"],
    });
    byEval.set(r.evaluation_id, list);
  }

  for (const [tenderId, row] of newest) {
    const results = byEval.get(row.id) ?? [];
    out.set(tenderId, {
      id: row.id, tender_id: row.tender_id, company_id: row.company_id,
      scope_type: row.scope_type as "WHOLE_TENDER" | "LOT", scope_id: row.scope_id,
      bid_scope: { type: row.scope_type === "LOT" ? "LOT" : "TENDER", lot_id: row.scope_id, lot_title: null },
      matrix: buildMatrix(row.id, results, []), viability: computeViability(results),
      skipped_semantic: 0, stated_not_checked: [], documents: [], created_at: row.created_at,
    });
  }
  return out;
}

// ─── Core evaluation (single scope) ──────────────────────────────────────────

async function runScopedEvaluation(
  tender: TenderDetailWithDocuments,
  company: CanonicalCompany,
  factSheet: TenderFactSheet | null,
  bidScope: BidScope,
  passages: Passage[],
): Promise<MatchEvaluation> {
  const evaluationId = genId("EVAL");
  const cpvLabel = (tender.notice as { cpv_label?: string } | undefined)?.cpv_label ?? null;

  const { tasks, skipped_gaps } = generateTasks(factSheet, (reqId) => getCompanyValue(reqId, company), company, {
    title: tender.title ?? null,
    cpv: tender.cpv_main ?? null,
    cpv_label: cpvLabel,
    unmatched: tender.unmatched_requirements ?? [],
    has_documents: passages.length > 0,
  });

  // LAYER 1 — deterministic, cheap, every lot.
  const gateTasks: MatchingTask[] = tasks.filter((t) => !SEMANTIC_MATCHERS.has(t.matcher_type));
  const gateResults = await Promise.all(gateTasks.map((task) => routeAndRun(task, company, passages)));
  const blocked = gateResults.some((r) => r.status === "FAIL" && r.severity === "HARD");

  // LAYER 2 — model over document passages, only when the gate is open.
  const semanticTasks: MatchingTask[] = tasks.filter((t) => SEMANTIC_MATCHERS.has(t.matcher_type));
  const semanticResults = blocked ? [] : await Promise.all(semanticTasks.map((task) => routeAndRun(task, company, passages)));

  const results = [...gateResults, ...semanticResults];

  const gaps: KnowledgeGapEntry[] = [
    ...skipped_gaps,
    ...results
      .filter((r) => r.status === "UNCERTAIN" && r.severity === "HARD")
      .map((r) => ({ concept: r.requirement_id.toUpperCase(), importance: "HARD" as const, triggered_by: r.question ?? r.reason, task_id: r.task_id })),
  ];

  const evaluation: MatchEvaluation = {
    id: evaluationId,
    tender_id: tender.id,
    company_id: company.company_id,
    scope_type: bidScope.type === "LOT" ? "LOT" : "WHOLE_TENDER",
    scope_id: bidScope.lot_id,
    bid_scope: bidScope,
    matrix: buildMatrix(evaluationId, results, gaps),
    viability: computeViability(results),
    skipped_semantic: blocked ? semanticTasks.length : 0,
    stated_not_checked: blocked ? (tender.unmatched_requirements ?? []) : [],
    documents: tender.document_status ?? [],
    created_at: new Date().toISOString(),
  };

  await persistEvaluation(evaluation, results);
  return evaluation;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function resolveCompany(company: CanonicalCompany | string): Promise<CanonicalCompany> {
  return typeof company === "string" ? assembleCanonicalCompany(company) : company;
}

/** Evaluate a company against a specific lot (or whole tender when lotId is omitted). */
export async function runMatchEvaluation(
  tender: TenderDetailWithDocuments,
  companyOrId: CanonicalCompany | string,
  lotId?: string,
): Promise<MatchEvaluation> {
  const company = await resolveCompany(companyOrId);
  const passages = await loadLotPassages(tender.lot_key ?? tender.id);

  if (lotId) {
    const lot = (tender.lots ?? []).find((l) => l.id === lotId);
    if (!lot) throw new Error(`Lot ${lotId} not found in tender ${tender.id}`);
    const lotFactSheet = buildLotFactSheet(lot, tender.fact_sheet);
    return runScopedEvaluation(tender, company, lotFactSheet, { type: "LOT", lot_id: lot.id, lot_title: lot.title ?? null }, passages);
  }

  return runScopedEvaluation(tender, company, tender.fact_sheet ?? null, { type: "TENDER", lot_id: null, lot_title: null }, passages);
}

/** Evaluate a company against every lot in a multi-lot tender (or whole tender if no lots). */
export async function runAllLotEvaluations(
  tender: TenderDetailWithDocuments,
  companyOrId: CanonicalCompany | string,
): Promise<MatchEvaluation[]> {
  const lots = tender.lots ?? [];
  const company = await resolveCompany(companyOrId);

  if (lots.length <= 1 || tender.lot_count <= 1) {
    return [await runMatchEvaluation(tender, company)];
  }

  const passages = await loadLotPassages(tender.lot_key ?? tender.id);
  return Promise.all(
    lots.map((lot) =>
      runScopedEvaluation(tender, company, buildLotFactSheet(lot, tender.fact_sheet),
        { type: "LOT", lot_id: lot.id, lot_title: lot.title ?? null }, passages),
    ),
  );
}
