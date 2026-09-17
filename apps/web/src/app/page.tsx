"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { CompanyProfile, TenderSummary, Verdict } from "@/lib/api";
import { formatEur } from "@/lib/status";
import { VerdictBadge } from "@/components/verdict-badge";

type Row = { verdict: Verdict; tender: TenderSummary | undefined };

/**
 * Triage board. Fully client-side: the company list and screen results are
 * fetched in the browser so switching companies re-runs `/screen` and
 * re-renders the shortlist without a page reload or a server round-trip.
 */
export default function TriagePage() {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.companies(), api.tenders()])
      .then(([companyList, tenderList]) => {
        if (cancelled) return;
        setCompanies(companyList);
        setTenders(tenderList);
        if (companyList.length > 0) setCompanyId(companyList[0].id);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load companies or tenders.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // No setState here when companyId is empty — `effectiveVerdicts` below
    // derives the "nothing selected" view instead, so the effect never
    // triggers a synchronous cascading render.
    if (!companyId) return;
    let cancelled = false;
    // setState calls live inside this async callback (not directly in the
    // effect body) so the screen re-run reads as "react to an external
    // change", not a synchronous render cascade.
    async function runScreen() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.screen(companyId);
        if (!cancelled) setVerdicts(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Screening failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void runScreen();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const tenderById = useMemo(() => new Map(tenders.map((tender) => [tender.id, tender])), [tenders]);
  const selectedCompany = companies.find((company) => company.id === companyId);
  const effectiveVerdicts = companyId ? verdicts : null;

  const rows: Row[] = (effectiveVerdicts ?? []).map((verdict) => ({
    verdict,
    tender: tenderById.get(verdict.tender_id),
  }));
  const bids = rows.filter((row) => row.verdict.overall === "Bid");
  // Shortlist size = the company's own weekly capacity — everything else the
  // estimator sees but does not have to act on this week.
  const capacity = selectedCompany?.capacity_per_week ?? 3;
  const onTheDesk = bids.slice(0, capacity);
  const otherBids = bids.slice(capacity);
  const consider = rows.filter((row) => row.verdict.overall === "Consider");
  const noGo = rows.filter((row) => row.verdict.overall === "NoGo");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Weekly triage</h1>
      <p className="mt-1 text-zinc-600">Pick a company to screen this week&rsquo;s batch against its profile.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="company" className="text-sm font-medium">
          Company
        </label>
        <select
          id="company"
          className="rounded border border-zinc-300 px-3 py-2 text-base"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
        >
          {companies.length === 0 && <option value="">No companies yet</option>}
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        {companies.length === 0 && (
          <Link href="/companies" className="text-sm text-blue-700 underline">
            Add a company first
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{error}</p>
      )}
      {loading && <p className="mt-4 text-zinc-500">Screening…</p>}

      {!loading && effectiveVerdicts && (
        <div className="mt-6 space-y-8">
          <TriageSection title="On the desk" rows={onTheDesk} companyId={companyId} />
          <TriageSection title="Other Bids" rows={otherBids} companyId={companyId} />
          <TriageSection title="Consider" rows={consider} companyId={companyId} />
          <TriageSection title="No-go" rows={noGo} companyId={companyId} />
        </div>
      )}
    </div>
  );
}

function TriageSection({ title, rows, companyId }: { title: string; rows: Row[]; companyId: string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold">
        {title} <span className="font-normal text-zinc-400">({rows.length})</span>
      </h2>
      <div className="mt-2 overflow-x-auto rounded border border-zinc-200">
        <table className="w-full min-w-[900px] text-left text-base">
          <thead className="bg-zinc-50 text-sm text-zinc-500">
            <tr>
              <th className="px-3 py-2">Tender</th>
              <th className="px-3 py-2">Buyer</th>
              <th className="px-3 py-2">Place</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Overall</th>
              <th className="px-3 py-2">Blocker / Risk / Unknown</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ verdict, tender }) => (
              <tr key={verdict.tender_id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <Link
                    href={`/tenders/${verdict.tender_id}?company=${companyId}`}
                    className="font-medium text-blue-700 underline"
                  >
                    {tender?.title ?? verdict.tender_id}
                  </Link>
                </td>
                <td className="px-3 py-2">{tender?.buyer_name ?? "Unknown"}</td>
                <td className="px-3 py-2">{tender?.place_city ?? "Unknown"}</td>
                <td className="px-3 py-2">{formatEur(tender?.estimated_value_eur)}</td>
                <td className="px-3 py-2">
                  <VerdictBadge overall={verdict.overall} />
                </td>
                <td className="px-3 py-2 text-sm">
                  <span className="text-red-700">{verdict.blockers} Blocker</span>
                  {" · "}
                  <span className="text-amber-700">{verdict.risks} Risk</span>
                  {" · "}
                  <span className="text-zinc-500">{verdict.unknowns} Unknown</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
