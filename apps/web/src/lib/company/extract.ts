import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import { llmClient, EXTRACTION_SYSTEM_PROMPT } from "@/lib/llm";
import { normalizeCapabilityType, normalizeQualificationType } from "@/lib/company/normalize";
import type {
  ExtractionResult,
  ExtractedCapability,
  ExtractedReference,
  ExtractedQualification,
  ChunkRow,
} from "@/lib/company/types";

export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionParseError";
  }
}

/** Parse and validate raw LLM JSON output into ExtractionResult. */
export function parseExtractionResult(json: string): ExtractionResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ExtractionParseError(`LLM returned invalid JSON: ${json.slice(0, 200)}`);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new ExtractionParseError("LLM result is not an object");
  }

  const obj = raw as Record<string, unknown>;

  const capabilities = ((obj.capabilities as unknown[]) ?? []).filter(
    (c): c is ExtractedCapability =>
      isObject(c) && typeof c.type === "string" && typeof c.label === "string" && hasChunkIds(c),
  );

  const references = ((obj.references as unknown[]) ?? []).filter(
    (r): r is ExtractedReference =>
      isObject(r) && typeof r.name === "string" && hasChunkIds(r),
  );

  const qualifications = ((obj.qualifications as unknown[]) ?? []).filter(
    (q): q is ExtractedQualification =>
      isObject(q) && typeof q.type === "string" && typeof q.label === "string" && hasChunkIds(q),
  );

  return { capabilities, references, qualifications };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasChunkIds(v: Record<string, unknown>): boolean {
  return Array.isArray(v.chunk_ids) && (v.chunk_ids as unknown[]).length > 0;
}

/** Run LLM extraction over all chunks for a company and persist results. */
export async function extractCompanyIntelligence(companyId: string): Promise<{
  capabilities: number;
  references: number;
  qualifications: number;
}> {
  // Fetch all chunks for this company's sources
  const { data: sources } = await supabase
    .from("sources")
    .select("id")
    .eq("entity_id", companyId)
    .eq("entity_type", "company");

  if (!sources || sources.length === 0) {
    return { capabilities: 0, references: 0, qualifications: 0 };
  }

  const sourceIds = sources.map((s: { id: string }) => s.id);
  const { data: chunks } = await supabase
    .from("chunks")
    .select("*")
    .in("source_id", sourceIds);

  if (!chunks || chunks.length === 0) {
    return { capabilities: 0, references: 0, qualifications: 0 };
  }

  if (!llmClient) {
    return { capabilities: 0, references: 0, qualifications: 0 };
  }

  // Batch chunks into groups of 10 to stay within context limits
  const BATCH_SIZE = 10;
  const allCapabilities: ExtractedCapability[] = [];
  const allReferences: ExtractedReference[] = [];
  const allQualifications: ExtractedQualification[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = (chunks as ChunkRow[]).slice(i, i + BATCH_SIZE);
    const userContent = batch
      .map((c) => `[${c.id}]: ${c.text.slice(0, 1000)}`)
      .join("\n\n");

    try {
      const json = await llmClient.extract(EXTRACTION_SYSTEM_PROMPT, userContent);
      if (!json) continue;
      const result = parseExtractionResult(json);
      allCapabilities.push(...result.capabilities);
      allReferences.push(...result.references);
      allQualifications.push(...result.qualifications);
    } catch (e) {
      if (e instanceof ExtractionParseError) continue;
      throw e;
    }
  }

  // Persist capabilities
  let capCount = 0;
  for (const cap of allCapabilities) {
    const { error } = await supabase.from("company_capabilities").insert({
      id: genId("CAP"),
      company_id: companyId,
      type: normalizeCapabilityType(cap.label),
      label: cap.label,
      origin: "DOCUMENT_EXTRACTED",
      status: "PENDING",
      evidence: cap.chunk_ids,
    });
    if (!error) capCount++;
  }

  // Persist references
  let refCount = 0;
  for (const ref of allReferences) {
    const { error } = await supabase.from("company_references").insert({
      id: genId("REF"),
      company_id: companyId,
      name: ref.name,
      client: ref.client ?? null,
      project_types: ref.project_types ?? [],
      location: ref.location ?? null,
      contract_value_eur: ref.contract_value_eur ?? null,
      completed_at: ref.completed_at ?? null,
      capabilities: ref.capabilities ?? [],
      origin: "DOCUMENT_EXTRACTED",
      status: "PENDING",
      evidence: ref.chunk_ids,
    });
    if (!error) refCount++;
  }

  // Persist qualifications
  let qualCount = 0;
  for (const qual of allQualifications) {
    const { error } = await supabase.from("company_qualifications").insert({
      id: genId("QUAL"),
      company_id: companyId,
      type: normalizeQualificationType(qual.label),
      label: qual.label,
      valid_from: qual.valid_from ?? null,
      valid_until: qual.valid_until ?? null,
      freshness: "CURRENT",
      origin: "DOCUMENT_EXTRACTED",
      status: "PENDING",
      evidence: qual.chunk_ids,
    });
    if (!error) qualCount++;
  }

  return { capabilities: capCount, references: refCount, qualifications: qualCount };
}
