import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ingestSource } from "@/lib/company/ingest-source";

type Ctx = { params: Promise<{ id: string }> };

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: companyId } = await params;

  // Verify company exists
  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).single();
  if (!company) return err("Company not found", 404);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return err("Expected multipart/form-data", 400);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return err("No file provided", 400);

  const f = file as File;
  const buffer = Buffer.from(await f.arrayBuffer());

  const result = await ingestSource(companyId, f.name, buffer);

  return NextResponse.json(
    {
      source_id: result.source.id,
      chunk_count: result.chunks.length,
      duplicate: result.duplicate,
      filename: result.source.filename,
      type: result.source.type,
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
