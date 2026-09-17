"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { CompanyProfile } from "@/lib/api";
import { CompanyForm } from "@/components/company-form";

// ─── Types for extracted items and knowledge gaps ─────────────────────────────

interface ExtractedItem {
  id: string;
  type: string;
  label: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  evidence: string[] | null;
}

interface KnowledgeGap {
  id: string;
  type: string;
  state: string;
  reason: string | null;
}

interface CanonicalData {
  capabilities: ExtractedItem[];
  references: Array<ExtractedItem & { name: string; location: string | null; contract_value_eur: number | null }>;
  qualifications: Array<ExtractedItem & { valid_until: string | null; freshness: string }>;
  knowledge_gaps: KnowledgeGap[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [selected, setSelected] = useState<CompanyProfile | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Document upload state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Extracted items / canonical data
  const [canonical, setCanonical] = useState<CanonicalData | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);

  function loadCompanies() {
    api
      .companies()
      .then(setCompanies)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Could not load companies."),
      );
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    setCanonical(null);
    try {
      const profile = file
        ? await api.createCompanyFromFile(file)
        : await api.createCompanyFromText(text);
      setSelected(profile);
      setText("");
      setFile(null);
      loadCompanies();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the company profile.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(profile: CompanyProfile) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.updateCompany(profile.id, profile);
      setSelected(saved);
      setNotice("Saved.");
      loadCompanies();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the company profile.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadDoc() {
    if (!selected || !docFile) return;
    setUploadBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", docFile);
      const result = await apiFetch<{ source_id: string; chunk_count: number; duplicate: boolean }>(
        `/api/companies/${selected.id}/sources`,
        { method: "POST", body: form },
      );
      setNotice(
        result.duplicate
          ? `Duplicate — already ingested (${result.chunk_count} chunks).`
          : `Uploaded and parsed into ${result.chunk_count} chunks.`,
      );
      setDocFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleExtract() {
    if (!selected) return;
    setExtractBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/companies/${selected.id}/extract`, { method: "POST" });
      const canonical = await apiFetch<CanonicalData>(`/api/companies/${selected.id}/assemble`, {
        method: "POST",
      });
      setCanonical(canonical);
      setNotice("Extraction complete. Review items below.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Extraction failed.");
    } finally {
      setExtractBusy(false);
    }
  }

  async function handleVerify(
    table: "company_capabilities" | "company_references" | "company_qualifications",
    itemId: string,
    newStatus: "CONFIRMED" | "REJECTED",
  ) {
    if (!selected) return;
    try {
      await apiFetch(`/api/companies/${selected.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, item_id: itemId, status: newStatus }),
      });
      // Refresh canonical data
      const updated = await apiFetch<CanonicalData>(`/api/companies/${selected.id}/assemble`, {
        method: "POST",
      });
      setCanonical(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update item status.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <h1 className="text-2xl font-semibold">Companies</h1>

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-3 rounded border border-zinc-200 p-4">
        <h2 className="text-lg font-semibold">Add a company</h2>
        <p className="text-sm text-zinc-600">
          Paste the company profile text, or upload a PDF/DOCX/TXT file.
        </p>
        <textarea
          className="h-32 w-full rounded border border-zinc-300 p-2 text-base"
          placeholder="Paste company description..."
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFile(null);
          }}
          disabled={busy}
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">or</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              if (picked) setText("");
            }}
            disabled={busy}
            className="text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || (!text.trim() && !file)}
          className="rounded bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          {busy ? "Working…" : "Normalize profile"}
        </button>
      </form>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{error}</p>
      )}
      {notice && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-800">
          {notice}
        </p>
      )}

      {/* Edit profile */}
      {selected && (
        <div className="rounded border border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Edit profile — {selected.name}</h2>
          <CompanyForm profile={selected} onSave={handleSave} saving={busy} />
        </div>
      )}

      {/* Document upload */}
      {selected && (
        <div className="rounded border border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Upload company document</h2>
          <p className="mt-1 text-sm text-zinc-600">
            PDF, DOCX, XLSX or TXT — reference lists, certificates, qualification documents.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="file"
              accept=".pdf,.docx,.xlsx,.txt"
              disabled={uploadBusy}
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <button
              type="button"
              disabled={uploadBusy || !docFile}
              onClick={handleUploadDoc}
              className="rounded bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
            >
              {uploadBusy ? "Uploading…" : "Upload"}
            </button>
          </div>

          <div className="mt-4">
            <button
              type="button"
              disabled={extractBusy}
              onClick={handleExtract}
              className="rounded bg-blue-700 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
            >
              {extractBusy ? "Extracting…" : "Extract intelligence from documents"}
            </button>
          </div>
        </div>
      )}

      {/* Extracted items — human verification */}
      {canonical && (
        <div className="space-y-6">
          <ExtractedSection
            title="Capabilities"
            items={canonical.capabilities}
            onVerify={(id, status) => handleVerify("company_capabilities", id, status)}
          />
          <ReferenceSection
            refs={canonical.references}
            onVerify={(id, status) => handleVerify("company_references", id, status)}
          />
          <QualificationSection
            quals={canonical.qualifications}
            onVerify={(id, status) => handleVerify("company_qualifications", id, status)}
          />
          {canonical.knowledge_gaps.length > 0 && (
            <KnowledgeGapSection gaps={canonical.knowledge_gaps} />
          )}
        </div>
      )}

      {/* Company list */}
      <div>
        <h2 className="text-lg font-semibold">Existing companies</h2>
        {companies.length === 0 ? (
          <p className="mt-2 text-zinc-500">No companies yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 rounded border border-zinc-200">
            {companies.map((company) => (
              <li
                key={company.id}
                className="flex items-center justify-between px-3 py-2 text-base"
              >
                <span>{company.name}</span>
                <button
                  type="button"
                  className="text-sm text-blue-700 underline"
                  onClick={() => {
                    setSelected(company);
                    setCanonical(null);
                  }}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "CONFIRMED"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "REJECTED"
        ? "bg-red-100 text-red-800 border-red-200"
        : "bg-zinc-100 text-zinc-600 border-zinc-200";
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>
  );
}

function FreshnessBadge({ freshness }: { freshness: string }) {
  const cls =
    freshness === "EXPIRED"
      ? "bg-red-100 text-red-800"
      : freshness === "EXPIRING"
        ? "bg-amber-100 text-amber-800"
        : "bg-green-100 text-green-800";
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{freshness}</span>;
}

function VerifyButtons({
  id,
  status,
  onVerify,
}: {
  id: string;
  status: string;
  onVerify: (id: string, s: "CONFIRMED" | "REJECTED") => void;
}) {
  if (status === "CONFIRMED" || status === "REJECTED") return null;
  return (
    <span className="flex gap-2">
      <button
        type="button"
        onClick={() => onVerify(id, "CONFIRMED")}
        className="text-sm text-green-700 underline"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => onVerify(id, "REJECTED")}
        className="text-sm text-red-700 underline"
      >
        Reject
      </button>
    </span>
  );
}

function ExtractedSection({
  title,
  items,
  onVerify,
}: {
  title: string;
  items: ExtractedItem[];
  onVerify: (id: string, status: "CONFIRMED" | "REJECTED") => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded border border-zinc-200 p-4">
      <h3 className="font-semibold">
        {title}{" "}
        <span className="font-normal text-zinc-400">({items.length})</span>
      </h3>
      <ul className="mt-2 divide-y divide-zinc-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2 text-base">
            <span>
              <span className="font-medium">{item.label}</span>
              <span className="ml-2 text-sm text-zinc-500">{item.type}</span>
            </span>
            <span className="flex items-center gap-3">
              <StatusBadge status={item.status} />
              <VerifyButtons id={item.id} status={item.status} onVerify={onVerify} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceSection({
  refs,
  onVerify,
}: {
  refs: Array<ExtractedItem & { name: string; location: string | null; contract_value_eur: number | null }>;
  onVerify: (id: string, status: "CONFIRMED" | "REJECTED") => void;
}) {
  if (refs.length === 0) return null;
  return (
    <div className="rounded border border-zinc-200 p-4">
      <h3 className="font-semibold">
        References (Referenzen){" "}
        <span className="font-normal text-zinc-400">({refs.length})</span>
      </h3>
      <ul className="mt-2 divide-y divide-zinc-100">
        {refs.map((ref) => (
          <li key={ref.id} className="py-2">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-medium">{ref.name}</span>
                {ref.location && (
                  <span className="ml-2 text-sm text-zinc-500">{ref.location}</span>
                )}
                {ref.contract_value_eur && (
                  <span className="ml-2 text-sm text-zinc-500">
                    {new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(ref.contract_value_eur)}
                  </span>
                )}
              </div>
              <span className="flex items-center gap-3">
                <StatusBadge status={ref.status} />
                <VerifyButtons id={ref.id} status={ref.status} onVerify={onVerify} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualificationSection({
  quals,
  onVerify,
}: {
  quals: Array<ExtractedItem & { valid_until: string | null; freshness: string }>;
  onVerify: (id: string, status: "CONFIRMED" | "REJECTED") => void;
}) {
  if (quals.length === 0) return null;
  return (
    <div className="rounded border border-zinc-200 p-4">
      <h3 className="font-semibold">
        Qualifications{" "}
        <span className="font-normal text-zinc-400">({quals.length})</span>
      </h3>
      <ul className="mt-2 divide-y divide-zinc-100">
        {quals.map((q) => (
          <li key={q.id} className="flex items-center justify-between py-2 text-base">
            <span>
              <span className="font-medium">{q.label}</span>
              {q.valid_until && (
                <span className="ml-2 text-sm text-zinc-500">until {q.valid_until}</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              <FreshnessBadge freshness={q.freshness} />
              <StatusBadge status={q.status} />
              <VerifyButtons id={q.id} status={q.status} onVerify={onVerify} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KnowledgeGapSection({ gaps }: { gaps: KnowledgeGap[] }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-800">
        Knowledge gaps{" "}
        <span className="font-normal text-amber-600">({gaps.length})</span>
      </h3>
      <ul className="mt-2 space-y-1">
        {gaps.map((gap) => (
          <li key={gap.id} className="text-base text-amber-900">
            <span className="font-medium">{gap.type}</span>
            {gap.reason && <span className="ml-2 text-amber-700">— {gap.reason}</span>}
            <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-800">
              {gap.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
