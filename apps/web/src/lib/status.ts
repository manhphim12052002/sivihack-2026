export type Overall = "Bid" | "Consider" | "NoGo";
export type Status = "Blocker" | "Risk" | "OK" | "Unknown";
export type Confidence = "high" | "medium" | "low" | "not_found";

interface Style {
  className: string;
  label: string;
}

export const OVERALL_STYLES: Record<Overall, Style> = {
  Bid: { className: "bg-green-100 text-green-800 border-green-200", label: "Bid" },
  Consider: { className: "bg-amber-100 text-amber-800 border-amber-200", label: "Consider" },
  NoGo: { className: "bg-red-100 text-red-800 border-red-200", label: "No-go" },
};

export const STATUS_STYLES: Record<Status, Style> = {
  Blocker: { className: "bg-red-100 text-red-800 border-red-200", label: "Blocker" },
  Risk: { className: "bg-amber-100 text-amber-800 border-amber-200", label: "Risk" },
  OK: { className: "bg-green-100 text-green-800 border-green-200", label: "OK" },
  Unknown: { className: "bg-zinc-100 text-zinc-600 border-zinc-200", label: "Unknown" },
};

export const CONFIDENCE_STYLES: Record<Confidence, Style> = {
  high: { className: "text-green-700", label: "High" },
  medium: { className: "text-amber-700", label: "Medium" },
  low: { className: "text-zinc-500", label: "Low" },
  not_found: { className: "text-zinc-400 italic", label: "Not found" },
};

import type { JobStage } from "@/lib/api";

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
