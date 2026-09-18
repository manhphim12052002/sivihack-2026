import { NextRequest, NextResponse } from "next/server";
import { getCompany, listLots, getLot } from "@/lib/assets";
import { screenTender, rankVerdicts } from "@/lib/screening/engine";
import type { ScreenRequest } from "@/lib/api";

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: ScreenRequest;
  try { body = (await req.json()) as ScreenRequest; }
  catch { return err("Invalid JSON", 400); }

  if (!body.company_id) return err("company_id is required", 400);

  const company = getCompany(body.company_id);
  if (!company) return err(`Company ${body.company_id} not found`, 404);

  const lots =
    body.tender_ids && body.tender_ids.length > 0
      ? body.tender_ids.map(getLot).filter((l): l is NonNullable<typeof l> => Boolean(l))
      : listLots();

  const now = new Date();
  const verdicts = lots.map((lot) => screenTender(company, lot, now));
  const ranked = rankVerdicts(verdicts, (id) => getLot(id)?.estimated_value_eur ?? null);

  return NextResponse.json(ranked);
}
