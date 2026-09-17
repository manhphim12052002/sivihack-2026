import { NextRequest, NextResponse } from "next/server";
import { findTender } from "@/lib/mock/tenders";

type Ctx = { params: Promise<{ id: string }> };

// Placeholder: reads from the mock tender fixtures until the real pipeline lands.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tender = findTender(id);
  if (!tender) return NextResponse.json({ error: `Tender ${id} not found` }, { status: 404 });
  return NextResponse.json(tender);
}
