import { NextRequest, NextResponse } from "next/server";
import { getTender } from "@/lib/tender/db";
import { findTender } from "@/lib/mock/tenders";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const real = await getTender(id);
  if (real) return NextResponse.json(real);

  // Fall back to mock fixtures (mock ids are t1..t9)
  const mock = findTender(id);
  if (mock) return NextResponse.json(mock);

  return NextResponse.json({ error: `Tender ${id} not found` }, { status: 404 });
}
