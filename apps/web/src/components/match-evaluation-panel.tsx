"use client";

import { useEffect, useState } from "react";
import type { Evidence } from "@/lib/api";
import type { MatchEvaluation, MatchResult, KnowledgeGapEntry, ViabilityStatus } from "@/lib/match/types";

// ─── Styles ───────────────────────────────────────────────────────────────────

const VIABILITY_LABEL: Record<ViabilityStatus, string> = {
  VIABLE: "Viable — on the desk",
  REVIEW: "Needs review",
  BLOCKED: "Blocked",
};

const VIABILITY_CLASS: Record<ViabilityStatus, string> = {
  VIABLE: "bg-emerald-100 text-emerald-800",
  REVIEW: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-800",
};

const STATUS_ICON: Record<string, string> = { PASS: "✓", FAIL: "✗", UNCERTAIN: "?" };
const STATUS_CLASS: Record<string, string> = {
  PASS: "text-emerald-700",
  FAIL: "text-red-700",
  UNCERTAIN: "text-amber-600",
};
const SEVERITY_CLASS: Record<string, string> = {
  HARD: "bg-red-50 text-red-700 border-red-200",
  SOFT: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

// ─── Evidence ─────────────────────────────────────────────────────────────────

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return <p className="text-xs italic text-zinc-500">No source passage on file.</p>;
  return (
    <ul className="space-y-1.5">
      {evidence.map((e, i) => (
        <li key={`${e.doc}-${e.page}-${i}`} className="text-sm">
          {e.quote_de && <p className="italic text-zinc-800">&bdquo;{e.quote_de}&ldquo;</p>}
          <p className="text-xs text-zinc-500">
            {e.doc}
            {e.page != null ? `, p. ${e.page}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ─── Override modal ───────────────────────────────────────────────────────────

function OverrideModal({
  result, evaluationId, onClose, onSaved,
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
    setSaving(true); setError(null);
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
      onSaved(await res.json() as MatchEvaluation);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <h3 className="font-semibold text-lg">Override: {result.label}</h3>
        <p className="text-sm text-zinc-500">System result: <span className={`font-medium ${STATUS_CLASS[result.status]}`}>{result.status}</span></p>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">Your assessment</label>
          <div className="flex gap-2">
            {(["PASS", "UNCERTAIN", "FAIL"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`flex-1 rounded border px-3 py-2 text-sm font-semibold transition ${status === s ? `ring-2 ring-offset-1 ${STATUS_CLASS[s]} border-current` : "border-zinc-200 text-zinc-600"}`}>
                {STATUS_ICON[s]} {s}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-zinc-700">Reason <span className="text-zinc-400">(required)</span></label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            placeholder="Why does the assessment need adjustment?" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save override"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Layer 1 row: hard gate ───────────────────────────────────────────────────

function GateRow({ result, evaluationId, onOverrideSaved }: {
  result: MatchResult;
  evaluationId: string;
  onOverrideSaved: (updated: MatchEvaluation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const isPartnerRequired = result.method === "PARTNER_REQUIRED";

  return (
    <>
      <tr className="border-t border-zinc-100 hover:bg-zinc-50 align-top">
        <td className="py-2 pl-3 pr-2">
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[result.severity]}`}>{result.severity}</span>
        </td>
        <td className="py-2 px-2 text-sm font-medium text-zinc-800">{result.label}</td>
        <td className="py-2 px-2 whitespace-nowrap">
          <span className={`font-semibold ${STATUS_CLASS[result.status]}`}>{STATUS_ICON[result.status]} {result.status}</span>
          {isPartnerRequired && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">⚠ Partner/JV</span>}
        </td>
        <td className="py-2 px-2 text-sm text-zinc-700">{result.reason}</td>
        <td className="py-2 px-2 text-sm text-zinc-600 hidden md:table-cell">{result.company_fact ?? "—"}</td>
        <td className="py-2 px-2 whitespace-nowrap">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded px-2 py-1 text-xs text-blue-700 underline">
            {expanded ? "hide" : "evidence"}
          </button>
          <button type="button" onClick={() => setOverriding(true)} className="rounded px-2 py-1 text-xs text-zinc-500 underline">override</button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50">
          <td colSpan={6} className="px-4 pb-3 pt-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tender says</p>
            <EvidenceList evidence={result.tender_evidence} />
            {result.company_evidence.length > 0 && (
              <p className="mt-2 text-xs text-zinc-500">Company rows checked: {result.company_evidence.join(", ")}</p>
            )}
          </td>
        </tr>
      )}
      {overriding && <OverrideModal result={result} evaluationId={evaluationId} onClose={() => setOverriding(false)} onSaved={onOverrideSaved} />}
    </>
  );
}

// ─── Layer 2 card: a finding from the documents ───────────────────────────────

function FindingCard({ result, evaluationId, onOverrideSaved }: {
  result: MatchResult;
  evaluationId: string;
  onOverrideSaved: (updated: MatchEvaluation) => void;
}) {
  const [overriding, setOverriding] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-zinc-900">{result.label}</h4>
          <span className={`font-semibold ${STATUS_CLASS[result.status]}`}>{STATUS_ICON[result.status]} {result.status}</span>
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[result.severity]}`}>{result.severity}</span>
          <span className="text-xs uppercase tracking-wide text-zinc-400">{result.method}</span>
        </div>
        <button type="button" onClick={() => setOverriding(true)} className="rounded px-2 py-1 text-xs text-zinc-500 underline">override</button>
      </div>
      <p className="mt-2 text-zinc-800">{result.reason}</p>
      {result.reasoning && <p className="mt-1 text-sm text-zinc-600">{result.reasoning}</p>}
      {result.conditions && result.conditions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {result.conditions.map((c, i) => (
            <li key={i} className={`rounded border px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]} border-current/30`}>
              {STATUS_ICON[c.status]} {c.condition}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tender says</p>
          <div className="mt-1"><EvidenceList evidence={result.tender_evidence} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Company says</p>
          <p className="mt-1 text-sm text-zinc-700">
            {result.company_fact ?? (result.company_evidence.length ? `Rows checked: ${result.company_evidence.join(", ")}` : "No company evidence relied on.")}
          </p>
          {result.question && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Ask the company: </span>{result.question}
            </p>
          )}
        </div>
      </div>
      {overriding && <OverrideModal result={result} evaluationId={evaluationId} onClose={() => setOverriding(false)} onSaved={onOverrideSaved} />}
    </div>
  );
}

// ─── Knowledge gap card ───────────────────────────────────────────────────────

function GapCard({ gap }: { gap: KnowledgeGapEntry }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <p className="font-medium text-amber-900">{gap.concept.replace(/_/g, " ").replace(/^UNMATCHED:/, "")}</p>
      <p className="mt-0.5 text-amber-700">{gap.triggered_by}</p>
      <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[gap.importance]}`}>{gap.importance}</span>
    </div>
  );
}

// ─── Single evaluation card ───────────────────────────────────────────────────

function EvaluationCard({ evaluation, onUpdate }: {
  evaluation: MatchEvaluation;
  onUpdate: (updated: MatchEvaluation) => void;
}) {
  const { matrix, viability, bid_scope } = evaluation;
  // Passing company exclusions are noise in the table; one line says how many were checked.
  const passedExclusions = matrix.results.filter((r) => r.layer !== "SEMANTIC" && r.method === "CONSTRAINT" && r.status === "PASS");
  const gate = matrix.results.filter((r) => r.layer !== "SEMANTIC" && !passedExclusions.includes(r));
  const findings = matrix.results.filter((r) => r.layer === "SEMANTIC");
  const partnerRequired = matrix.results.some((r) => r.method === "PARTNER_REQUIRED" && r.status === "UNCERTAIN");
  const readDocs = (evaluation.documents ?? []).filter((d) => d.status === "AVAILABLE");
  const otherDocs = (evaluation.documents ?? []).filter((d) => d.status !== "AVAILABLE");

  return (
    <div className="space-y-5">
      {bid_scope.type === "LOT" && (
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">LOT: {bid_scope.lot_title ?? bid_scope.lot_id}</p>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-wide ${VIABILITY_CLASS[viability.status]}`}>
          {VIABILITY_LABEL[viability.status]}
        </span>
        {viability.hard_blockers > 0 && <span className="text-sm font-medium text-red-700">✕ {viability.hard_blockers} hard blocker{viability.hard_blockers > 1 ? "s" : ""}</span>}
        {partnerRequired && <span className="text-sm font-medium text-amber-700">⚠ Partner/JV required</span>}
        {viability.hard_unknowns > 0 && <span className="text-sm text-amber-600">? {viability.hard_unknowns} uncertain</span>}
        {viability.soft_concerns > 0 && <span className="text-sm text-zinc-500">{viability.soft_concerns} soft concern{viability.soft_concerns > 1 ? "s" : ""}</span>}
      </div>

      {/* Hard blockers highlight */}
      {matrix.hard_blockers.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-red-800">✕ Hard blockers — bid not viable as-is</p>
          <ul className="space-y-1">
            {matrix.hard_blockers.map((r) => (
              <li key={r.id} className="text-sm text-red-700"><span className="font-medium">{r.label}:</span> {r.reason}</li>
            ))}
          </ul>
          {evaluation.skipped_semantic > 0 && (
            <p className="mt-2 text-xs text-red-700">
              {evaluation.skipped_semantic} document check{evaluation.skipped_semantic > 1 ? "s" : ""} not run: the lot is out on the hard gate, so no model was consulted.
            </p>
          )}
        </div>
      )}

      {/* Layer 1 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Layer 1 · Hard gate <span className="font-normal text-zinc-500">— deterministic, typed tender fact against typed company fact</span></h3>
        <div className="overflow-x-auto rounded border border-zinc-200">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pl-3 pr-2">Weight</th>
                <th className="py-2 px-2">Check</th>
                <th className="py-2 px-2">Result</th>
                <th className="py-2 px-2">Reason</th>
                <th className="py-2 px-2 hidden md:table-cell">Company says</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {gate.map((r) => <GateRow key={r.id} result={r} evaluationId={evaluation.id} onOverrideSaved={onUpdate} />)}
            </tbody>
          </table>
          {gate.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">No typed facts to check — fact sheet may be empty.</p>}
          {passedExclusions.length > 0 && (
            <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500">
              ✓ {passedExclusions.length} company exclusion{passedExclusions.length > 1 ? "s" : ""} checked against the trade scope, none triggered
              ({passedExclusions.map((r) => r.label.replace(/^Exclusion: /, "")).join(", ")}).
            </p>
          )}
        </div>
      </section>

      {/* Layer 2 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Layer 2 · Findings from the documents <span className="font-normal text-zinc-500">— model reads the relevant passages and the company evidence; every quote is verbatim and checked</span></h3>
        {findings.length > 0 ? (
          <div className="space-y-3">
            {findings.map((r) => <FindingCard key={r.id} result={r} evaluationId={evaluation.id} onOverrideSaved={onUpdate} />)}
          </div>
        ) : (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            {evaluation.skipped_semantic > 0 ? "Not run: the hard gate already blocked this lot." : "No document-level requirements to assess for this lot."}
          </p>
        )}
      </section>

      {/* Stated, not checked */}
      {evaluation.stated_not_checked.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Stated in the documents, not checked</h3>
          <ul className="divide-y divide-zinc-100 rounded border border-zinc-200">
            {evaluation.stated_not_checked.map((u, i) => (
              <li key={i} className="px-3 py-2 text-sm">
                <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600">{u.category}</span>
                <span className="italic text-zinc-800">&bdquo;{u.quote_de}&ldquo;</span>
                <span className="ml-2 text-xs text-zinc-500">{u.doc}{u.page != null ? `, p. ${u.page}` : u.section ? `, ${u.section}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Knowledge gaps */}
      {matrix.knowledge_gaps.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Open questions for the estimator</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {matrix.knowledge_gaps.map((gap) => <GapCard key={`${gap.task_id}-${gap.concept}`} gap={gap} />)}
          </div>
        </section>
      )}

      {/* Documents */}
      {(evaluation.documents ?? []).length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Documents behind this card</h3>
          <ul className="divide-y divide-zinc-100 rounded border border-zinc-200 text-sm">
            {readDocs.map((d) => (
              <li key={d.name} className="flex items-center justify-between px-3 py-1.5">
                <span className="truncate">{d.name}</span>
                <span className="ml-3 whitespace-nowrap text-xs text-emerald-700">{d.type} · {d.chunks} {d.type === "GAEB" ? "positions/blocks" : "pages"} read</span>
              </li>
            ))}
            {otherDocs.map((d) => (
              <li key={d.name} className="flex items-center justify-between px-3 py-1.5 text-zinc-500">
                <span className="truncate">{d.name}</span>
                <span className="ml-3 whitespace-nowrap text-xs">{d.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MatchEvaluationPanel({ tenderId, companyId }: { tenderId: string; companyId: string }) {
  const [evaluations, setEvaluations] = useState<MatchEvaluation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runEvaluation() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tender_id: tenderId, company_id: companyId, all_lots: true }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Evaluation failed");
      }
      const data = await res.json() as MatchEvaluation | MatchEvaluation[];
      setEvaluations(Array.isArray(data) ? data : [data]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  // The card is the briefing: run as soon as the pair is known, re-run on change. The setState
  // calls live inside the async callback, the same pattern the review client uses.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tender_id: tenderId, company_id: companyId, all_lots: true }),
        });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? "Evaluation failed");
        }
        const data = await res.json() as MatchEvaluation | MatchEvaluation[];
        if (!cancelled) setEvaluations(Array.isArray(data) ? data : [data]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tenderId, companyId]);

  function updateEvaluation(updated: MatchEvaluation) {
    setEvaluations((prev) => prev ? prev.map((e) => e.id === updated.id ? { ...e, ...updated, documents: e.documents, stated_not_checked: e.stated_not_checked } : e) : [updated]);
  }

  if (loading || (!evaluations && !error)) {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-zinc-500">
        Running the hard gate, then reading the documents…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
        {error}
        <button type="button" onClick={runEvaluation} className="ml-3 underline">retry</button>
      </div>
    );
  }

  if (!evaluations) return null;
  const isMultiLot = evaluations.length > 1;

  return (
    <div className="space-y-6">
      {isMultiLot && (
        <div className="flex flex-wrap gap-3 rounded border border-zinc-200 bg-zinc-50 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-700">Lot results:</span>
          {evaluations.map((ev) => (
            <span key={ev.id} className={`rounded-full px-3 py-0.5 text-xs font-semibold ${VIABILITY_CLASS[ev.viability.status]}`}>
              {ev.bid_scope.lot_title ?? ev.bid_scope.lot_id ?? "Tender"}: {VIABILITY_LABEL[ev.viability.status]}
            </span>
          ))}
        </div>
      )}

      {evaluations.map((ev, i) => (
        <div key={ev.id} className={isMultiLot ? "rounded border border-zinc-200 p-4" : ""}>
          {isMultiLot && <h3 className="mb-3 font-semibold text-zinc-800">{ev.bid_scope.lot_title ?? ev.bid_scope.lot_id ?? `Lot ${i + 1}`}</h3>}
          <EvaluationCard evaluation={ev} onUpdate={updateEvaluation} />
        </div>
      ))}

      <div className="flex justify-end">
        <button type="button" onClick={runEvaluation} disabled={loading} className="text-xs text-zinc-400 underline hover:text-zinc-600">Re-run</button>
      </div>
    </div>
  );
}
