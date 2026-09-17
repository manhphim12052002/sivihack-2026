import type { components } from "@/lib/api-types";
import type { CanonicalCompany } from "@/lib/company/types";

// Re-export tender types from OpenAPI
export type TenderDetail    = components["schemas"]["TenderDetail"];
export type TenderFactSheet = components["schemas"]["TenderFactSheet"];
export type Fact            = components["schemas"]["Fact"];
export type Evidence        = components["schemas"]["Evidence"];
export type { CanonicalCompany };

// ─── Core enums ───────────────────────────────────────────────────────────────

export type MatchStatus     = "PASS" | "FAIL" | "UNCERTAIN";
export type Severity        = "HARD" | "SOFT";
export type MatcherType     = "RULE" | "ONTOLOGY" | "SEMANTIC" | "REFERENCE";
export type ViabilityStatus = "VIABLE" | "REVIEW" | "BLOCKED";

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
  company_value: unknown;
  tender_evidence: string[];  // evidence ids from the tender Fact
  aspect: DecisionAspect;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface MatchResult {
  id: string;
  task_id: string;
  requirement_id: string;
  label: string;
  status: MatchStatus;
  severity: Severity;
  method: string;
  reason: string;
  tender_evidence: string[];
  company_evidence: string[];
  aspect: DecisionAspect;
}

export interface SemanticCondition {
  condition: string;
  status: MatchStatus;
}

export interface SemanticMatchResult {
  status: MatchStatus;
  conditions: SemanticCondition[];
  reason: string;
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

export interface MatchEvaluation {
  id: string;
  tender_id: string;
  company_id: string;
  scope_type: "WHOLE_TENDER" | "LOT";
  scope_id: string | null;
  matrix: EvaluationMatrix;
  viability: ViabilityResult;
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
  tender_evidence: string[] | null;
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
