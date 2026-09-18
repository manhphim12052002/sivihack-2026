import { companyErrorResponse } from '@/lib/company/errors';
import { NextRequest, NextResponse } from "next/server";
import { runMatchEvaluation, runAllLotEvaluations } from "@/lib/match/assemble";
import { getTender } from "@/lib/tender/db";
import { findTender } from "@/lib/mock/tenders";
import type { TenderDetail } from "@/lib/match/types";

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchTender(tenderId: string): Promise<TenderDetail | null> {
  // Try real DB first, then mock fixtures
  const real = await getTender(tenderId);
  if (real) return real as TenderDetail;
  return (findTender(tenderId) as TenderDetail | undefined) ?? null;
}

/**
 * POST /api/match
 * Body: { tender_id, company_id, lot_id?, all_lots? }
 *
 * - Without lot_id: evaluate company against whole tender
 * - With lot_id:    evaluate company against that specific lot
 * - With all_lots:  evaluate company against every lot, returns array
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    tender_id?: string;
    company_id?: string;
    lot_id?: string;
    all_lots?: boolean;
  };

  if (!body.tender_id) return err("tender_id required");
  if (!body.company_id) return err("company_id required");

  const tender = await fetchTender(body.tender_id);
  if (!tender) return err(`Tender ${body.tender_id} not found`, 404);

  try {
    if (body.all_lots) {
      const evaluations = await runAllLotEvaluations(tender, body.company_id);
      return NextResponse.json(evaluations);
    }
    const evaluation = await runMatchEvaluation(tender, body.company_id, body.lot_id);
    return NextResponse.json(evaluation);
  } catch (e) {
    return companyErrorResponse(e);
  }
}
