import { NextRequest, NextResponse } from "next/server";
import { loadMatchEvaluation } from "@/lib/match/assemble";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const evaluation = await loadMatchEvaluation(id);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  return NextResponse.json(evaluation);
}
