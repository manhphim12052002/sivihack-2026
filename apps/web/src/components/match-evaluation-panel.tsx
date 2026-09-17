"use client";

import { useState } from "react";
import type { MatchEvaluation, MatchResult, KnowledgeGapEntry, ViabilityStatus } from "@/lib/match/types";

// ─── Viability badge ──────────────────────────────────────────────────────────

const VIABILITY_LABEL: Record<ViabilityStatus, string> = {
  VIABLE: "Viable",
  REVIEW: "Needs Review",
  BLOCKED: "Blocked",
};

const VIABILITY_CLASS: Record<ViabilityStatus, string> = {
  VIABLE: "bg-emerald-100 text-emerald-800",
  REVIEW: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-800",
};

const STATUS_ICON: Record<string, string> = {
  PASS: "✓",
  FAIL: "✗",
  UNCERTAIN: "?",
};

const STATUS_CLASS: Record<string, string> = {
  PASS: "text-emerald-700",
  FAIL: "text-red-700",
  UNCERTAIN: "text-amber-600",
};

const SEVERITY_CLASS: Record<string, string> = {
  HARD: "bg-red-50 text-red-700 border-red-200",
  SOFT: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

// ─── Override modal ───────────────────────────────────────────────────────────

function OverrideModal({
  result,
  evaluationId,
  onClose,
  onSaved,
}: {
  result: MatchResult;
  evaluationId: string;
  onClose: () => void;
  onSaved: (updated: MatchEvaluation) => void;
}) {
  const [status, setStatus] = useState<"PASS" | "FAIL" | "UNCERTAIN">(result.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!reason.trim()) { setError("Reason is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/match/${evaluationId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: result.id, status, reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Override failed");
      }
      const updated = await res.json() as MatchEvaluation;
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <h3 className="font-semibold text-lg">Override: {result.label}</h3>
        <p className="text-sm text-zinc-500">AI decision: <span className={`font-medium ${STATUS_CLASS[result.status]}`}>{result.status}</span></p>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">Your assessment</label>
          <div className="flex gap-2">
            {(["PASS", "UNCERTAIN", "FAIL"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${
                  status === s ? `ring-2 ring-offset-1 ${STATUS_CLASS[s]} border-current` : "border-zinc-200 text-zinc-600"
                }`}
              >
                {STATUS_ICON[s]} {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">Reason <span className="text-zinc-400">(required)</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Why does the AI assessment need adjustment?"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save override"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  result,
  evaluationId,
  onOverrideSaved,
}: {
  result: MatchResult;
  evaluationId: string;
  onOverrideSaved: (updated: MatchEvaluation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);

  return (
    <>
      <tr className="border-t border-zinc-100 hover:bg-zinc-50">
        <td className="py-2 pl-3 pr-2">
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[result.severity]}`}>
            {result.severity}
          </span>
        </td>
        <td className="py-2 px-2 text-sm font-medium text-zinc-800">{result.label}</td>
        <td className="py-2 px-2">
          <span className={`font-semibold ${STATUS_CLASS[result.status]}`}>
            {STATUS_ICON[result.status]} {result.status}
          </span>
        </td>
        <td className="py-2 px-2 text-sm text-zinc-500 hidden sm:table-cell">{result.method}</td>
        <td className="py-2 px-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded px-2 py-1 text-xs text-blue-700 underline"
            >
              {expanded ? "hide" : "details"}
            </button>
            <button
              type="button"
              onClick={() => setOverriding(true)}
              className="rounded px-2 py-1 text-xs text-zinc-500 underline"
            >
              override
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50">
          <td colSpan={5} className="px-4 pb-3 pt-1 text-sm">
            <p className="text-zinc-700">{result.reason}</p>
            {result.tender_evidence.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tender evidence </span>
                <span className="text-xs text-zinc-600">{result.tender_evidence.join(", ")}</span>
              </div>
            )}
            {result.company_evidence.length > 0 && (
              <div className="mt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Company evidence </span>
                <span className="text-xs text-zinc-600">{result.company_evidence.join(", ")}</span>
              </div>
            )}
          </td>
        </tr>
      )}
      {overriding && (
        <OverrideModal
          result={result}
          evaluationId={evaluationId}
          onClose={() => setOverriding(false)}
          onSaved={onOverrideSaved}
        />
      )}
    </>
  );
}

// ─── Knowledge gap card ───────────────────────────────────────────────────────

function GapCard({ gap }: { gap: KnowledgeGapEntry }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <p className="font-medium text-amber-900">{gap.concept}</p>
      <p className="mt-0.5 text-amber-700">{gap.triggered_by}</p>
      <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[gap.importance]}`}>
        {gap.importance}
      </span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MatchEvaluationPanel({
  tenderId,
  companyId,
}: {
  tenderId: string;
  companyId: string;
}) {
  const [evaluation, setEvaluation] = useState<MatchEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runEvaluation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tender_id: tenderId, company_id: companyId }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Evaluation failed");
      }
      setEvaluation(await res.json() as MatchEvaluation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!evaluation && !loading) {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-5 text-center">
        <p className="text-sm text-zinc-600 mb-3">
          Run the eligibility matching engine to check this tender against your company profile.
        </p>
        <button
          type="button"
          onClick={runEvaluation}
          className="rounded bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
        >
          Run eligibility check
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-zinc-500">
        Running eligibility checks…
      </div>
    );
  }

  if (!evaluation) return null;

  const { matrix, viability } = evaluation;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-wide ${VIABILITY_CLASS[viability.status]}`}>
          {VIABILITY_LABEL[viability.status]}
        </span>
        {viability.hard_blockers > 0 && (
          <span className="text-sm text-red-700 font-medium">{viability.hard_blockers} hard blocker{viability.hard_blockers > 1 ? "s" : ""}</span>
        )}
        {viability.hard_unknowns > 0 && (
          <span className="text-sm text-amber-700 font-medium">{viability.hard_unknowns} uncertain check{viability.hard_unknowns > 1 ? "s" : ""}</span>
        )}
        {viability.soft_concerns > 0 && (
          <span className="text-sm text-zinc-500">{viability.soft_concerns} soft concern{viability.soft_concerns > 1 ? "s" : ""}</span>
        )}
        <button
          type="button"
          onClick={runEvaluation}
          disabled={loading}
          className="ml-auto text-xs text-zinc-400 underline hover:text-zinc-600"
        >
          Re-run
        </button>
      </div>

      {/* Hard blockers highlight */}
      {matrix.hard_blockers.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800 mb-2">Hard blockers — bid not viable as-is</p>
          <ul className="space-y-1">
            {matrix.hard_blockers.map((r) => (
              <li key={r.id} className="text-sm text-red-700">
                <span className="font-medium">{r.label}:</span> {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full results table */}
      <div>
        <p className="text-sm font-semibold text-zinc-700 mb-2">Requirement-by-requirement results</p>
        <div className="overflow-x-auto rounded border border-zinc-200">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pl-3 pr-2">Weight</th>
                <th className="py-2 px-2">Requirement</th>
                <th className="py-2 px-2">Result</th>
                <th className="py-2 px-2 hidden sm:table-cell">Method</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {matrix.results.map((r) => (
                <ResultRow key={r.id} result={r} evaluationId={evaluation.id} onOverrideSaved={setEvaluation} />
              ))}
            </tbody>
          </table>
          {matrix.results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">No requirements evaluated — fact sheet may be empty.</p>
          )}
        </div>
      </div>

      {/* Knowledge gaps */}
      {matrix.knowledge_gaps.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-zinc-700 mb-2">
            Knowledge gaps — information missing from company profile
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {matrix.knowledge_gaps.map((gap) => (
              <GapCard key={`${gap.task_id}-${gap.concept}`} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {/* Soft concerns */}
      {matrix.soft_concerns.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-zinc-700 mb-2">Soft concerns</p>
          <ul className="space-y-1">
            {matrix.soft_concerns.map((r) => (
              <li key={r.id} className="text-sm text-zinc-600">
                <span className="font-medium">{r.label}:</span> {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
