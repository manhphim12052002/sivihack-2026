import { NextResponse } from "next/server";
import { TENDERS, toSummary } from "@/lib/mock/tenders";

// Placeholder: serves the mock tender batch until the real ingestion pipeline
// (plans/260917-1945-tender-ingestion-pipeline) is wired to Supabase.
export function GET() {
  return NextResponse.json(TENDERS.map(toSummary));
}
