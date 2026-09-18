import { genId } from "@/lib/id";
import type {
  TenderFactSheet,
  Fact,
  FactWithCondition,
  Evidence,
  MatchingTask,
  MatcherType,
  Severity,
  DecisionAspect,
  KnowledgeGapEntry,
  CanonicalCompany,
  UnmatchedRequirement,
} from "./types";
import type { PolicyItem } from "@/lib/company/types";

interface TaskSpec {
  requirement_id: string;
  label: string;
  matcher_type: MatcherType;
  severity: Severity;
  aspect: DecisionAspect;
}

const TASK_SPECS: TaskSpec[] = [
  { requirement_id: "trade_scope",            label: "Trade scope / capability",      matcher_type: "ONTOLOGY",   severity: "HARD", aspect: "SCOPE_CAPABILITY" },
  { requirement_id: "place_of_performance",   label: "Place of performance",          matcher_type: "RULE",       severity: "HARD", aspect: "GEOGRAPHY" },
  { requirement_id: "estimated_value",        label: "Estimated contract value",      matcher_type: "RULE",       severity: "HARD", aspect: "CONTRACT_SIZE" },
  { requirement_id: "references_required",    label: "Reference projects required",   matcher_type: "REFERENCE",  severity: "HARD", aspect: "REFERENCES" },
  { requirement_id: "eligibility_proofs",     label: "Qualifications / certificates", matcher_type: "ONTOLOGY",   severity: "HARD", aspect: "QUALIFICATIONS" },
  { requirement_id: "construction_window",    label: "Construction window / timing",  matcher_type: "RULE",       severity: "HARD", aspect: "TIMING_CAPACITY" },
  { requirement_id: "guarantees",             label: "Guarantee capacity",            matcher_type: "RULE",       severity: "HARD", aspect: "FINANCIAL_GUARANTEES" },
  { requirement_id: "penalty",                label: "Penalty clauses",               matcher_type: "SEMANTIC",   severity: "SOFT", aspect: "CONTRACTUAL_RISK" },
  { requirement_id: "self_performance_min_pct", label: "Self-performance minimum",    matcher_type: "RULE",       severity: "HARD", aspect: "SCOPE_CAPABILITY" },
  { requirement_id: "submission_deadline",    label: "Submission deadline",           matcher_type: "RULE",       severity: "HARD", aspect: "TIMING_CAPACITY" },
  { requirement_id: "special_qualifications", label: "Special qualifications",        matcher_type: "SEMANTIC",   severity: "HARD", aspect: "QUALIFICATIONS" },
  { requirement_id: "contractor_role",        label: "Contractor role",               matcher_type: "SEMANTIC",   severity: "SOFT", aspect: "SCOPE_CAPABILITY" },
  { requirement_id: "consortium_allowed",     label: "Consortium allowed",            matcher_type: "RULE",       severity: "SOFT", aspect: "CONTRACTUAL_RISK" },
  { requirement_id: "side_offers_allowed",    label: "Side offers allowed",           matcher_type: "RULE",       severity: "SOFT", aspect: "CONTRACTUAL_RISK" },
  { requirement_id: "lots",                   label: "Lots structure",                matcher_type: "RULE",       severity: "SOFT", aspect: "SCOPE_CAPABILITY" },
];

/** Unmatched-requirement categories the buyer states that decide eligibility, hence HARD. */
const HARD_CATEGORIES = new Set(["QUALIFICATION", "FINANCIAL", "INSURANCE", "REFERENCE", "PERSONNEL", "LEGAL"]);
const CATEGORY_ASPECT: Record<string, DecisionAspect> = {
  QUALIFICATION: "QUALIFICATIONS",
  REFERENCE: "REFERENCES",
  FINANCIAL: "FINANCIAL_GUARANTEES",
  INSURANCE: "FINANCIAL_GUARANTEES",
  PERSONNEL: "TIMING_CAPACITY",
  EXECUTION: "TIMING_CAPACITY",
  TECHNICAL_CAPABILITY: "SCOPE_CAPABILITY",
  SUBMISSION: "CONTRACTUAL_RISK",
  CONTRACTUAL: "CONTRACTUAL_RISK",
  LEGAL: "QUALIFICATIONS",
  OTHER: "CONTRACTUAL_RISK",
};
const CATEGORY_LABEL: Record<string, string> = {
  QUALIFICATION: "Qualification stated in documents",
  REFERENCE: "Reference condition stated in documents",
  FINANCIAL: "Financial condition stated in documents",
  INSURANCE: "Insurance stated in documents",
  PERSONNEL: "Personnel condition stated in documents",
  EXECUTION: "Execution condition stated in documents",
  TECHNICAL_CAPABILITY: "Technical capability stated in documents",
  SUBMISSION: "Submission condition stated in documents",
  CONTRACTUAL: "Contract condition stated in documents",
  LEGAL: "Legal condition stated in documents",
  OTHER: "Condition stated in documents",
};

function extractEvidence(fact: Fact | undefined): Evidence[] {
  return (fact?.evidence ?? []).filter((e) => e.doc);
}

function isAbsent(fact: Fact | undefined): boolean {
  if (!fact) return true;
  return fact.confidence === "not_found" && (fact.value === null || fact.value === undefined);
}

export interface TaskGenerationResult {
  tasks: MatchingTask[];
  skipped_gaps: KnowledgeGapEntry[];
}

export interface TaskContext {
  title: string | null;
  cpv: string | null;
  cpv_label: string | null;
  unmatched: UnmatchedRequirement[];
  /** True when the lot has readable documents, so the standing document question makes sense. */
  has_documents: boolean;
}

/** Build matching tasks driven by a company's active hard constraints against the tender. */
function generateConstraintTasks(
  company: CanonicalCompany,
  factSheet: TenderFactSheet | null | undefined,
  context: MatchingTask["context"],
): MatchingTask[] {
  const constraints = (company.constraints ?? []) as PolicyItem[];
  const sheet = (factSheet ?? {}) as Record<string, Fact | undefined>;
  const tasks: MatchingTask[] = [];

  for (const c of constraints) {
    if (c.status === "REJECTED") continue;

    // Determine tender_value: use the most relevant tender fact for this constraint type
    let tender_value: unknown = null;
    let aspect: DecisionAspect = "CONTRACTUAL_RISK";

    if (c.type === "WORK_TYPE") {
      tender_value = sheet["trade_scope"]?.value ?? null;
      aspect = "SCOPE_CAPABILITY";
    } else if (c.type === "COUNTRY" || c.type === "REGION") {
      tender_value = sheet["place_of_performance"]?.value ?? null;
      aspect = "GEOGRAPHY";
    } else if (c.type === "MAX_PROJECT_VALUE") {
      tender_value = sheet["estimated_value"]?.value ?? null;
      aspect = "CONTRACT_SIZE";
    } else if (c.type === "JV" || c.type === "CONSORTIUM") {
      tender_value = sheet["consortium_allowed"]?.value ?? null;
      aspect = "CONTRACTUAL_RISK";
    }

    tasks.push({
      id: genId("TASK"),
      requirement_id: "company_constraint",
      label: `Exclusion: ${c.value.toLowerCase().replace(/_/g, " ")}`,
      matcher_type: "CONSTRAINT",
      severity: c.severity,
      tender_value,
      company_value: c,
      tender_evidence: [],
      aspect,
      context,
    });
  }
  return tasks;
}

/** One layer-2 task per requirement the buyer stated that no typed rule covers. */
function generateUnmatchedTasks(unmatched: UnmatchedRequirement[], context: MatchingTask["context"]): MatchingTask[] {
  return unmatched.map((u) => ({
    id: genId("TASK"),
    requirement_id: `unmatched:${u.category}`,
    label: CATEGORY_LABEL[u.category] ?? CATEGORY_LABEL.OTHER,
    matcher_type: "SEMANTIC",
    severity: HARD_CATEGORIES.has(u.category) ? "HARD" : "SOFT",
    tender_value: u.quote_de,
    company_value: null,
    tender_evidence: [{ doc: u.doc, page: u.page, quote_de: u.quote_de }],
    aspect: CATEGORY_ASPECT[u.category] ?? "CONTRACTUAL_RISK",
    context,
  }));
}

export function generateTasks(
  factSheet: TenderFactSheet | null | undefined,
  companyValue: (requirementId: string) => unknown,
  company?: CanonicalCompany,
  context?: TaskContext,
): TaskGenerationResult {
  const tasks: MatchingTask[] = [];
  const skipped_gaps: KnowledgeGapEntry[] = [];
  const taskContext = context ? { title: context.title, cpv: context.cpv, cpv_label: context.cpv_label } : undefined;

  if (!factSheet) return { tasks, skipped_gaps };

  const sheet = factSheet as Record<string, FactWithCondition | undefined>;

  for (const spec of TASK_SPECS) {
    // Only process fields the tender actually contains (key present in factSheet)
    if (!(spec.requirement_id in sheet)) continue;
    const fact = sheet[spec.requirement_id];

    if (isAbsent(fact)) {
      // HARD requirement with no tender data → knowledge gap, skip task
      if (spec.severity === "HARD") {
        skipped_gaps.push({
          concept: spec.requirement_id.toUpperCase(),
          importance: "HARD",
          triggered_by: spec.requirement_id,
          task_id: "",
        });
      }
      continue;
    }

    tasks.push({
      id: genId("TASK"),
      requirement_id: spec.requirement_id,
      label: spec.label,
      matcher_type: spec.matcher_type,
      severity: spec.severity,
      tender_value: fact?.value ?? null,
      tender_condition: fact?.condition ?? null,
      company_value: companyValue(spec.requirement_id),
      tender_evidence: extractEvidence(fact),
      aspect: spec.aspect,
      context: taskContext,
    });
  }

  // Append constraint tasks from company profile (independent of fact sheet structure)
  if (company) {
    tasks.push(...generateConstraintTasks(company, factSheet, taskContext));
  }

  if (context) {
    tasks.push(...generateUnmatchedTasks(context.unmatched, taskContext));
    // Standing document question: approvals, certificates and inspector qualifications the
    // trade's contract preambles demand are rarely in the notice; the model reads the passages.
    if (context.has_documents && !("special_qualifications" in sheet)) {
      tasks.push({
        id: genId("TASK"),
        requirement_id: "document_qualifications",
        label: "Approvals and certificates required by the documents",
        matcher_type: "SEMANTIC",
        severity: "HARD",
        tender_value: null,
        company_value: null,
        tender_evidence: [],
        aspect: "QUALIFICATIONS",
        context: taskContext,
      });
    }
  }

  return { tasks, skipped_gaps };
}
