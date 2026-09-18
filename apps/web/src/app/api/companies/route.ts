import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCompany } from "@/lib/company/create";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { toCompanyProfile } from "@/lib/company/model";
import { ingestSource } from "@/lib/company/ingest-source";
import { extractCompanyIntelligence } from "@/lib/company/extract";
import { ensureDemoCompanies } from "@/lib/company/samples";
import { CompanyError, companyErrorResponse } from "@/lib/company/errors";
import { runMatchEvaluation } from "@/lib/match/assemble";
import { listTriageTenders, getTender } from "@/lib/tender/db";
import type { CanonicalCompany } from "@/lib/company/types";

/**
 * Pre-populates the evaluation cache for a newly onboarded company against the current
 * notice batch, so the triage board and briefing pages show verdicts immediately instead
 * of waiting for a manual "Screen" click. Best-effort: one lot failing (e.g. missing
 * documents) must not fail company creation, so failures are swallowed per lot.
 */
async function evaluateAgainstTriageBatch(company: CanonicalCompany): Promise<void> {
  const tenders = await listTriageTenders(40);
  await Promise.all(
    tenders.map(async (summary) => {
      try {
        const tender = await getTender(summary.id);
        if (tender) await runMatchEvaluation(tender, company);
      } catch {
        // Best-effort enrichment — the company is still created and can be re-screened later.
      }
    }),
  );
}

export async function GET() {
  try {
    await ensureDemoCompanies();
    const { data, error } = await db
      .from("companies")
      .select("id")
      .order("created_at", { ascending: false });
    if (error) throw new CompanyError("DATABASE_ERROR", error.message, 500);
    return NextResponse.json(
      await Promise.all(
        ((data ?? []) as Array<{ id: string }>).map(async (r) =>
          toCompanyProfile(await assembleCanonicalCompany(r.id)),
        ),
      ),
    );
  } catch (e) {
    return companyErrorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  let id: string | undefined;
  try {
    let filename: string, buffer: Buffer, name: string;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!file || typeof file === "string")
        throw new CompanyError(
          "INVALID_INPUT",
          "Choose a company document.",
          400,
        );
      filename = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
      name = filename.replace(/\.[^.]+$/, "");
    } else {
      const body = await req.json();
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text)
        throw new CompanyError(
          "INVALID_INPUT",
          "Paste company information.",
          400,
        );
      filename = "company-description.txt";
      buffer = Buffer.from(text);
      name = text.split("\n")[0].slice(0, 60);
    }
    if (buffer.length > 15 * 1024 * 1024)
      throw new CompanyError(
        "FILE_TOO_LARGE",
        "Please use a document below 15 MB.",
        413,
      );
    const shell = await createCompany({ name });
    id = shell.id;
    await ingestSource(id, filename, buffer);
    await extractCompanyIntelligence(id);
    const company = await assembleCanonicalCompany(id);
    await evaluateAgainstTriageBatch(company);
    return NextResponse.json(toCompanyProfile(company), { status: 201 });
  } catch (e) {
    return companyErrorResponse(e, id);
  }
}
