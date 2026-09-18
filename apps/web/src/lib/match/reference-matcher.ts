import { CompanyError } from '@/lib/company/errors';
import { genId } from "@/lib/id";
import { llmClient, SEMANTIC_MATCH_PROMPT } from "@/lib/llm";
import type { MatchingTask, MatchResult, CanonicalCompany } from "./types";
import type { ReferenceRow } from "@/lib/company/types";

interface ParsedReferenceRequirement {
  minimum_count: number;
  project_type: string | null;
  lookback_years: number | null;
  min_value_eur: number | null;
}

function parseRequirement(value: unknown): ParsedReferenceRequirement {
  const defaults: ParsedReferenceRequirement = {
    minimum_count: 1,
    project_type: null,
    lookback_years: null,
    min_value_eur: null,
  };

  if (typeof value === "string") {
    // Try to extract numbers: "3 vergleichbare Referenzen" → min 3
    const countMatch = value.match(/(\d+)\s*(vergleichbare|comparable|reference|Referenz)/i);
    if (countMatch) defaults.minimum_count = parseInt(countMatch[1], 10);

    const yearMatch = value.match(/(\d+)\s*(Jahr|year)/i);
    if (yearMatch) defaults.lookback_years = parseInt(yearMatch[1], 10);

    const money = value.match(/(?:€|EUR)\s*([\d.,]+)\s*(M|million|Mio|k)?/i);
    if (money) defaults.min_value_eur = Number(money[1].replace(',', '.')) * (/^(m|million|mio)$/i.test(money[2] ?? '') ? 1e6 : /^k$/i.test(money[2] ?? '') ? 1000 : 1);
    defaults.project_type = value;
    return defaults;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return {
      minimum_count: typeof obj.minimum_count === "number" ? obj.minimum_count : defaults.minimum_count,
      project_type: typeof obj.project_type === "string" ? obj.project_type : typeof value === "string" ? value : null,
      lookback_years: typeof obj.lookback_years === "number" ? obj.lookback_years : null,
      min_value_eur: typeof obj.min_value_eur === "number" ? obj.min_value_eur : null,
    };
  }

  return defaults;
}

function filterDeterministic(
  refs: Array<ReferenceRow & { status: string }>,
  req: ParsedReferenceRequirement,
): Array<ReferenceRow & { status: string }> {
  return refs.filter((ref) => {
    if (ref.status !== "CONFIRMED") return false;

    // Lookback window
    if (req.lookback_years !== null) {
      if (!ref.completed_at) return false;
      const completed = new Date(ref.completed_at);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - req.lookback_years);
      if (isNaN(completed.getTime()) || completed > new Date() || completed < cutoff) return false;
    }

    // Minimum contract value
    if (req.min_value_eur !== null) {
      if (ref.contract_value_eur === null || ref.contract_value_eur === undefined) return false;
      if (ref.contract_value_eur < req.min_value_eur) return false;
    }

    return true;
  });
}

async function semanticCheckReference(
  ref: ReferenceRow,
  projectType: string,
): Promise<"PASS" | "FAIL" | "UNCERTAIN"> {
  if (!llmClient) throw new CompanyError("LLM_UNAVAILABLE", "Reference comparison requires OpenRouter configuration.",503);

  const userContent = JSON.stringify({
    requirement: { field: "references_required", description: projectType },
    company_evidence: `[${ref.id}] Reference: ${ref.name}. Types: ${(ref.project_types as string[] ?? []).join(", ")}. Location: ${ref.location ?? "unknown"}.`,
  });

  try {
    const json = await llmClient.extract(SEMANTIC_MATCH_PROMPT, userContent, {
      reference_id: ref.id,
      matcher: "reference",
    });
    if (!json) throw new CompanyError("LLM_PARSE_ERROR", "Reference model returned no output.",502);
    const raw = JSON.parse(json) as { status?: string };
    if (raw.status === "PASS" || raw.status === "FAIL" || raw.status === "UNCERTAIN") return raw.status;
  } catch (e) {
    if(e instanceof CompanyError) throw e;
    if(e instanceof SyntaxError) throw new CompanyError("LLM_PARSE_ERROR", "Reference model returned invalid JSON.",502);
    throw new CompanyError("LLM_REQUEST_FAILED", "Reference comparison request failed.",502);
  }
  throw new CompanyError("LLM_PARSE_ERROR", "Reference model returned invalid status.",502);
}

export async function runReferenceMatcher(
  task: MatchingTask,
  company: CanonicalCompany,
): Promise<MatchResult> {
  const req = parseRequirement(task.tender_condition && Object.keys(task.tender_condition).length ? task.tender_condition : task.tender_value);
  // "vergleichbare Referenzen" without a stated type means comparable to this lot's work.
  if (!req.project_type && task.context?.title) {
    req.project_type = `${task.context.title}${task.context.cpv_label ? ` (${task.context.cpv_label})` : ""}`;
  }
  const refs = company.references as Array<ReferenceRow & { status: string }>;

  const candidates = filterDeterministic(refs, req);

  let verified = 0;
  let uncertainCount = 0;
  let modelFailed = false;
  const checkedIds: string[] = [];

  if (req.project_type && candidates.length > 0) {
    for (const ref of candidates) {
      checkedIds.push(ref.id);
      let result: "PASS" | "FAIL" | "UNCERTAIN";
      try {
        result = await semanticCheckReference(ref, req.project_type);
      } catch {
        result = "UNCERTAIN";   // model down: never a FAIL, never a crash
        modelFailed = true;
      }
      if (result === "PASS") verified++;
      else if (result === "UNCERTAIN") uncertainCount++;
    }
  } else {
    // No semantic check possible — count all deterministic candidates
    verified = candidates.length;
    checkedIds.push(...candidates.map((r) => r.id));
  }

  const needed = req.minimum_count;
  let status: "PASS" | "FAIL" | "UNCERTAIN";
  let reason: string;

  if (verified >= needed) {
    status = "PASS";
    reason = `${verified} reference(s) comparable to "${req.project_type ?? "the requirement"}"${req.lookback_years ? ` within ${req.lookback_years} years` : ""} satisfy the required ${needed}.`;
  } else if (verified + uncertainCount >= needed) {
    status = "UNCERTAIN";
    reason = `${verified} verified, ${uncertainCount} uncertain — need ${needed}. Resolution required.`;
  } else if (refs.length === 0) {
    status = "UNCERTAIN";
    reason = "No reference projects on file — cannot verify requirement.";
  } else {
    status = "UNCERTAIN";
    reason = `Only ${verified} verified reference(s) found; ${needed} required (${req.project_type ?? "any type"}).`;
  }
  if (modelFailed) reason += " Model unavailable for the comparison; counted as uncertain.";

  return {
    id: genId("RES"),
    task_id: task.id,
    requirement_id: task.requirement_id,
    label: task.label,
    status,
    severity: task.severity,
    method: "REFERENCE",
    layer: "SEMANTIC",
    reason,
    reasoning: `Required: ${needed}${req.lookback_years ? ` within the last ${req.lookback_years} years` : ""}, comparable to ${req.project_type ?? "unspecified work"}. Company references on file: ${refs.length}; after date/value filter: ${candidates.length}; judged comparable: ${verified}; uncertain: ${uncertainCount}.`,
    question: status === "UNCERTAIN" ? `Which completed projects since ${new Date().getFullYear() - (req.lookback_years ?? 3)} are comparable to ${req.project_type ?? "this work"}, with client, value and completion date?` : null,
    tender_evidence: task.tender_evidence,
    company_evidence: checkedIds,
    company_fact: refs.length ? `${refs.length} reference(s) on file` : "No references on file",
    aspect: task.aspect,
  };
}
