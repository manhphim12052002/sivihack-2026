import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createCompany, normalizeAndUpdate, rowToProfile } from "@/lib/company/create";

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return err(error.message);
  return NextResponse.json((data ?? []).map((row) => rowToProfile(row as Record<string, unknown>)));
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // ── File upload path ──────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return err("No file provided", 400);

    const name = (file as File).name ?? "upload";
    const profile = await createCompany({ name: name.replace(/\.[^.]+$/, ""), raw_text: "" });
    return NextResponse.json(profile, { status: 201 });
  }

  // ── JSON / text path ──────────────────────────────────────────────────────
  let body: { text?: string; name?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err("Invalid JSON", 400);
  }

  const rawText = body.text?.trim() ?? "";
  if (!rawText) return err("text is required", 400);

  // Derive a company name from the first line or first 60 chars
  const firstName = rawText.split("\n")[0]?.slice(0, 60) ?? "New Company";
  const profile = await createCompany({ name: firstName, raw_text: rawText });

  if (rawText) {
    const normalized = await normalizeAndUpdate(profile.id, rawText);
    return NextResponse.json(normalized, { status: 201 });
  }

  return NextResponse.json(profile, { status: 201 });
}
