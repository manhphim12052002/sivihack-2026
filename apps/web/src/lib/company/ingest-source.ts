import { CompanyError } from "./errors";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import { genId } from "@/lib/id";
import type { ChunkRow, SourceRow } from "@/lib/company/types";

// ─── Parsers ──────────────────────────────────────────────────────────────────

interface ParsedChunk {
  page: number | null;
  section: string | null;
  paragraph: number | null;
  cell_range: string | null;
  text: string;
}

async function parsePdf(buffer: Buffer): Promise<ParsedChunk[]> {
  // Dynamic import keeps this server-only
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText().finally(() => parser.destroy());
  // Each page is a PageTextResult with a .text field
  return result.pages
    .map((p, i) => ({
      page: i + 1,
      section: null,
      paragraph: null,
      cell_range: null,
      text: p.text.trim(),
    }))
    .filter((c) => c.text.length > 0);
}

async function parseDocx(buffer: Buffer): Promise<ParsedChunk[]> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const paragraphs = result.value
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return paragraphs.map((text, i) => ({
    page: null,
    section: null,
    paragraph: i + 1,
    cell_range: null,
    text,
  }));
}

async function parseXlsx(buffer: Buffer): Promise<ParsedChunk[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const chunks: ParsedChunk[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
    });
    // Batch rows into groups of 20 to keep chunk sizes manageable
    for (let i = 0; i < rows.length; i += 20) {
      const slice = rows.slice(i, i + 20);
      const text = slice.map((r) => Object.values(r).join("\t")).join("\n");
      if (text.trim().length > 0) {
        chunks.push({
          page: null,
          section: sheetName,
          paragraph: null,
          cell_range: `row ${i + 1}–${i + slice.length}`,
          text: text.trim(),
        });
      }
    }
  }
  return chunks;
}

function parseTxt(text: string): ParsedChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return paragraphs.map((t, i) => ({
    page: null,
    section: null,
    paragraph: i + 1,
    cell_range: null,
    text: t,
  }));
}

// ─── Main ingest function ─────────────────────────────────────────────────────

export interface IngestSourceResult {
  source: SourceRow;
  chunks: ChunkRow[];
  duplicate: boolean;
}

export async function ingestSource(
  companyId: string,
  filename: string,
  buffer: Buffer,
): Promise<IngestSourceResult> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  // Deduplicate: if this exact file was already ingested for this company, skip
  const { data: existing, error: existingError } = await supabase
    .from("sources")
    .select("*")
    .eq("entity_id", companyId)
    .eq("sha256", sha256)
    .eq("status", "AVAILABLE")
    .maybeSingle();

  if (existingError)
    throw new CompanyError("DATABASE_ERROR", existingError.message, 500);
  if (existing?.status === "AVAILABLE") {
    const { data: existingChunks } = await supabase
      .from("chunks")
      .select("*")
      .eq("source_id", existing.id);
    return {
      source: existing as SourceRow,
      chunks: (existingChunks ?? []) as ChunkRow[],
      duplicate: true,
    };
  }

  // Detect format from filename extension
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const type =
    ext === "pdf"
      ? "PDF"
      : ext === "docx"
        ? "DOCX"
        : ext === "xlsx" || ext === "csv"
          ? "XLSX"
          : "TXT";

  if (!["pdf", "docx", "xlsx", "csv", "txt"].includes(ext))
    throw new CompanyError(
      "UNSUPPORTED_FORMAT",
      "Use PDF, DOCX, XLSX, CSV or TXT.",
    );
  // Register source
  const sourceId = genId("CSRC");
  const { data: sourceRow, error: sourceErr } = await supabase
    .from("sources")
    .insert({
      id: sourceId,
      entity_type: "company",
      entity_id: companyId,
      type,
      filename,
      origin: "CUSTOMER_UPLOAD",
      sha256,
      status: "PARSING",
    })
    .select()
    .single();

  if (sourceErr) throw new Error(sourceErr.message);

  // Parse document into chunks
  let parsed: ParsedChunk[] = [];
  try {
    if (type === "PDF") parsed = await parsePdf(buffer);
    else if (type === "DOCX") parsed = await parseDocx(buffer);
    else if (type === "XLSX") parsed = await parseXlsx(buffer);
    else parsed = parseTxt(buffer.toString("utf-8"));
  } catch (e) {
    await supabase
      .from("sources")
      .update({ status: "ERROR" })
      .eq("id", sourceId);
    throw new CompanyError(
      "DOCUMENT_PARSE_ERROR",
      `Could not read ${filename}: ${String(e)}`,
    );
  }
  if (!parsed.length) {
    await supabase
      .from("sources")
      .update({ status: "ERROR" })
      .eq("id", sourceId);
    throw new CompanyError(
      "DOCUMENT_EMPTY",
      "No readable text found. Use a text PDF or paste its text; scanned PDFs need OCR.",
    );
  }
  // Split long pages without discarding their tail. Overlap preserves boundary context.
  parsed = parsed.flatMap((c) => {
    const out: ParsedChunk[] = [];
    for (let offset = 0; offset < c.text.length; offset += 3500)
      out.push({ ...c, text: c.text.slice(offset, offset + 4000) });
    return out;
  });

  // Insert chunks
  const chunkRows = parsed.map((c) => ({
    id: genId("CCHUNK"),
    source_id: sourceId,
    page: c.page,
    section: c.section,
    paragraph: c.paragraph,
    cell_range: c.cell_range,
    text: c.text,
  }));

  if (chunkRows.length > 0) {
    const { error: chunkErr } = await supabase.from("chunks").insert(chunkRows);
    if (chunkErr) throw new Error(chunkErr.message);
  }

  const { error: readyError } = await supabase
    .from("sources")
    .update({ status: "AVAILABLE" })
    .eq("id", sourceId);
  if (readyError)
    throw new CompanyError("DATABASE_ERROR", readyError.message, 500);
  return {
    source: { ...sourceRow, status: "AVAILABLE" } as SourceRow,
    chunks: chunkRows as ChunkRow[],
    duplicate: false,
  };
}
