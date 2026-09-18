import { NextResponse } from "next/server";
import { listLots, lotToSummary } from "@/lib/assets";

export async function GET() {
  const lots = await listLots();
  return NextResponse.json(lots.map(lotToSummary));
}
