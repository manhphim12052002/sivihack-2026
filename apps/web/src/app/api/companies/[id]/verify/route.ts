import { NextRequest } from "next/server";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { saveCanonicalCompany } from "@/lib/company/repository";
import { CompanyError, companyErrorResponse } from "@/lib/company/errors";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await req.json();
    const section = (
      {
        company_capabilities: "capabilities",
        company_references: "references",
        company_qualifications: "qualifications",
      } as const
    )[body.table as "company_capabilities"];
    if (!section || !["CONFIRMED", "REJECTED"].includes(body.status))
      throw new CompanyError("INVALID_INPUT", "Invalid review request.", 400);
    const c = await assembleCanonicalCompany((await params).id);
    const r = c[section].find((r) => r.id === body.item_id);
    if (!r) throw new CompanyError("INVALID_INPUT", "Item not found.", 404);
    r.status = body.status;
    await saveCanonicalCompany(c);
    return Response.json({ ok: true });
  } catch (e) {
    return companyErrorResponse(e);
  }
}
