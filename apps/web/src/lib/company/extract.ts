import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import { llmClient, EXTRACTION_SYSTEM_PROMPT } from "@/lib/llm";
import {
  normalizeCapabilityType,
  normalizeQualificationType,
} from "@/lib/company/normalize";
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
    throw new ExtractionParseError(
      `LLM returned invalid JSON: ${json.slice(0, 200)}`,
    );
  }

  if (typeof raw !== "object" || raw === null) {
    throw new ExtractionParseError("LLM result is not an object");
  }

  const obj = raw as Record<string, unknown>;

  const capabilities = ((obj.capabilities as unknown[]) ?? []).filter(
    (c): c is ExtractedCapability =>
      isObject(c) &&
      typeof c.type === "string" &&
      typeof c.label === "string" &&
      hasChunkIds(c),
  );

  const references = ((obj.references as unknown[]) ?? []).filter(
    (r): r is ExtractedReference =>
      isObject(r) && typeof r.name === "string" && hasChunkIds(r),
  );

  const qualifications = ((obj.qualifications as unknown[]) ?? []).filter(
    (q): q is ExtractedQualification =>
      isObject(q) &&
      typeof q.type === "string" &&
      typeof q.label === "string" &&
      hasChunkIds(q),
  );

  return { capabilities, references, qualifications };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function hasChunkIds(v: Record<string, unknown>): boolean {
  return Array.isArray(v.chunk_ids) && (v.chunk_ids as unknown[]).length > 0;
}

/** Extract all sources, merge deterministically, save atomically. Failures never masquerade as missing knowledge. */
export async function extractCompanyIntelligence(companyId: string) {
  const { CompanyError } = await import("./errors");
  const { assembleCanonicalCompany } = await import("./assemble");
  const { saveCanonicalCompany } = await import("./repository");
  const { parseIntelligence } = await import("./parse");
  const { mergeCompany } = await import("./model");
  if (!llmClient)
    throw new CompanyError(
      "LLM_UNAVAILABLE",
      "OpenRouter is not configured. Source information is retained; retry after configuration.",
      503,
    );
  let company = await assembleCanonicalCompany(companyId);
  if (!company.chunks?.length && company.raw_text?.trim()) {
    const { ingestSource } = await import("./ingest-source");
    await ingestSource(
      companyId,
      "legacy-company-description.txt",
      Buffer.from(company.raw_text),
    );
    company = await assembleCanonicalCompany(companyId);
  }
  const chunks = (company.chunks ?? []).filter((c) =>
    company.sources.some(
      (s) => s.id === c.source_id && s.status === "AVAILABLE",
    ),
  );
  if (!chunks.length)
    throw new CompanyError(
      "NO_SOURCE_TEXT",
      "Add company text or a readable document first.",
    );
  for (let i = 0; i < chunks.length; i += 6) {
    const batch = chunks.slice(i, i + 6);
    let json: string | null;
    try {
      json = await llmClient.extract(
        EXTRACTION_SYSTEM_PROMPT,
        batch.map((c) => `[${c.id}]: ${c.text}`).join("\n\n"),
      );
    } catch {
      throw new CompanyError(
        "LLM_REQUEST_FAILED",
        "OpenRouter extraction failed. Your sources are retained; retry the build.",
        502,
      );
    }
    if (!json)
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        "OpenRouter returned no structured output.",
        502,
      );
    company = mergeCompany(company, parseIntelligence(json, companyId, batch));
  }
  company = await saveCanonicalCompany(company);
  return {
    capabilities: company.capabilities.length,
    references: company.references.length,
    qualifications: company.qualifications.length,
  };
}
