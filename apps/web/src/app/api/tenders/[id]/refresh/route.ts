import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTender } from "@/lib/tender/db";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { runMatchEvaluation } from "@/lib/match/assemble";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Re-evaluates every onboarded company against one lot. Called after a new notice/lot lands
 * (pipeline ingest, or once /api/ingest is wired to a real source) so screening results are
 * refreshed for existing companies instead of only appearing on their next manual "Screen".
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tender = await getTender(id);
  if (!tender) return NextResponse.json({ error: `Tender ${id} not found` }, { status: 404 });

  const { data, error } = await db.from("companies").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const companyIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

  let evaluated = 0;
  const failed: string[] = [];
  await Promise.all(
    companyIds.map(async (companyId) => {
      try {
        const company = await assembleCanonicalCompany(companyId);
        await runMatchEvaluation(tender, company);
        evaluated++;
      } catch {
        failed.push(companyId);
      }
    }),
  );

  return NextResponse.json({ tender_id: id, companies_evaluated: evaluated, companies_failed: failed });
}
