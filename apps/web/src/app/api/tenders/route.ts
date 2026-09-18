import { NextResponse } from "next/server";
import { listLots, lotToSummary } from "@/lib/assets";

export async function GET() {
  return NextResponse.json(listLots().map(lotToSummary));
}
