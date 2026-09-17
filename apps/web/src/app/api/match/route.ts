import { NextRequest, NextResponse } from "next/server";
import { runMatchEvaluation } from "@/lib/match/assemble";
import type { TenderDetail } from "@/lib/match/types";

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { tender_id?: string; company_id?: string };

  if (!body.tender_id) return err("tender_id required");
  if (!body.company_id) return err("company_id required");

  // Fetch TenderDetail from FastAPI
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  let tender: TenderDetail;
  try {
    const res = await fetch(`${apiUrl}/tenders/${encodeURIComponent(body.tender_id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return err(`Tender ${body.tender_id} not found`, 404);
    tender = (await res.json()) as TenderDetail;
  } catch {
    return NextResponse.json({ error: "Could not reach tender API" }, { status: 502 });
  }

  try {
    const evaluation = await runMatchEvaluation(tender, body.company_id);
    return NextResponse.json(evaluation);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Evaluation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
