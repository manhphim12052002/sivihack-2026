import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { assembleCanonicalCompany } from "@/lib/company/assemble";

type Ctx = { params: Promise<{ id: string }> };

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id: companyId } = await params;

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .single();
  if (!company) return err("Company not found", 404);

  const canonical = await assembleCanonicalCompany(companyId);
  return NextResponse.json(canonical);
}
