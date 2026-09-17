import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };
type Body = {
  table: "company_capabilities" | "company_references" | "company_qualifications";
  item_id: string;
  status: "CONFIRMED" | "REJECTED";
};

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const ALLOWED_TABLES = new Set([
  "company_capabilities",
  "company_references",
  "company_qualifications",
]);

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: companyId } = await params;
  const body = (await req.json()) as Body;

  if (!ALLOWED_TABLES.has(body.table)) return err("Invalid table");
  if (!body.item_id) return err("item_id required");
  if (body.status !== "CONFIRMED" && body.status !== "REJECTED") return err("Invalid status");

  const { error } = await supabase
    .from(body.table)
    .update({ status: body.status })
    .eq("id", body.item_id)
    .eq("company_id", companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
