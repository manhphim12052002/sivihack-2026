"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type CompanyProfile } from "@/lib/api";
export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyProfile[]>([]),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState<string>();
  useEffect(() => {
    api
      .companies()
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);
  async function build(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setRecovery(undefined);
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        body = form;
      } else {
        body = JSON.stringify({ text });
        headers = { "Content-Type": "application/json" };
      }
      const res = await fetch("/api/companies", {
        method: "POST",
        headers,
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setRecovery(data.company_id);
        throw new Error(`${data.code ?? "BUILD_FAILED"}: ${data.error}`);
      }
      router.push(`/companies/${data.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not build company profile.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <div>
        <p className="text-sm font-medium text-emerald-700">
          COMPANY INTELLIGENCE
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Your companies</h1>
        <p className="mt-3 text-zinc-600">
          Upload the information you already have. Arctis will build your
          company profile automatically.
        </p>
      </div>
      <form
        onSubmit={build}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6"
      >
        <h2 className="text-xl font-semibold">Build a company profile</h2>
        <label className="block text-sm font-medium">
          Company information
          <textarea
            className="mt-2 h-40 w-full rounded-lg border border-zinc-300 p-3 font-normal"
            placeholder="Paste a company description, references, qualifications or availability…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFile(null);
            }}
            disabled={busy}
          />
        </label>
        <label className="block text-sm">
          Or upload a document
          <input
            className="ml-3"
            type="file"
            accept=".pdf,.txt,.docx,.xlsx,.csv"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        <p className="text-xs text-zinc-500">
          PDF with selectable text, TXT, DOCX, XLSX or CSV · up to 15 MB. You
          can review and correct every extracted claim.
        </p>
        <button
          disabled={busy || (!file && !text.trim())}
          className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-40"
        >
          {busy ? "Building company profile…" : "Build company profile"}
        </button>
      </form>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
          {recovery && (
            <p>
              <Link href={`/companies/${recovery}`} className="underline">
                Open retained profile to retry or enter information manually
              </Link>
            </p>
          )}
        </div>
      )}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Existing companies</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-emerald-600"
            >
              <h3 className="font-semibold">{c.name}</h3>
              <p className="mt-2 text-sm text-zinc-500">
                {c.home_base || "Headquarters not provided"}
              </p>
              <p className="mt-4 text-sm text-emerald-700">
                Open Company Intelligence →
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
