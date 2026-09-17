import type { CriterionResult, Evidence } from "@/lib/api";
import { STATUS_STYLES } from "@/lib/status";

function EvidenceCell({ evidence }: { evidence: Evidence[] | undefined }) {
  // Absent evidence must read as "not found in documents", never as a blank
  // cell — a reason without a quote is not a reason an estimator can check.
  if (!evidence || evidence.length === 0) {
    return <span className="italic text-zinc-500">Not found in documents</span>;
  }
  return (
    <ul className="space-y-2">
      {evidence.map((item, index) => (
        <li key={index}>
          <p className="italic">&ldquo;{item.quote_de}&rdquo;</p>
          <p className="text-sm text-zinc-500">
            {item.doc}
            {item.page != null ? `, p. ${item.page}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Checklist table: one row per rule-engine criterion for a company x tender pair. */
export function CriterionTable({ criteria }: { criteria: CriterionResult[] }) {
  if (criteria.length === 0) {
    return <p className="text-zinc-500">No criteria evaluated yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-zinc-200">
      <table className="w-full min-w-[1000px] text-left text-base">
        <thead className="bg-zinc-50 text-sm text-zinc-500">
          <tr>
            <th className="px-3 py-2">Criterion</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Tender evidence</th>
            <th className="px-3 py-2">Company fact</th>
            <th className="px-3 py-2">Kind</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion, index) => {
            const style = STATUS_STYLES[criterion.status];
            return (
              <tr key={`${criterion.criterion}-${index}`} className="border-t border-zinc-100 align-top">
                <td className="px-3 py-2 font-medium">{criterion.criterion}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded border px-2 py-1 text-sm font-semibold ${style.className}`}>
                    {style.label}
                  </span>
                </td>
                <td className="px-3 py-2">{criterion.reason_en}</td>
                <td className="px-3 py-2">
                  <EvidenceCell evidence={criterion.tender_evidence} />
                </td>
                <td className="px-3 py-2">{criterion.company_fact ?? "Unknown"}</td>
                <td className="px-3 py-2 text-sm uppercase tracking-wide text-zinc-500">{criterion.kind}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
