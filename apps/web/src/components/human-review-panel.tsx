"use client";

import { useState } from "react";
import type { Verdict } from "@/lib/api";

export type OverrideState = {
  overall: Verdict["overall"];
  correctedCompanyFact: string;
  correctedRequirement: string;
  reason: string;
};

/**
 * Inline human-review / override panel. Client-side state only — there's no backend concept of
 * a stored override yet (Verdict is always freshly computed by /api/screen), so a save here
 * updates this page's view for the rest of the session and is clearly labelled as such rather
 * than pretending to persist.
 */
export function HumanReviewPanel({
  currentOverall,
  onSave,
  onClose,
}: {
  currentOverall: Verdict["overall"];
  onSave: (override: OverrideState) => void;
  onClose: () => void;
}) {
  const [overall, setOverall] = useState<Verdict["overall"]>(currentOverall);
  const [correctedCompanyFact, setCorrectedCompanyFact] = useState("");
  const [correctedRequirement, setCorrectedRequirement] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-xl border-2 border-[var(--color-pursue)] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Human review</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-lg text-zinc-400 hover:text-zinc-700">
          &times;
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Decision
          <select
            value={overall}
            onChange={(e) => setOverall(e.target.value as Verdict["overall"])}
            className="mt-1 block w-full rounded border border-zinc-300 p-2 text-base font-normal text-zinc-900 normal-case"
          >
            <option value="Bid">Pursue</option>
            <option value="Consider">Review</option>
            <option value="NoGo">Skip</option>
          </select>
        </label>
        <label className="block text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Correct company fact
          <input
            value={correctedCompanyFact}
            onChange={(e) => setCorrectedCompanyFact(e.target.value)}
            placeholder="e.g. 200 km above €2M"
            className="mt-1 block w-full rounded border border-zinc-300 p-2 text-base font-normal text-zinc-900 normal-case"
          />
        </label>
        <label className="block text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Correct interpreted requirement
          <input
            value={correctedRequirement}
            onChange={(e) => setCorrectedRequirement(e.target.value)}
            placeholder="Enter corrected requirement"
            className="mt-1 block w-full rounded border border-zinc-300 p-2 text-base font-normal text-zinc-900 normal-case"
          />
        </label>
        <label className="block text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you changing this decision?"
            className="mt-1 block w-full rounded border border-zinc-300 p-2 text-base font-normal text-zinc-900 normal-case"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-400">Not saved to the backend yet — this override applies to this browser session only.</p>
        <button
          type="button"
          onClick={() => onSave({ overall, correctedCompanyFact, correctedRequirement, reason })}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save override
        </button>
      </div>
    </div>
  );
}
