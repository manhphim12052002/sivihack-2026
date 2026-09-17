import type { Fact, TenderFactSheet } from "@/lib/api";
import { CONFIDENCE_STYLES } from "@/lib/status";

// German terms shown in parentheses on first use, per the design's non-goal
// of pretending the documents are English.
const FIELD_LABELS: Record<keyof TenderFactSheet, string> = {
  trade_scope: "Trade scope",
  place_of_performance: "Place of performance",
  estimated_value: "Estimated value",
  lots: "Lots",
  references_required: "References required (Referenzen)",
  eligibility_proofs: "Eligibility proofs",
  construction_window: "Construction window (Bauzeit)",
  guarantees: "Guarantees (Bürgschaft)",
  penalty: "Penalty (Vertragsstrafe)",
  self_performance_min_pct: "Minimum self-performance (Eigenleistung)",
  side_offers_allowed: "Side offers allowed",
  consortium_allowed: "Consortium allowed (Bietergemeinschaft)",
  submission_deadline: "Submission deadline (Angebotsfrist)",
  special_qualifications: "Special qualifications",
  contractor_role: "Contractor role",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as (keyof TenderFactSheet)[];

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "Unknown";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // Structured facts (lots, guarantees, construction_window, ...) are shown
  // as raw JSON for now — honest and readable, no per-shape formatter yet.
  return JSON.stringify(value);
}

function FactRow({ label, fact }: { label: string; fact: Fact | undefined }) {
  const confidence = fact?.confidence ?? "not_found";
  const style = CONFIDENCE_STYLES[confidence];
  return (
    <tr className="border-t border-zinc-100 align-top">
      <td className="px-3 py-2 font-medium">{label}</td>
      <td className="px-3 py-2">{formatValue(fact?.value)}</td>
      <td className={`px-3 py-2 text-sm ${style.className}`}>{style.label}</td>
      <td className="px-3 py-2">
        {fact?.evidence && fact.evidence.length > 0 ? (
          <ul className="space-y-1">
            {fact.evidence.map((item, index) => (
              <li key={index} className="text-sm">
                <span className="italic">&ldquo;{item.quote_de}&rdquo;</span>{" "}
                <span className="text-zinc-500">
                  — {item.doc}
                  {item.page != null ? `, p. ${item.page}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sm italic text-zinc-500">Not found in documents</span>
        )}
      </td>
    </tr>
  );
}

/** The 15-field fact sheet, each row showing its own confidence and evidence. */
export function FactSheet({ factSheet }: { factSheet: TenderFactSheet | null | undefined }) {
  if (!factSheet) {
    return <p className="text-zinc-500">Fact sheet not extracted yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-zinc-200">
      <table className="w-full min-w-[900px] text-left text-base">
        <thead className="bg-zinc-50 text-sm text-zinc-500">
          <tr>
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_ORDER.map((field) => (
            <FactRow key={field} label={FIELD_LABELS[field]} fact={factSheet[field]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
