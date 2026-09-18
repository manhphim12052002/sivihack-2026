import { NextRequest, NextResponse } from "next/server";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { toCompanyProfile } from "@/lib/company/model";
import { screenTender, rankVerdicts } from "@/lib/screening/engine";
import { TENDERS, findTender } from "@/lib/mock/tenders";
import { findCompany } from "@/lib/mock/companies";
import type { ScreenRequest } from "@/lib/api";

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Runs the placeholder rule engine (see lib/screening/engine.ts) for a company profile
// against the mock tender batch (lib/mock/tenders.ts). Falls back to mock company profiles
// when the data backend has no matching row (demo / offline mode).
export async function POST(req: NextRequest) {
  let body: ScreenRequest;
  try {
    body = (await req.json()) as ScreenRequest;
  } catch {
    return err("Invalid JSON", 400);
  }

  if (!body.company_id) return err("company_id is required", 400);

  let company;
  try { company = toCompanyProfile(await assembleCanonicalCompany(body.company_id)); }
  catch (e) { return err(e instanceof Error ? e.message : 'Company unavailable', 500); }

  const tenders = body.tender_ids && body.tender_ids.length > 0
    ? body.tender_ids.map(findTender).filter((t): t is NonNullable<typeof t> => Boolean(t))
    : TENDERS;

  const now = new Date();
  const verdicts = tenders.map((tender) => screenTender(company, tender, now));
  const ranked = rankVerdicts(verdicts, (tenderId) => findTender(tenderId)?.estimated_value_eur ?? null);

  return NextResponse.json(ranked);
}
