"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { CriterionResult, Evidence, TenderDetail, Verdict } from "@/lib/api";
import { formatEur } from "@/lib/status";
import { DecisionBreakdown } from "@/components/decision-breakdown";
import { EvidencePanel, type EvidencePanelData } from "@/components/evidence-panel";
import { HumanReviewPanel, type OverrideState } from "@/components/human-review-panel";
import type { MatchEvaluation, ViabilityStatus } from "@/lib/match/types";

const VIABILITY_CLASS: Record<ViabilityStatus, string> = {
  VIABLE: "bg-[var(--color-pursue-soft)] text-[var(--color-pursue)]",
  REVIEW: "bg-[var(--color-review-soft)] text-[var(--color-review)]",
  BLOCKED: "bg-[var(--color-skip-soft)] text-[var(--color-skip)]",
};
const VIABILITY_LABEL: Record<ViabilityStatus, string> = { VIABLE: "Eligible", REVIEW: "Needs review", BLOCKED: "Blocked" };

const OVERALL_LABEL: Record<Verdict["overall"], string> = { Bid: "Pursue", Consider: "Review", NoGo: "Skip" };
const OVERALL_CLASS: Record<Verdict["overall"], string> = {
  Bid: "bg-[var(--color-pursue-soft)] text-[var(--color-pursue)]",
  Consider: "bg-[var(--color-review-soft)] text-[var(--color-review)]",
  NoGo: "bg-[var(--color-skip-soft)] text-[var(--color-skip)]",
};

export function TenderReviewClient({ tenderId, companyId }: { tenderId: string; companyId: string | undefined }) {
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState<EvidencePanelData | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [eligibility, setEligibility] = useState<MatchEvaluation[] | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  useEffect(() => {
    // setState calls live inside this async callback (not directly in the effect body) so
    // this reads as "react to an external change" rather than a synchronous render cascade —
    // same pattern the triage page's screen effect uses.
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setOverride(null);
      try {
        const detail = await api.tender(tenderId);
        if (cancelled) return;
        setTender(detail);
        if (!companyId) return;
        const [result] = await api.screen(companyId, [tenderId]);
        if (!cancelled) setVerdict(result ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not reach the API.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenderId, companyId]);

  if (loading) return <div className="mx-auto max-w-5xl px-6 py-8 text-zinc-500">Loading…</div>;
  if (error || !tender) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="rounded border border-[--color-skip] bg-[--color-skip-soft] px-4 py-3 text-[--color-skip]">{error ?? "Tender not found."}</p>
      </div>
    );
  }

  const effectiveOverall = override?.overall ?? verdict?.overall ?? null;

  async function runEligibility() {
    if (!companyId) return;
    setEligibilityLoading(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tender_id: tenderId, company_id: companyId, all_lots: true }),
      });
      const data = await res.json() as MatchEvaluation | MatchEvaluation[];
      setEligibility(Array.isArray(data) ? data : [data]);
    } catch { /* silently ignore */ }
    finally { setEligibilityLoading(false); }
  }

  function handleViewEvidence(criterion: CriterionResult, ev: Evidence) {
    setEvidence({ criterion: criterion.criterion, doc: ev.doc, page: ev.page, quote_de: ev.quote_de, reason_en: criterion.reason_en, factSheet: tender?.fact_sheet });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <p className="text-sm text-zinc-500">
        <Link href={companyId ? `/?company=${companyId}` : "/"} className="underline">
          ← Back to opportunities
        </Link>
      </p>

      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{tender.title ?? "Untitled tender"}</h1>
            {effectiveOverall && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${OVERALL_CLASS[effectiveOverall]}`}>
                {OVERALL_LABEL[effectiveOverall]}
              </span>
            )}
            {override && <span className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500">Estimator-adjusted</span>}
          </div>
          <div className="flex items-center gap-2">
            {companyId && (
              eligibility ? (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${VIABILITY_CLASS[eligibility[0].viability.status]}`}>
                  {VIABILITY_LABEL[eligibility[0].viability.status]}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={runEligibility}
                  disabled={eligibilityLoading}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {eligibilityLoading ? "Checking…" : "Run eligibility check"}
                </button>
              )
            )}
            {verdict && (
              <button
                type="button"
                onClick={() => setReviewOpen((open) => !open)}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Review AI decision
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          {tender.buyer_name ?? "Unknown buyer"} — {tender.place_city ?? "Unknown"} · {formatEur(tender.estimated_value_eur)} ·{" "}
          {tender.cpv_main ?? "no CPV"}
        </p>
        {verdict?.summary_en && <p className="mt-3 text-zinc-700">{override?.reason || verdict.summary_en}</p>}
      </header>

      {!companyId && (
        <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-600">
          <Link href="/" className="text-blue-700 underline">
            Pick a company
          </Link>{" "}
          on the triage page to see the decision breakdown for this tender.
        </p>
      )}

      {reviewOpen && verdict && (
        <HumanReviewPanel
          currentOverall={verdict.overall}
          onClose={() => setReviewOpen(false)}
          onSave={(next) => {
            setOverride(next);
            setReviewOpen(false);
          }}
        />
      )}

      {verdict && (
        <section>
          <h2 className="text-lg font-semibold">Decision Breakdown</h2>
          <div className="mt-3">
            <DecisionBreakdown criteria={verdict.criteria} onViewEvidence={handleViewEvidence} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">Documents (Vergabeunterlagen)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {tender.docs_retrieved ? "Documents retrieved for this tender." : "Documents not retrieved — facts below are metadata-only."}
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

      <EvidencePanel data={evidence} onClose={() => setEvidence(null)} />
    </div>
  );
}
