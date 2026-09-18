import { NextRequest } from "next/server";
import { extractCompanyIntelligence } from "@/lib/company/extract";
import { companyErrorResponse } from "@/lib/company/errors";
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    return Response.json({
      ok: true,
      ...(await extractCompanyIntelligence(id)),
    });
  } catch (e) {
    return companyErrorResponse(e, id);
  }
}
