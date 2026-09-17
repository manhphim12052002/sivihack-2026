/**
 * Single source of truth for status -> colour/label. Every badge in the app
 * imports from here so a colour never drifts between the triage table and
 * the briefing checklist.
 */
import type { components } from "./api-types";

export type Status = components["schemas"]["Status"];
export type Overall = components["schemas"]["Overall"];
export type Confidence = components["schemas"]["Confidence"];
export type JobStage = components["schemas"]["JobStage"];

type Tone = { label: string; className: string };

/** Criterion-level status: Blocker red, Risk amber, OK green, Unknown grey. */
export const STATUS_STYLES: Record<Status, Tone> = {
  Blocker: { label: "Blocker", className: "border-[--color-skip] bg-[--color-skip-soft] text-[--color-skip]" },
  Risk: { label: "Risk", className: "border-[--color-review] bg-[--color-review-soft] text-[--color-review]" },
  OK: { label: "OK", className: "border-[--color-pursue] bg-[--color-pursue-soft] text-[--color-pursue]" },
  Unknown: { label: "Unknown", className: "border-[--color-border] bg-[--color-bg] text-[--color-text-secondary]" },
};

/** Tender-level verdict: Bid green, Consider amber, No-go red. */
export const OVERALL_STYLES: Record<Overall, Tone> = {
  Bid: { label: "Pursue", className: "bg-[--color-pursue] text-white" },
  Consider: { label: "Review", className: "bg-[--color-review] text-white" },
  NoGo: { label: "Skip", className: "bg-[--color-skip] text-white" },
};

export const CONFIDENCE_STYLES: Record<Confidence, Tone> = {
  high: { label: "High confidence", className: "text-[--color-pursue]" },
  medium: { label: "Medium confidence", className: "text-[--color-review]" },
  low: { label: "Low confidence", className: "text-[--color-skip]" },
  not_found: { label: "Not found in documents", className: "text-[--color-text-secondary]" },
};

export const JOB_STAGES: JobStage[] = [
  "queued",
  "downloading",
  "extracting_text",
  "extracting_facts",
  "done",
  "error",
];

export const JOB_STAGE_LABELS: Record<JobStage, string> = {
  queued: "Queued",
  downloading: "Downloading",
  extracting_text: "Extracting text",
  extracting_facts: "Extracting facts",
  done: "Done",
  error: "Error",
};

export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Decision-breakdown aspect styling — same Status enum as STATUS_STYLES, but
 * the PASS/CONCERN/FAIL/UNCERTAIN vocabulary and left-border accent used by
 * the tender-review page's aspect cards.
 */
export const ASPECT_STYLES: Record<Status, Tone & { border: string }> = {
  OK: { label: "PASS", className: "border-[--color-pursue] bg-[--color-pursue-soft] text-[--color-pursue]", border: "border-l-[--color-pursue]" },
  Risk: { label: "CONCERN", className: "border-[--color-review] bg-[--color-review-soft] text-[--color-review]", border: "border-l-[--color-review]" },
  Blocker: { label: "FAIL", className: "border-[--color-skip] bg-[--color-skip-soft] text-[--color-skip]", border: "border-l-[--color-skip]" },
  Unknown: { label: "UNCERTAIN", className: "border-[--color-border] bg-[--color-bg] text-[--color-text-secondary]", border: "border-l-[--color-disabled]" },
};
