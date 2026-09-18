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

  const company = await getCompany(body.company_id);
  if (!company) return err(`Company ${body.company_id} not found`, 404);

  const lots =
    body.tender_ids && body.tender_ids.length > 0
      ? (await Promise.all(body.tender_ids.map(getLot))).filter(
          (l): l is NonNullable<typeof l> => Boolean(l),
        )
      : await listLots();

  const now = new Date();
  const verdicts = lots.map((lot) => screenTender(company, lot, now));
  // Ranking ties break on contract size; every verdict came from `lots`, so no second read.
  const valueById = new Map(lots.map((l) => [l.id, l.estimated_value_eur ?? null]));
  const ranked = rankVerdicts(verdicts, (id) => valueById.get(id) ?? null);

  return NextResponse.json(ranked);
}
