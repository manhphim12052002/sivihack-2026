import { NextRequest, NextResponse } from "next/server";
import { getLot } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const lot = await getLot(id);
  if (!lot) return NextResponse.json({ error: `Lot ${id} not found` }, { status: 404 });
  return NextResponse.json(lot);
}
