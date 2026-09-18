/**
 * Layer 2: the model reads the passages of this lot's documents that concern one requirement,
 * together with the company's evidence rows, and argues PASS / FAIL / UNCERTAIN per
 * sub-condition. Every tender quote it returns must be a verbatim substring of a passage it was
 * given (same gate as the pipeline); a quote that fails is dropped, a finding with no surviving
 * quote and a non-UNCERTAIN status is downgraded to UNCERTAIN. Model or network failure never
 * throws: the result is UNCERTAIN with the failure named, so a demo never loses the whole card.
 */
import { genId } from "@/lib/id";
import { llmClient } from "@/lib/llm";
import { formatEur } from "@/lib/status";
import { quoteIsIn, selectPassages } from "./retrieval";
import type {
  CanonicalCompany,
  Evidence,
  MatchStatus,
  MatchingTask,
  MatchResult,
  Passage,
  SemanticMatchResult,
} from "./types";
import type { CapabilityRow, QualificationRow, ReferenceRow } from "@/lib/company/types";

export const SEMANTIC_MATCH_PROMPT = `You are the eligibility reviewer for a German construction estimator. You compare ONE requirement
of a public tender against the company's evidence and argue whether the company satisfies it.

You receive: the requirement (typed condition and/or the buyer's German sentence), passages from the
tender documents about it (each headed by its chunk_id, file and page/section), and the company's evidence
rows (each with an id). Return JSON only, exactly this shape:
{
  "status": "PASS" | "FAIL" | "UNCERTAIN",
  "conditions": [{ "condition": string, "status": "PASS" | "FAIL" | "UNCERTAIN" }],
  "reason": string,            // one sentence an estimator can disagree with, English
  "reasoning": string,         // 2-4 sentences: what the documents demand, what the company shows, the gap
  "question": string | null,   // when UNCERTAIN: the one question to ask the company, else null
  "tender_evidence": [{ "chunk_id": string, "quote": string }],   // 1-3 VERBATIM German quotes copied from the passages
  "company_evidence": [string] // ids of the company rows you relied on
}
Rules:
- Split the requirement into its material sub-conditions and judge each one.
- FAIL only when company evidence actively contradicts a condition (e.g. a qualification is KNOWN_ABSENT,
  a limit is exceeded). Silence in the company evidence is UNCERTAIN, never FAIL.
- PASS only when company evidence positively covers every material condition.
- Quotes must be copied character for character from a passage, 5 to 40 words, German. Never translate.
- Do not invent company facts, dates, values or certificates. Do not score similarity.
- If the passages do not state the requirement at all, say so in reasoning and return UNCERTAIN.`;

// ─── Company context ──────────────────────────────────────────────────────────

function companyContext(company: CanonicalCompany): string {
  const lines: string[] = [];
  const id = company.identity;
  lines.push(`Company: ${id.name}; HQ ${id.headquarters || "unknown"}; employees ${id.employees ?? "unknown"}; revenue ${id.revenue_eur ? formatEur(id.revenue_eur) : "unknown"}.`);
  const cp = company.commercial_profile;
  lines.push(`Commercial: contracts ${formatEur(cp.contract_min_eur)}–${formatEur(cp.contract_max_eur)}; guarantee capacity ${formatEur(cp.guarantee_capacity_eur)}; self-performance ${cp.self_perform_share_pct ?? "unknown"} %.`);
  lines.push(`Regions: ${(company.regions ?? []).join(", ") || "unknown"}; radius ${company.radius_km ?? "unknown"} km; CPV prefixes ${(company.cpv_prefixes ?? []).join(", ") || "none"}.`);
  for (const c of company.capabilities as Array<CapabilityRow & { status: string }>) {
    if (c.status !== "REJECTED") lines.push(`[${c.id}] Capability: ${c.label} (${c.type}; ${c.status})`);
  }
  for (const q of company.qualifications as Array<QualificationRow & { status: string }>) {
    if (q.status !== "REJECTED")
      lines.push(`[${q.id}] Qualification: ${q.label} (${q.type}; ${q.knowledge_state ?? "state unknown"}; ${q.status}; valid until ${q.valid_until ?? "n/a"})`);
  }
  for (const r of company.references as Array<ReferenceRow & { status: string }>) {
    if (r.status !== "REJECTED")
      lines.push(`[${r.id}] Reference: ${r.name}; types ${(r.project_types ?? []).join("/") || "n/a"}; client ${r.client ?? "n/a"}; location ${r.location ?? "n/a"}; value ${formatEur(r.contract_value_eur)}; completed ${r.completed_at ?? "n/a"}; ${r.status}`);
  }
  for (const c of company.constraints ?? []) {
    if (c.status !== "REJECTED") lines.push(`[${c.id}] Constraint: ${c.type} ${c.operator} ${c.value} (${c.severity}; ${c.status})`);
  }
  for (const c of company.capacity ?? []) {
    if (c.status !== "REJECTED") lines.push(`[${c.id}] Capacity: ${c.label}; ${c.value ?? ""} ${c.unit ?? ""}; from ${c.available_from ?? c.raw_value ?? "n/a"}`);
  }
  return lines.join("\n");
}

function requirementText(task: MatchingTask): string {
  const parts: string[] = [`Field: ${task.requirement_id}`, `Label: ${task.label}`];
  if (task.context?.title) parts.push(`Lot: ${task.context.title}${task.context.cpv ? ` (CPV ${task.context.cpv}${task.context.cpv_label ? `, ${task.context.cpv_label}` : ""})` : ""}`);
  if (task.tender_condition && Object.keys(task.tender_condition).length) parts.push(`Typed condition: ${JSON.stringify(task.tender_condition)}`);
  if (task.tender_value !== null && task.tender_value !== undefined) parts.push(`Stated value: ${typeof task.tender_value === "string" ? task.tender_value : JSON.stringify(task.tender_value)}`);
  for (const e of task.tender_evidence) if (e.quote_de) parts.push(`Notice/document quote: "${e.quote_de}" (${e.doc}${e.page ? `, p. ${e.page}` : ""})`);
  if (task.requirement_id === "document_qualifications")
    parts.push("Question: which approvals, certificates, system partnerships or personnel qualifications do the documents demand from the bidder or the products, and does the company evidence cover them?");
  return parts.join("\n");
}

function passageBlock(passages: Passage[]): string {
  return passages
    .map((p) => `[${p.chunk_id}] ${p.doc}${p.page ? ` p. ${p.page}` : p.section ? ` ${p.section}` : ""}\n${p.text}`)
    .join("\n\n");
}

// ─── Parsing and gate ─────────────────────────────────────────────────────────

const STATUSES: MatchStatus[] = ["PASS", "FAIL", "UNCERTAIN"];

function asStatus(value: unknown): MatchStatus {
  return STATUSES.includes(value as MatchStatus) ? (value as MatchStatus) : "UNCERTAIN";
}

export function parseSemanticResult(json: string, passages: Passage[]): SemanticMatchResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return uncertain("Model returned invalid JSON.", passages.length);
  }
  if (typeof raw !== "object" || raw === null) return uncertain("Model returned an invalid structure.", passages.length);
  const obj = raw as Record<string, unknown>;

  const conditions = Array.isArray(obj.conditions)
    ? (obj.conditions as Array<Record<string, unknown>>).map((c) => ({
        condition: String(c.condition ?? ""),
        status: asStatus(c.status),
      }))
    : [];

  // Gate: keep only quotes that are really in a passage the model was shown.
  const byId = new Map(passages.map((p) => [p.chunk_id, p]));
  const evidence: Evidence[] = [];
  let rejected = 0;
  for (const e of Array.isArray(obj.tender_evidence) ? (obj.tender_evidence as Array<Record<string, unknown>>) : []) {
    const passage = byId.get(String(e.chunk_id ?? ""));
    const quote = String(e.quote ?? "");
    if (passage && quoteIsIn(quote, passage)) {
      evidence.push({ doc: passage.doc, page: passage.page ?? null, quote_de: quote.replace(/\s+/g, " ").trim() });
    } else {
      rejected++;
    }
  }

  let status = asStatus(obj.status);
  if (conditions.some((c) => c.status === "FAIL") && status === "PASS") status = "FAIL";
  else if (conditions.some((c) => c.status === "UNCERTAIN") && status === "PASS") status = "UNCERTAIN";
  // A verdict about the documents needs a surviving quote from the documents.
  if (status !== "UNCERTAIN" && evidence.length === 0 && passages.length > 0) status = "UNCERTAIN";

  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
  return {
    status,
    conditions,
    reason: typeof obj.reason === "string" ? obj.reason : "No reason provided.",
    reasoning: rejected ? `${reasoning} (${rejected} quote${rejected > 1 ? "s" : ""} rejected by the evidence gate.)`.trim() : reasoning,
    question: typeof obj.question === "string" && obj.question.trim() ? obj.question : null,
    tender_evidence: evidence,
    company_evidence: Array.isArray(obj.company_evidence) ? (obj.company_evidence as unknown[]).map(String) : [],
  };
}

function uncertain(reason: string, passageCount: number): SemanticMatchResult {
  return {
    status: "UNCERTAIN",
    conditions: [],
    reason,
    reasoning: passageCount ? `${passageCount} passage(s) were selected but could not be assessed.` : "No document passages were available for this requirement.",
    question: null,
    tender_evidence: [],
    company_evidence: [],
  };
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export async function runSemanticMatcher(
  task: MatchingTask,
  company: CanonicalCompany,
  passages: Passage[] = [],
): Promise<MatchResult> {
  const queryText = [
    task.label,
    typeof task.tender_value === "string" ? task.tender_value : "",
    JSON.stringify(task.tender_condition ?? {}),
    ...task.tender_evidence.map((e) => e.quote_de),
  ].join(" ");
  const kind = task.requirement_id.startsWith("unmatched:") ? task.requirement_id.slice("unmatched:".length) : task.requirement_id;
  const selected = selectPassages(passages, kind, queryText, task.requirement_id === "document_qualifications" ? 8 : 4);

  let semantic: SemanticMatchResult;
  if (!llmClient) {
    semantic = uncertain("Model not configured (OPENROUTER_API_KEY missing); requirement not assessed.", selected.length);
  } else if (selected.length === 0 && task.tender_evidence.length === 0 && task.tender_value == null) {
    semantic = uncertain("The documents read for this lot do not mention this requirement.", 0);
  } else {
    const userContent = `REQUIREMENT\n${requirementText(task)}\n\nTENDER DOCUMENT PASSAGES\n${passageBlock(selected) || "(none)"}\n\nCOMPANY EVIDENCE\n${companyContext(company)}`;
    try {
      const json = await llmClient.extract(SEMANTIC_MATCH_PROMPT, userContent, {
        requirement_id: task.requirement_id,
        company_id: company.company_id,
        matcher: "semantic",
      });
      semantic = json ? parseSemanticResult(json, selected) : uncertain("Model returned no output.", selected.length);
    } catch (e) {
      semantic = uncertain(`Model unavailable (${e instanceof Error ? e.message.slice(0, 80) : "request failed"}); requirement not assessed.`, selected.length);
    }
  }

  // Quotes the task already carried (notice text or extracted requirement) stay as evidence.
  const evidence = [...task.tender_evidence.filter((e) => e.quote_de), ...semantic.tender_evidence];

  return {
    id: genId("RES"),
    task_id: task.id,
    requirement_id: task.requirement_id,
    label: task.label,
    status: semantic.status,
    severity: task.severity,
    method: "SEMANTIC",
    layer: "SEMANTIC",
    reason: semantic.reason,
    reasoning: semantic.reasoning,
    conditions: semantic.conditions,
    question: semantic.question,
    tender_evidence: evidence,
    company_evidence: semantic.company_evidence,
    aspect: task.aspect,
  };
}
