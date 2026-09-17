import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// Stub: job polling — not yet connected to a real job store
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ error: `Job ${id} not found` }, { status: 404 });
}
