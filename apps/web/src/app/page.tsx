"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { CompanyProfile, TenderSummary, Verdict } from "@/lib/api";
import { CompanyPicker } from "@/components/company-picker";
import { PortfolioBanner, type PortfolioSlot, type SwapCandidate } from "@/components/portfolio-banner";
import { TenderCard } from "@/components/tender-card";

type Row = { verdict: Verdict; tender: TenderSummary | undefined };

/**
 * Weekly triage board. Client-side: switching companies re-runs POST /api/screen (the decision
 * engine in lib/match, layer 1 on every lot, layer 2 on the survivors, stored results reused)
 * and re-renders the shortlist without a page reload. Portfolio slot swaps are held in local state only — there's no backend concept
 * of a stored weekly portfolio yet, same caveat as the tender-review page's human override.
 */
function TriageBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyFromUrl = searchParams.get("company");
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolioOverrides, setPortfolioOverrides] = useState<Record<number, string>>({});
  const [swappingSlot, setSwappingSlot] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.companies(), api.tenders()])
      .then(([companyList, tenderList]) => {
        if (cancelled) return;
        setCompanies(companyList);
        setTenders(tenderList);
        const preselected = companyFromUrl && companyList.some((c) => c.id === companyFromUrl) ? companyFromUrl : companyList[0]?.id;
        if (preselected) setCompanyId(preselected);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load companies or tenders.");
      });
    return () => {
      cancelled = true;
    };
    // Mount-only: companyFromUrl seeds the initial selection, not a live subscription —
    // re-running this fetch on every URL change would refetch companies/tenders needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    async function runScreen() {
      setLoading(true);
      setError(null);
      setPortfolioOverrides({});
      setSwappingSlot(null);
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

  const rows: Row[] = (effectiveVerdicts ?? []).map((verdict) => ({ verdict, tender: tenderById.get(verdict.tender_id) }));
  const bidRows = rows.filter((row) => row.verdict.overall === "Bid").sort((a, b) => (a.verdict.rank ?? 999) - (b.verdict.rank ?? 999));
  const considerRows = rows.filter((row) => row.verdict.overall === "Consider");
  const noGoRows = rows.filter((row) => row.verdict.overall === "NoGo");

  const capacity = selectedCompany?.capacity_per_week ?? null;
  // Top-three is a presentation limit, never an inferred company capacity.
  const shortlistLimit = capacity === null ? 3 : Math.min(3, capacity);
  const defaultPortfolioIds = bidRows.slice(0, shortlistLimit).map((row) => row.verdict.tender_id);
  const portfolioIds = defaultPortfolioIds.map((id, index) => portfolioOverrides[index] ?? id);
  const portfolioSlots: PortfolioSlot[] = portfolioIds
    .map((id) => rows.find((row) => row.verdict.tender_id === id))
    .filter((row): row is Row => Boolean(row))
    .map((row) => ({ tenderId: row.verdict.tender_id, title: row.tender?.title ?? row.verdict.tender_id, value: row.tender?.estimated_value_eur, deadline: row.tender?.submission_deadline }));

  const swapPool: SwapCandidate[] = bidRows
    .filter((row) => !portfolioIds.includes(row.verdict.tender_id))
    .map((row) => ({ tenderId: row.verdict.tender_id, title: row.tender?.title ?? row.verdict.tender_id, overall: row.verdict.overall }));

  const onTheDeskIds = new Set(portfolioIds);
  const otherBidRows = bidRows.filter((row) => !onTheDeskIds.has(row.verdict.tender_id));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">This Week&rsquo;s Opportunities</h1>
          <p className="mt-1 text-zinc-600">{selectedCompany?.name ?? "Pick a company to screen this week’s batch against its profile."}</p>
        </div>
        <div className="flex items-center gap-4">
          <CompanyPicker companies={companies} value={companyId} onChange={setCompanyId} />
        </div>
      </div>

      {companies.length === 0 && !error && (
        <p className="text-sm text-zinc-500">
          No companies yet —{" "}
          <button type="button" onClick={() => router.push("/companies")} className="text-blue-700 underline">
            add one first
          </button>
          .
        </p>
      )}
      {error && <p className="rounded border border-[--color-skip] bg-[--color-skip-soft] px-3 py-2 text-[--color-skip]">{error}</p>}
      {loading && <p className="text-zinc-500">Screening…</p>}

      {!loading && effectiveVerdicts && (
        <div className="space-y-8">
          <PortfolioBanner
            slots={portfolioSlots}
            capacity={capacity}
            swappingSlot={swappingSlot}
            swapPool={swapPool}
            onOpenSwap={(slot) => setSwappingSlot(slot)}
            onCancelSwap={() => setSwappingSlot(null)}
            onChooseReplacement={(slot, tenderId) => {
              setPortfolioOverrides((current) => ({ ...current, [slot]: tenderId }));
              setSwappingSlot(null);
            }}
            onOpenTender={(tenderId) => router.push(`/tenders/${tenderId}?company=${companyId}`)}
          />

          <TriageSection key={`pursue-${companyId}`} textClass="text-[--color-pursue]" title="Pursue" rows={otherBidRows} companyId={companyId} emptyNote="Everything worth pursuing this week is already in the portfolio above." />
          <TriageSection key={`review-${companyId}`} textClass="text-[--color-review]" title="Review" rows={considerRows} companyId={companyId} />
          <TriageSection key={`skip-${companyId}`} textClass="text-[--color-skip]" title="Skip" rows={noGoRows} companyId={companyId} />
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

function TriageSection({
  textClass,
  title,
  rows,
  companyId,
  emptyNote,
}: {
  textClass: string;
  title: string;
  rows: Row[];
  companyId: string;
  emptyNote?: string;
}) {
  const [page, setPage] = useState(1);

  if (rows.length === 0) {
    if (!emptyNote) return null;
    return (
      <section>
        <SectionHeader textClass={textClass} title={title} count={0} />
        <p className="mt-2 text-sm text-zinc-500">{emptyNote}</p>
      </section>
    );
  }

  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const clampedPage = Math.min(page, pageCount);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <section>
      <SectionHeader textClass={textClass} title={title} count={rows.length} />
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageRows.map(({ verdict, tender }) => (
          <TenderCard key={verdict.tender_id} tender={tender} verdict={verdict} companyId={companyId} />
        ))}
      </div>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
              className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono">
              {clampedPage} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={clampedPage >= pageCount}
              className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionHeader({ textClass, title, count }: { textClass: string; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className={`font-semibold tracking-wide uppercase ${textClass}`}>{title}</h2>
      <span className="font-mono text-sm text-zinc-400">{String(count).padStart(2, "0")}</span>
    </div>
  );
}

export default function TriagePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-8 text-zinc-500">Loading…</div>}>
      <TriageBoard />
    </Suspense>
  );
}
