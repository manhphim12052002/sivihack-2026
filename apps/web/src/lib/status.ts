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
  Blocker: { label: "Blocker", className: "border-red-300 bg-red-100 text-red-800" },
  Risk: { label: "Risk", className: "border-amber-300 bg-amber-100 text-amber-800" },
  OK: { label: "OK", className: "border-green-300 bg-green-100 text-green-800" },
  Unknown: { label: "Unknown", className: "border-zinc-300 bg-zinc-100 text-zinc-600" },
};

/** Tender-level verdict: Bid green, Consider amber, No-go red. */
export const OVERALL_STYLES: Record<Overall, Tone> = {
  Bid: { label: "Bid", className: "bg-green-600 text-white" },
  Consider: { label: "Consider", className: "bg-amber-500 text-white" },
  NoGo: { label: "No-go", className: "bg-red-600 text-white" },
};

export const CONFIDENCE_STYLES: Record<Confidence, Tone> = {
  high: { label: "High confidence", className: "text-green-700" },
  medium: { label: "Medium confidence", className: "text-amber-700" },
  low: { label: "Low confidence", className: "text-red-700" },
  not_found: { label: "Not found in documents", className: "text-zinc-500" },
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
