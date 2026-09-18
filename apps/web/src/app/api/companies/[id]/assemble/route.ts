import { NextRequest } from "next/server";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { companyErrorResponse } from "@/lib/company/errors";
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(await assembleCanonicalCompany((await params).id));
  } catch (e) {
    return companyErrorResponse(e);
  }
}
