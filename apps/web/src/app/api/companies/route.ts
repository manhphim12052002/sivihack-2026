import { NextRequest, NextResponse } from "next/server";
import { listCompanies, upsertCompany } from "@/lib/assets";
import { llmClient } from "@/lib/llm";
import { genId } from "@/lib/id";
import type { CompanyProfile } from "@/lib/api";

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ code, error: message }, { status });
}

export async function GET() {
  return NextResponse.json(await listCompanies());
}

export async function POST(req: NextRequest) {
  let rawText = "";
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!file || typeof file === "string") return err("INVALID_INPUT", "Choose a company document.");
      if ((file as File).size > 15 * 1024 * 1024) return err("FILE_TOO_LARGE", "Please use a document below 15 MB.", 413);
      rawText = await (file as File).text();
    } else {
      const body = await req.json();
      rawText = typeof body.text === "string" ? body.text.trim() : "";
      if (!rawText) return err("INVALID_INPUT", "Paste company information.");
    }
  } catch {
    return err("INVALID_INPUT", "Could not parse request.", 400);
  }

  if (!llmClient) return err("LLM_UNAVAILABLE", "No OPENROUTER_API_KEY set — cannot extract company profile.", 503);

  const SYSTEM = `Extract a construction company profile from the supplied text. Return a JSON object with these fields (omit fields that cannot be determined):
{
  "name": string,
  "home_base": string,
  "regions": string[],
  "radius_km": number | null,
  "trades": string[],
  "cpv_prefixes": string[],
  "contract_min_eur": number | null,
  "contract_max_eur": number | null,
  "partner_threshold_eur": number | null,
  "guarantee_capacity_eur": number | null,
  "self_perform_share_pct": number | null,
  "earliest_start": string | null,
  "capacity_per_week": number | null,
  "references_held": string[],
  "hard_exclusions": string[]
}
CPV prefixes for construction start with 45. Monetary values are EUR numbers. Return only valid JSON.`;

  let extracted: Partial<CompanyProfile>;
  try {
    const raw = await llmClient.extract(SYSTEM, rawText, { task: "company_profile_extraction" });
    if (!raw) return err("LLM_EMPTY", "Model returned no output.", 502);
    extracted = JSON.parse(raw) as Partial<CompanyProfile>;
  } catch (e) {
    return err("LLM_PARSE_ERROR", e instanceof Error ? e.message : "Could not parse model output.", 502);
  }

  const company: CompanyProfile = {
    id: genId("company"),
    name: extracted.name ?? rawText.split("\n")[0].slice(0, 60),
    home_base: extracted.home_base ?? "",
    regions: extracted.regions ?? [],
    radius_km: extracted.radius_km ?? null,
    trades: extracted.trades ?? [],
    cpv_prefixes: extracted.cpv_prefixes ?? [],
    contract_min_eur: extracted.contract_min_eur ?? null,
    contract_max_eur: extracted.contract_max_eur ?? null,
    partner_threshold_eur: extracted.partner_threshold_eur ?? null,
    guarantee_capacity_eur: extracted.guarantee_capacity_eur ?? null,
    self_perform_share_pct: extracted.self_perform_share_pct ?? null,
    earliest_start: extracted.earliest_start ?? null,
    capacity_per_week: extracted.capacity_per_week ?? null,
    references_held: extracted.references_held ?? [],
    hard_exclusions: extracted.hard_exclusions ?? [],
    raw_text: rawText,
  };

  await upsertCompany(company);
  return NextResponse.json(company, { status: 201 });
}
