import { NextRequest } from "next/server";
import { ingestSource } from "@/lib/company/ingest-source";
import { CompanyError, companyErrorResponse } from "@/lib/company/errors";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    let filename: string, buffer: Buffer;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!file || typeof file === "string")
        throw new CompanyError("INVALID_INPUT", "Choose a document.", 400);
      filename = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (typeof body.text !== "string" || !body.text.trim())
        throw new CompanyError("INVALID_INPUT", "Paste information.", 400);
      filename = "company-description.txt";
      buffer = Buffer.from(body.text);
    }
    if (buffer.length > 15 * 1024 * 1024)
      throw new CompanyError(
        "FILE_TOO_LARGE",
        "Use a document below 15 MB.",
        413,
      );
    const r = await ingestSource(id, filename, buffer);
    return Response.json({
      source_id: r.source.id,
      chunk_count: r.chunks.length,
      duplicate: r.duplicate,
    });
  } catch (e) {
    return companyErrorResponse(e, id);
  }
}
