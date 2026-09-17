"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { CompanyProfile } from "@/lib/api";
import { CompanyForm } from "@/components/company-form";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [selected, setSelected] = useState<CompanyProfile | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function loadCompanies() {
    api
      .companies()
      .then(setCompanies)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load companies."));
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const profile = file ? await api.createCompanyFromFile(file) : await api.createCompanyFromText(text);
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

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <h1 className="text-2xl font-semibold">Companies</h1>

      <form onSubmit={handleCreate} className="space-y-3 rounded border border-zinc-200 p-4">
        <h2 className="text-lg font-semibold">Add a company</h2>
        <p className="text-sm text-zinc-600">Paste the company profile text, or upload a PDF/DOCX/TXT file.</p>
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

      {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{error}</p>}
      {notice && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-green-800">{notice}</p>}

      {selected && (
        <div className="rounded border border-zinc-200 p-4">
          <h2 className="text-lg font-semibold">Edit profile</h2>
          <CompanyForm profile={selected} onSave={handleSave} saving={busy} />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold">Existing companies</h2>
        {companies.length === 0 ? (
          <p className="mt-2 text-zinc-500">No companies yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 rounded border border-zinc-200">
            {companies.map((company) => (
              <li key={company.id} className="flex items-center justify-between px-3 py-2 text-base">
                <span>{company.name}</span>
                <button
                  type="button"
                  className="text-sm text-blue-700 underline"
                  onClick={() => setSelected(company)}
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
