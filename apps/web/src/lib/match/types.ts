import type { components } from "@/lib/api-types";
import type { CanonicalCompany } from "@/lib/company/types";

// Re-export tender types from OpenAPI
export type TenderDetail    = components["schemas"]["TenderDetail"];
export type TenderFactSheet = components["schemas"]["TenderFactSheet"];
export type Fact            = components["schemas"]["Fact"];
export type Evidence        = components["schemas"]["Evidence"];
export type { CanonicalCompany };

// ─── Document-side context (what the pipeline read for this lot) ──────────────

/** A Fact as the loader hands it over: the generated shape plus the typed Requirement condition
 *  the pipeline stored next to it (e.g. {minimum_count, lookback_years, project_type}). */
export type FactWithCondition = Fact & { condition?: Record<string, unknown> | null };

/** A normative sentence the buyer stated that no typed rule evaluates ("stated, not checked"). */
export interface UnmatchedRequirement {
  category: string;      // REFERENCE | QUALIFICATION | FINANCIAL | INSURANCE | ... (pipeline ontology)
  quote_de: string;
  doc: string;
  page: number | null;
  section: string | null;
}

/** One addressable piece of a document the lot links: a PDF page or a GAEB position/block. */
export interface Passage {
  chunk_id: string;
  doc: string;
  page: number | null;
  section: string | null;
  text: string;
}

export interface DocumentStatus {
  name: string;
  type: string;          // PDF | GAEB | ...
  status: string;        // AVAILABLE | SKIPPED | SCANNED | UNREACHABLE
  pages: number | null;
  chunks: number;
}

export type TenderDetailWithDocuments = TenderDetail & {
  lot_key?: string;
  procedure_key?: string;
  unmatched_requirements?: UnmatchedRequirement[];
  document_status?: DocumentStatus[];
};

// ─── Core enums ───────────────────────────────────────────────────────────────

export type MatchStatus     = "PASS" | "FAIL" | "UNCERTAIN";
export type Severity        = "HARD" | "SOFT";
export type MatcherType     = "RULE" | "ONTOLOGY" | "SEMANTIC" | "REFERENCE" | "CONSTRAINT";
export type ViabilityStatus = "VIABLE" | "REVIEW" | "BLOCKED";
/** Layer 1 is deterministic and runs on every lot; layer 2 consults the documents with a model
 *  and runs only when layer 1 found no hard FAIL. */
export type Layer           = "HARD_GATE" | "SEMANTIC";

export type DecisionAspect =
  | "SCOPE_CAPABILITY"
  | "GEOGRAPHY"
  | "CONTRACT_SIZE"
  | "REFERENCES"
  | "QUALIFICATIONS"
  | "TIMING_CAPACITY"
  | "FINANCIAL_GUARANTEES"
  | "CONTRACTUAL_RISK";

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface MatchingTask {
  id: string;
  requirement_id: string;
  label: string;
  matcher_type: MatcherType;
  severity: Severity;
  tender_value: unknown;
  /** Typed condition from the pipeline, when the fact is a Requirement. */
  tender_condition?: Record<string, unknown> | null;
  company_value: unknown;
  tender_evidence: Evidence[];
  aspect: DecisionAspect;
  /** Lot-level context every matcher may use for wording and for the reference comparison. */
  context?: { title: string | null; cpv: string | null; cpv_label: string | null };
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface SemanticCondition {
  condition: string;
  status: MatchStatus;
}

export interface MatchResult {
  id: string;
  task_id: string;
  requirement_id: string;
  label: string;
  status: MatchStatus;
  severity: Severity;
  method: string;
  layer: Layer;
  /** One-line verdict an estimator can disagree with. */
  reason: string;
  /** Layer 2 only: the model's argument in a few sentences. */
  reasoning?: string;
  conditions?: SemanticCondition[];
  /** Layer 2 only: what to ask the estimator when the status is UNCERTAIN. */
  question?: string | null;
  /** Verbatim German quotes with file and page/section; every quote passed the substring gate. */
  tender_evidence: Evidence[];
  company_evidence: string[];
  /** Human-readable company side of the comparison, when the matcher has one. */
  company_fact?: string | null;
  aspect: DecisionAspect;
}

export interface SemanticMatchResult {
  status: MatchStatus;
  conditions: SemanticCondition[];
  reason: string;
  reasoning: string;
  question: string | null;
  tender_evidence: Evidence[];
  company_evidence: string[];
}

export interface ReferenceMatchResult {
  status: MatchStatus;
  verified: number;
  uncertain: number;
  required: number;
  reason: string;
  checked_ids: string[];
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export interface KnowledgeGapEntry {
  concept: string;
  importance: Severity;
  triggered_by: string;
  task_id: string;
}

export interface EvaluationMatrix {
  evaluation_id: string;
  results: MatchResult[];
  hard_blockers: MatchResult[];
  soft_concerns: MatchResult[];
  knowledge_gaps: KnowledgeGapEntry[];
}

export interface ViabilityResult {
  status: ViabilityStatus;
  hard_blockers: number;
  hard_unknowns: number;
  soft_concerns: number;
}

export interface BidScope {
  type: "TENDER" | "LOT";
  lot_id: string | null;
  lot_title: string | null;
}

/** The evaluation card: everything the briefing page renders for one lot × company. */
export interface MatchEvaluation {
  id: string;
  tender_id: string;
  company_id: string;
  scope_type: "WHOLE_TENDER" | "LOT";
  scope_id: string | null;
  bid_scope: BidScope;
  matrix: EvaluationMatrix;
  viability: ViabilityResult;
  /** Layer 2 tasks not run because layer 1 already blocked the lot. */
  skipped_semantic: number;
  stated_not_checked: UnmatchedRequirement[];
  documents: DocumentStatus[];
  created_at: string;
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface MatchEvaluationRow {
  id: string;
  tender_id: string;
  company_id: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  hard_blockers: number;
  hard_unknowns: number;
  soft_concerns: number;
  created_at: string;
  updated_at: string;
}

export interface MatchResultRow {
  id: string;
  evaluation_id: string;
  task_id: string;
  status: string;
  severity: string;
  method: string;
  reason: string;
  tender_evidence: Evidence[] | null;
  company_evidence: string[] | null;
  aspect: string | null;
  override_status: string | null;
  override_reason: string | null;
  override_at: string | null;
  created_at: string;
}

export interface MatchKnowledgeGapRow {
  id: string;
  evaluation_id: string;
  task_id: string | null;
  concept: string;
  importance: string;
  triggered_by: string | null;
  created_at: string;
}
