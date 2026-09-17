import { genId } from "@/lib/id";
import type {
  TenderFactSheet,
  Fact,
  MatchingTask,
  MatcherType,
  Severity,
  DecisionAspect,
  KnowledgeGapEntry,
} from "./types";

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
  { requirement_id: "estimated_value",        label: "Estimated contract value",      matcher_type: "RULE",       severity: "SOFT", aspect: "CONTRACT_SIZE" },
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

function extractEvidence(fact: Fact | undefined): string[] {
  if (!fact?.evidence) return [];
  return fact.evidence.map((e) => e.doc).filter(Boolean);
}

function isAbsent(fact: Fact | undefined): boolean {
  if (!fact) return true;
  return fact.confidence === "not_found" && (fact.value === null || fact.value === undefined);
}

export interface TaskGenerationResult {
  tasks: MatchingTask[];
  skipped_gaps: KnowledgeGapEntry[];
}

export function generateTasks(
  factSheet: TenderFactSheet | null | undefined,
  companyValue: (requirementId: string) => unknown,
): TaskGenerationResult {
  const tasks: MatchingTask[] = [];
  const skipped_gaps: KnowledgeGapEntry[] = [];

  if (!factSheet) return { tasks, skipped_gaps };

  const sheet = factSheet as Record<string, Fact | undefined>;

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
      company_value: companyValue(spec.requirement_id),
      tender_evidence: extractEvidence(fact),
      aspect: spec.aspect,
    });
  }

  return { tasks, skipped_gaps };
}
