import { NextRequest, NextResponse } from "next/server";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { toCompanyProfile } from "@/lib/company/model";
import { companyErrorResponse, CompanyError } from "@/lib/company/errors";
import { saveCanonicalCompany } from "@/lib/company/repository";
import { applyReview } from "@/lib/company/review";
import { applyLegacyReview } from "@/lib/company/legacy-review";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const c = await assembleCanonicalCompany((await params).id);
    return NextResponse.json(
      req.nextUrl.searchParams.get("view") === "canonical"
        ? c
        : toCompanyProfile(c),
    );
  } catch (e) {
    return companyErrorResponse(e);
  }
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const c = await assembleCanonicalCompany((await params).id),
      body = await req.json();
    const canonical = "identity" in body;
    const updated = canonical
      ? applyReview(c, body)
      : applyLegacyReview(c, body);
    const saved = await saveCanonicalCompany(updated);
    return NextResponse.json(canonical ? saved : toCompanyProfile(saved));
  } catch (e) {
    return companyErrorResponse(
      e instanceof SyntaxError
        ? new CompanyError("INVALID_INPUT", "Invalid JSON", 400)
        : e,
    );
  }
}
