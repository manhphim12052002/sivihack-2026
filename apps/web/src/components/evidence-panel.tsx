"use client";

import type { TenderFactSheet } from "@/lib/api";
import { CONFIDENCE_STYLES } from "@/lib/status";

export type EvidencePanelData = {
  criterion: string;
  doc: string;
  page: number | null | undefined;
  quote_de: string;
  reason_en: string;
  factSheet?: TenderFactSheet | null;
};

// Fields shown in the panel, in display order — scoped to what the decision engine actually checks.
const FACT_FIELDS: { key: keyof TenderFactSheet; label: string }[] = [
  { key: "place_of_performance",   label: "Location" },
  { key: "estimated_value",        label: "Contract value" },
  { key: "construction_window",    label: "Construction window" },
  { key: "submission_deadline",    label: "Submission deadline" },
  { key: "contractor_role",        label: "Contractor role" },
  { key: "guarantees",             label: "Guarantees" },
  { key: "penalty",                label: "Penalty clause" },
  { key: "self_performance_min_pct", label: "Min. self-performance" },
  { key: "references_required",    label: "References" },
  { key: "consortium_allowed",     label: "Consortium allowed" },
];

function formatDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatEurValue(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `€${(n / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 0 })} K`;
  return `€${n.toLocaleString("de-DE")}`;
}

function formatFactValue(key: keyof TenderFactSheet, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";

  if (key === "estimated_value" && typeof v === "number") return formatEurValue(v);

  if (key === "submission_deadline" && typeof v === "string") return formatDate(v);

  if (key === "construction_window" && typeof v === "object" && v !== null) {
    const w = v as Record<string, string>;
    const start = w.start ? formatDate(w.start) : "?";
    const end = w.end ? formatDate(w.end) : "?";
    return `${start} – ${end}`;
  }

  if (key === "guarantees" && typeof v === "object" && v !== null) {
    const g = v as Record<string, number>;
    const parts: string[] = [];
    if (g.performance_pct != null) parts.push(`${g.performance_pct}% performance`);
    if (g.warranty_pct != null) parts.push(`${g.warranty_pct}% warranty`);
    return parts.length ? parts.join(" · ") : JSON.stringify(v);
  }

  if (key === "penalty" && typeof v === "object" && v !== null) {
    const p = v as Record<string, number>;
    const parts: string[] = [];
    if (p.pct_per_day != null) parts.push(`${p.pct_per_day}% per day`);
    if (p.cap_pct != null) parts.push(`capped at ${p.cap_pct}%`);
    return parts.length ? parts.join(", ") : JSON.stringify(v);
  }

  if (key === "self_performance_min_pct" && typeof v === "number") return `${v}%`;

  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** Slide-over evidence viewer: the source document, the verbatim German passage, and the AI's plain-English read of it. */
export function EvidencePanel({ data, onClose }: { data: EvidencePanelData | null; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity ${data ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        className={`fixed top-0 right-0 z-40 h-full w-full max-w-md transform overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-xl transition-transform ${
          data ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {data && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-[var(--color-pursue)] uppercase">Source evidence</span>
              <button type="button" onClick={onClose} aria-label="Close" className="text-xl text-zinc-400 hover:text-zinc-700">
                &times;
              </button>
            </div>
            <h2 className="mt-2 text-lg font-semibold">{data.criterion}</h2>

            <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed italic">&ldquo;{data.quote_de}&rdquo;</div>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <span>{data.doc}</span>
              {data.page != null && <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono">p. {data.page}</span>}
            </div>

            <div className="mt-4 rounded border border-[var(--color-pursue)] bg-[var(--color-pursue-soft)] p-4">
              <p className="text-xs font-semibold tracking-wide text-[var(--color-pursue)] uppercase">AI interpretation</p>
              <p className="mt-1 text-sm text-zinc-800">{data.reason_en}</p>
            </div>

            {data.factSheet && (
              <div className="mt-6">
                <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase mb-3">Key tender facts</p>
                <div className="divide-y divide-zinc-100 rounded border border-zinc-200 bg-white text-sm">
                  {FACT_FIELDS.map(({ key, label }) => {
                    const fact = data.factSheet![key];
                    const conf = fact?.confidence ?? "not_found";
                    const confStyle = CONFIDENCE_STYLES[conf];
                    const formatted = formatFactValue(key, fact?.value);
                    const missing = formatted === "—";
                    return (
                      <div key={key} className="flex items-baseline justify-between gap-3 px-3 py-2">
                        <span className="text-zinc-500 shrink-0">{label}</span>
                        <div className="flex items-baseline gap-2 min-w-0 text-right">
                          <span className={missing ? "text-zinc-400 italic" : "text-zinc-800"}>{formatted}</span>
                          {!missing && <span className={`shrink-0 text-xs ${confStyle.className}`}>{conf}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
