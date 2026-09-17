import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rowToProfile } from "@/lib/company/create";
import type { CompanyProfile } from "@/lib/api";
import { findCompany } from "@/lib/mock/companies";

type Ctx = { params: Promise<{ id: string }> };

function err(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).single();
  if (error) {
    const mock = findCompany(id);
    if (mock) return NextResponse.json(mock);
    return err(error.message, 404);
  }
  return NextResponse.json(rowToProfile(data as Record<string, unknown>));
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let body: Partial<CompanyProfile> = {};
  try {
    body = (await req.json()) as Partial<CompanyProfile>;
  } catch {
    return err("Invalid JSON", 400);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.home_base !== undefined) update.home_base = body.home_base;
  if (body.regions !== undefined) update.regions = body.regions;
  if (body.radius_km !== undefined) update.radius_km = body.radius_km;
  if (body.trades !== undefined) update.trades = body.trades;
  if (body.cpv_prefixes !== undefined) update.cpv_prefixes = body.cpv_prefixes;
  if (body.contract_min_eur !== undefined) update.contract_min_eur = body.contract_min_eur;
  if (body.contract_max_eur !== undefined) update.contract_max_eur = body.contract_max_eur;
  if (body.partner_threshold_eur !== undefined) update.partner_threshold_eur = body.partner_threshold_eur;
  if (body.guarantee_capacity_eur !== undefined) update.guarantee_capacity_eur = body.guarantee_capacity_eur;
  if (body.self_perform_share_pct !== undefined) update.self_perform_share_pct = body.self_perform_share_pct;
  if (body.earliest_start !== undefined) update.earliest_start = body.earliest_start;
  if (body.capacity_per_week !== undefined) update.capacity_per_week = body.capacity_per_week;
  if (body.references_held !== undefined) update.references_held = body.references_held;
  if (body.hard_exclusions !== undefined) update.hard_exclusions = body.hard_exclusions;
  if (body.raw_text !== undefined) update.raw_text = body.raw_text;

  const { data, error } = await supabase
    .from("companies")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return err(error.message);
  return NextResponse.json(rowToProfile(data as Record<string, unknown>));
}
