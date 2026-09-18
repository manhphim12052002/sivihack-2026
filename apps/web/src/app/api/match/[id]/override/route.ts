import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadMatchEvaluation } from "@/lib/match/assemble";

type Ctx = { params: Promise<{ id: string }> };
type Body = { result_id: string; status: "PASS" | "FAIL" | "UNCERTAIN"; reason: string };

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: evaluationId } = await params;
  const body = (await req.json()) as Body;

  if (!body.result_id) return err("result_id required");
  if (!["PASS", "FAIL", "UNCERTAIN"].includes(body.status)) return err("Invalid status");
  if (!body.reason?.trim()) return err("reason required");

  const { error } = await db
    .from("match_results")
    .update({
      override_status: body.status,
      override_reason: body.reason,
      override_at: new Date().toISOString(),
    })
    .eq("id", body.result_id)
    .eq("evaluation_id", evaluationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = await loadMatchEvaluation(evaluationId);
  if (!updated) return err("Evaluation not found", 404);
  return NextResponse.json(updated);
}
