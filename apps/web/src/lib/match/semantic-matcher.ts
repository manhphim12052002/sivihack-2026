import { genId } from "@/lib/id";
import { llmClient, SEMANTIC_MATCH_PROMPT } from "@/lib/llm";
import type { MatchingTask, MatchResult, SemanticMatchResult, CanonicalCompany } from "./types";
import type { CapabilityRow, QualificationRow } from "@/lib/company/types";

function noClient(): SemanticMatchResult {
  return {
    status: "UNCERTAIN",
    conditions: [],
    reason: "Semantic matching unavailable — LLM not configured.",
  };
}

function parseSemanticResult(json: string): SemanticMatchResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { status: "UNCERTAIN", conditions: [], reason: "LLM returned unparseable response." };
  }

  if (typeof raw !== "object" || raw === null) {
    return { status: "UNCERTAIN", conditions: [], reason: "LLM returned unexpected format." };
  }

  const obj = raw as Record<string, unknown>;
  const status = ["PASS", "FAIL", "UNCERTAIN"].includes(obj.status as string)
    ? (obj.status as "PASS" | "FAIL" | "UNCERTAIN")
    : "UNCERTAIN";

  const conditions = Array.isArray(obj.conditions)
    ? (obj.conditions as Array<Record<string, string>>).map((c) => ({
        condition: String(c.condition ?? ""),
        status: (["PASS", "FAIL", "UNCERTAIN"].includes(c.status) ? c.status : "UNCERTAIN") as "PASS" | "FAIL" | "UNCERTAIN",
      }))
    : [];

  return {
    status,
    conditions,
    reason: typeof obj.reason === "string" ? obj.reason : "No reason provided.",
  };
}

function buildCompanyContext(requirement_id: string, company: CanonicalCompany): string {
  const items: string[] = [];

  if (requirement_id === "special_qualifications" || requirement_id === "eligibility_proofs") {
    for (const q of company.qualifications as Array<QualificationRow & { status: string }>) {
      items.push(`[${q.id}] Qualification: ${q.label} (${q.type}) — ${q.status}`);
    }
    for (const c of company.capabilities as Array<CapabilityRow & { status: string }>) {
      if (c.status === "CONFIRMED") items.push(`[${c.id}] Capability: ${c.label} (${c.type})`);
    }
  } else if (requirement_id === "contractor_role") {
    for (const c of company.capabilities as Array<CapabilityRow & { status: string }>) {
      if (c.status === "CONFIRMED") items.push(`[${c.id}] Capability: ${c.label} (${c.type})`);
    }
  } else if (requirement_id === "penalty") {
    items.push(`Company: ${company.identity.name}`);
    items.push(`Regions: ${company.regions.join(", ")}`);
  }

  return items.length > 0 ? items.join("\n") : "No relevant company evidence available.";
}

export async function runSemanticMatcher(
  task: MatchingTask,
  company: CanonicalCompany,
): Promise<MatchResult> {
  let semantic: SemanticMatchResult;

  if (!llmClient) {
    semantic = noClient();
  } else {
    const userContent = JSON.stringify({
      requirement: {
        field: task.requirement_id,
        description: task.tender_value,
        evidence_docs: task.tender_evidence,
      },
      company_evidence: buildCompanyContext(task.requirement_id, company),
    });

    try {
      const json = await llmClient.extract(SEMANTIC_MATCH_PROMPT, userContent, {
        requirement_id: task.requirement_id,
        company_id: company.company_id,
        matcher: "semantic",
      });
      semantic = json ? parseSemanticResult(json) : noClient();
    } catch {
      semantic = { status: "UNCERTAIN", conditions: [], reason: "Semantic matching call failed." };
    }
  }

  const companyEvidence = company.qualifications
    .filter((q) => (q as QualificationRow & { status: string }).status === "CONFIRMED")
    .map((q) => q.id)
    .concat(
      company.capabilities
        .filter((c) => (c as CapabilityRow & { status: string }).status === "CONFIRMED")
        .map((c) => c.id),
    );

  return {
    id: genId("RES"),
    task_id: task.id,
    requirement_id: task.requirement_id,
    label: task.label,
    status: semantic.status,
    severity: task.severity,
    method: "SEMANTIC",
    reason: semantic.reason,
    tender_evidence: task.tender_evidence,
    company_evidence: companyEvidence,
    aspect: task.aspect,
  };
}
