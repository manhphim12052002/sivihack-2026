import { NextRequest, NextResponse } from "next/server";
import { getTender } from "@/lib/tender/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tender = await getTender(id);
  if (tender) return NextResponse.json(tender);
  return NextResponse.json({ error: `Tender ${id} not found` }, { status: 404 });
}
