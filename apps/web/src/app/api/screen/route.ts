import { NextRequest, NextResponse } from "next/server";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { companyErrorResponse } from "@/lib/company/errors";
import { loadStoredEvaluations, runMatchEvaluation } from "@/lib/match/assemble";
import { evaluationToVerdict, rankVerdicts } from "@/lib/match/verdict";
import { getTender, listTriageTenders } from "@/lib/tender/db";
import type { ScreenRequest, Verdict } from "@/lib/api";

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Screens one company against the week's batch (or the given tender ids) with the real decision
 * engine — layer 1 hard gate on every lot, layer 2 only on the survivors — and returns the
 * Verdict shape the triage board and briefing header render.
 */
export async function POST(req: NextRequest) {
  let body: ScreenRequest & { force?: boolean };
  try {
    body = (await req.json()) as ScreenRequest & { force?: boolean };
  } catch {
    return err("Invalid JSON", 400);
  }
  if (!body.company_id) return err("company_id is required", 400);

  try {
    const company = await assembleCanonicalCompany(body.company_id);
    const ids = body.tender_ids && body.tender_ids.length > 0
      ? body.tender_ids
      : (await listTriageTenders(40)).map((t) => t.id);

    // Lots screened before are read back from the store; `force` recomputes everything.
    const stored = body.force ? new Map() : await loadStoredEvaluations(company.company_id, ids);
    const verdicts: Verdict[] = [];
    // Sequential on purpose: the hard gate is cheap, and only the few lots that pass it reach
    // the model, so this stays well inside the provider's rate limits.
    for (const id of ids) {
      const cached = stored.get(id);
      if (cached) {
        verdicts.push(evaluationToVerdict(cached, company.company_id));
        continue;
      }
      const tender = await getTender(id);
      if (!tender) continue;
      const evaluation = await runMatchEvaluation(tender, company);
      verdicts.push(evaluationToVerdict(evaluation, company.company_id));
    }
    const values = new Map<string, number | null>();
    for (const id of ids) values.set(id, null);
    return NextResponse.json(rankVerdicts(verdicts, (tenderId) => values.get(tenderId) ?? null));
  } catch (e) {
    return companyErrorResponse(e);
  }
}
