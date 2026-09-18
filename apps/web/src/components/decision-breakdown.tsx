import type { CriterionResult, Evidence } from "@/lib/api";
import { ASPECT_STYLES } from "@/lib/status";

/**
 * Decision breakdown — one card per criterion of a Verdict (the decision engine's card mapped
 * through lib/match/verdict.ts), hard blockers visually distinct from soft concerns.
 */
export function DecisionBreakdown({
  criteria,
  onViewEvidence,
}: {
  criteria: CriterionResult[];
  onViewEvidence: (criterion: CriterionResult, evidence: Evidence) => void;
}) {
  if (criteria.length === 0) {
    return <p className="text-zinc-500">No criteria evaluated yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {criteria.map((criterion) => {
        const style = ASPECT_STYLES[criterion.status];
        const evidence = criterion.tender_evidence?.[0];
        return (
          <div key={criterion.criterion} className={`rounded-lg border border-l-4 border-zinc-200 bg-white p-4 ${style.border}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{criterion.criterion}</h3>
                <span className={`border rounded px-2 py-0.5 text-xs font-semibold ${style.className}`}>{style.label}</span>
                {criterion.status === "Blocker" && (
                  <span className="rounded border border-[--color-skip] bg-[--color-skip-soft] px-2 py-0.5 text-xs font-semibold text-[--color-skip]">Hard blocker</span>
                )}
              </div>
              {evidence ? (
                <button
                  type="button"
                  onClick={() => onViewEvidence(criterion, evidence)}
                  className="rounded border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-50"
                >
                  View evidence
                </button>
              ) : (
                <span className="text-xs text-zinc-400 italic">No source passage on file</span>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2 text-sm">
              <div>
                <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Tender value</p>
                <p className="mt-1 text-zinc-700">{criterion.tender_value != null ? String(criterion.tender_value) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Company fact</p>
                <p className="mt-1 text-zinc-700">{criterion.company_fact ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Reason</p>
                <p className="mt-1 text-zinc-700">{criterion.reason_en}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
