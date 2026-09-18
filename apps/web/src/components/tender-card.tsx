import Link from "next/link";
import type { CriterionResult, TenderSummary, Verdict } from "@/lib/api";
import { formatEur } from "@/lib/status";


function callout(criteria: CriterionResult[]): { label: string; text: string; tone: "fail" | "risk" } | null {
  const blocker = criteria.find((c) => c.status === "Blocker");
  if (blocker) return { label: "Hard blocker", text: blocker.reason_en, tone: "fail" };
  const risk = criteria.find((c) => c.status === "Risk");
  if (risk) return { label: "Soft concern", text: risk.reason_en, tone: "risk" };
  return null;
}

/** One tender's card on the triage board — badge, top reasons, and a callout for the most severe finding. */
export function TenderCard({ tender, verdict, companyId }: { tender: TenderSummary | undefined; verdict: Verdict; companyId: string }) {
  const note = callout(verdict.criteria);
  const topReasons = verdict.criteria
    .filter((c) => c.status === "Blocker" || c.status === "Risk" || c.status === "OK")
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <h3 className="font-semibold text-[--color-text-primary]">{tender?.title ?? verdict.tender_id}</h3>
      </div>
      <p className="mt-1 text-sm text-[--color-text-secondary]">
        {tender?.buyer_name ?? "Unknown buyer"} · {tender?.place_city ?? "Unknown"} ·{" "}
        <span className="font-mono">{formatEur(tender?.estimated_value_eur)}</span>
        {tender?.submission_deadline ? ` · due ${tender.submission_deadline}` : ""}
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-[--color-text-primary]">
        {topReasons.map((c) => (
          <li key={c.criterion}>— {c.reason_en}</li>
        ))}
      </ul>
      {note && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            note.tone === "fail"
              ? "bg-[--color-skip-soft] text-[--color-skip]"
              : "bg-[--color-review-soft] text-[--color-review]"
          }`}
        >
          <span className="mr-1 rounded bg-black/5 px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase">{note.label}</span>
          {note.text}
        </div>
      )}
      <div className="mt-3 text-right">
        <Link
          href={`/tenders/${verdict.tender_id}?company=${companyId}`}
          className="inline-block rounded border border-[--color-charcoal] px-3 py-1.5 text-sm font-semibold text-[--color-charcoal] hover:bg-[--color-charcoal] hover:text-[--color-bg]"
        >
          Review decision
        </Link>
      </div>
    </div>
  );
}

