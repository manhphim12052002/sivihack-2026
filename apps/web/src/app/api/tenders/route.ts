import { NextResponse } from "next/server";
import { listTenders } from "@/lib/tender/db";
import { TENDERS, toSummary } from "@/lib/mock/tenders";

export async function GET() {
  const real = await listTenders(200);
  if (real.length > 0) return NextResponse.json(real);
  // Fall back to mock fixtures when the DB has no lots yet
  return NextResponse.json(TENDERS.map(toSummary));
}
