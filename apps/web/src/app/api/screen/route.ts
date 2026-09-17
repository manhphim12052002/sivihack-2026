import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rowToProfile } from "@/lib/company/create";
import { screenTender, rankVerdicts } from "@/lib/screening/engine";
import { TENDERS, findTender } from "@/lib/mock/tenders";
import type { ScreenRequest } from "@/lib/api";

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Runs the placeholder rule engine (see lib/screening/engine.ts) for a real, Supabase-backed
// company profile against the mock tender batch (lib/mock/tenders.ts). `tender_ids` narrows
// the screen to a subset (the tender briefing page passes exactly one) — omitted or null
// screens the whole batch, which is what the triage board needs.
export async function POST(req: NextRequest) {
  let body: ScreenRequest;
  try {
    body = (await req.json()) as ScreenRequest;
  } catch {
    return err("Invalid JSON", 400);
  }

  if (!body.company_id) return err("company_id is required", 400);

  const { data, error } = await supabase.from("companies").select("*").eq("id", body.company_id).single();
  if (error || !data) return err(`Company ${body.company_id} not found`, 404);
  const company = rowToProfile(data as Record<string, unknown>);

  const tenders = body.tender_ids && body.tender_ids.length > 0
    ? body.tender_ids.map(findTender).filter((t): t is NonNullable<typeof t> => Boolean(t))
    : TENDERS;

  const now = new Date();
  const verdicts = tenders.map((tender) => screenTender(company, tender, now));
  const ranked = rankVerdicts(verdicts, (tenderId) => findTender(tenderId)?.estimated_value_eur ?? null);

  return NextResponse.json(ranked);
}
