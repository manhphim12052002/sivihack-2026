import { NextResponse } from "next/server";
import { listTenders } from "@/lib/tender/db";
import { TENDERS, toSummary } from "@/lib/mock/tenders";

export async function GET() {
  // Always include the mock lots so the screen API (which always screens mock IDs)
  // can find card data for them, even when the DB also has real lots.
  const real = await listTenders(200);
  const byId = new Map(TENDERS.map((t) => [t.id, toSummary(t)]));
  for (const t of real) byId.set(t.id, t);
  return NextResponse.json([...byId.values()]);
}
