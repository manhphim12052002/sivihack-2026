import { NextRequest, NextResponse } from "next/server";
import { getCompany, upsertCompany, deleteCompany } from "@/lib/assets";
import type { CompanyProfile } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

function notFound(id: string) {
  return NextResponse.json({ error: `Company ${id} not found` }, { status: 404 });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) return notFound(id);
  return NextResponse.json(company);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) return notFound(id);
  let patch: Partial<CompanyProfile>;
  try { patch = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updated: CompanyProfile = { ...company, ...patch, id };
  await upsertCompany(updated);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const existed = await deleteCompany(id);
  if (!existed) return notFound(id);
  return new NextResponse(null, { status: 204 });
}
