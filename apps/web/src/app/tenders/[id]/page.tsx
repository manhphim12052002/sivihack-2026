import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { TenderDetail, Verdict } from "@/lib/api";
import { formatEur } from "@/lib/status";
import { CriterionTable } from "@/components/criterion-table";
import { FactSheet } from "@/components/fact-sheet";
import { VerdictBadge } from "@/components/verdict-badge";

/**
 * Tender briefing. Server component: reads run on the server, so an offline
 * API surfaces as a plain error message here rather than the global banner
 * (which only reacts client-side after hydration).
 */
export default async function TenderBriefingPage({ params, searchParams }: PageProps<"/tenders/[id]">) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const companyParam = resolvedSearchParams.company;
  const companyId = Array.isArray(companyParam) ? companyParam[0] : companyParam;

  let tender: TenderDetail | undefined;
  let loadError: string | null = null;
  try {
    tender = await api.tender(id);
  } catch (err) {
    loadError = err instanceof ApiError ? err.message : "Could not reach the API.";
  }

  if (loadError || !tender) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {loadError ?? "Tender not found."}
        </p>
      </div>
    );
  }

  let verdict: Verdict | null = null;
  let screenError: string | null = null;
  if (companyId) {
    try {
      const [result] = await api.screen(companyId, [id]);
      verdict = result ?? null;
    } catch (err) {
      screenError = err instanceof ApiError ? err.message : "Could not screen this company.";
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <header>
        <p className="text-sm text-zinc-500">
          <Link href="/" className="underline">
            ← Back to triage
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{tender.title ?? "Untitled tender"}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-base sm:grid-cols-4">
          <FactPair label="Buyer" value={tender.buyer_name ?? "Unknown"} />
          <FactPair label="Place" value={tender.place_city ?? "Unknown"} />
          <FactPair label="Value" value={formatEur(tender.estimated_value_eur)} />
          <FactPair label="Deadline (Angebotsfrist)" value={tender.submission_deadline ?? "Unknown"} />
          <FactPair label="CPV" value={tender.cpv_main ?? "Unknown"} />
          <FactPair label="Lots" value={String(tender.lot_count)} />
          <FactPair label="Source" value={tender.source} />
          <FactPair label="Docs retrieved" value={tender.docs_retrieved ? "Yes" : "No"} />
        </dl>
      </header>

      <section>
        <h2 className="text-lg font-semibold">Checklist</h2>
        {!companyId && (
          <p className="mt-2 text-zinc-600">
            <Link href="/" className="text-blue-700 underline">
              Pick a company
            </Link>{" "}
            on the triage page to see the checklist for this tender.
          </p>
        )}
        {companyId && screenError && (
          <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{screenError}</p>
        )}
        {companyId && verdict && (
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-3">
              <VerdictBadge overall={verdict.overall} />
              {verdict.summary_en && <p className="text-zinc-700">{verdict.summary_en}</p>}
            </div>
            <CriterionTable criteria={verdict.criteria} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Fact sheet</h2>
        <div className="mt-2">
          <FactSheet factSheet={tender.fact_sheet} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Documents (Vergabeunterlagen)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {tender.docs_retrieved
            ? "Documents retrieved for this tender."
            : "Documents not retrieved — facts below are metadata-only."}
        </p>
        {tender.documents && tender.documents.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-100 rounded border border-zinc-200">
            {tender.documents.map((doc) => (
              <li key={doc.name} className="flex items-center justify-between px-3 py-2 text-base">
                <span>{doc.name}</span>
                <span className="text-sm text-zinc-500">
                  {doc.pages != null ? `${doc.pages} pages · ` : ""}
                  {doc.text_extracted ? "text extracted" : "not read"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-zinc-500">No documents listed.</p>
        )}
      </section>
    </div>
  );
}

function FactPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
