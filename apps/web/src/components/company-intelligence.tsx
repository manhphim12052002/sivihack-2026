"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { CanonicalCompany } from "@/lib/company/types";
import { manualOperational, manualPolicy, rowMeta } from "@/lib/company/model";
import { MatchEvaluationPanel } from "./match-evaluation-panel";
import { api, type TenderSummary } from "@/lib/api";

type Row = Record<string, unknown>;
type Collection =
  | "capabilities"
  | "references"
  | "qualifications"
  | "resources"
  | "capacity"
  | "constraints"
  | "preferences";
const inputClass =
  "mt-1 w-full rounded border border-zinc-300 bg-white p-2 text-sm font-normal";
const euro = (v: unknown) =>
  typeof v === "number"
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v)
    : "Not provided";
const pretty = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "Not provided"
    : Array.isArray(v)
      ? v.join(" · ") || "Not provided"
      : String(v).replaceAll("_", " ").toLowerCase();
const fields: Record<Collection, string[]> = {
  capabilities: ["label"],
  references: [
    "name",
    "client",
    "project_types",
    "location",
    "contract_value_eur",
    "completed_at",
    "capabilities",
  ],
  qualifications: ["label", "knowledge_state", "valid_from", "valid_until"],
  resources: [
    "type",
    "label",
    "value",
    "unit",
    "available_from",
    "valid_as_of",
    "raw_value",
    "state",
  ],
  capacity: [
    "type",
    "label",
    "value",
    "unit",
    "available_from",
    "valid_as_of",
    "raw_value",
    "state",
  ],
  constraints: ["type", "operator", "value", "severity", "raw_value", "state"],
  preferences: ["type", "operator", "value", "severity", "raw_value", "state"],
};
const labels: Record<string, string> = {
  employees: "Employees",
  revenue_eur: "Annual revenue (EUR)",
  contract_min_eur: "Preferred project minimum (EUR)",
  contract_max_eur: "Preferred project maximum (EUR)",
  partner_threshold_eur: "Partner above (EUR)",
  guarantee_capacity_eur: "Total guarantee limit (EUR)",
  self_perform_share_pct: "Self-performance (%)",
  radius_km: "Operating radius (km)",
  contract_value_eur: "Project value (EUR)",
  completed_at: "Completion date",
  knowledge_state: "Knowledge state",
  valid_from: "Valid from",
  valid_until: "Valid until",
  available_from: "Available from",
  valid_as_of: "Valid as of",
  raw_value: "Original wording",
};
const numeric = new Set([
  "employees",
  "revenue_eur",
  "radius_km",
  "contract_min_eur",
  "contract_max_eur",
  "partner_threshold_eur",
  "guarantee_capacity_eur",
  "self_perform_share_pct",
  "contract_value_eur",
  "value",
]);
const arrayKeys = new Set([
  "regions",
  "countries",
  "project_types",
  "capabilities",
]);
function Field({
  name,
  value,
  onChange,
  policy = false,
}: {
  name: string;
  value: unknown;
  onChange: (v: unknown) => void;
  policy?: boolean;
}) {
  const options =
    name === "knowledge_state"
      ? ["KNOWN_PRESENT", "KNOWN_ABSENT"]
      : name === "state"
        ? ["EXPLICIT", "NORMALIZED", "AMBIGUOUS", "UNKNOWN"]
        : name === "severity"
          ? ["HARD", "SOFT"]
          : null;
  const number = numeric.has(name) && !(policy && name === "value");
  return (
    <label className="block text-sm font-medium">
      {labels[name] ?? pretty(name)}
      {options ? (
        <select
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          className={inputClass}
          type={
            number
              ? "number"
              : name.endsWith("_at") ||
                  [
                    "available_from",
                    "valid_as_of",
                    "valid_from",
                    "valid_until",
                  ].includes(name)
                ? "date"
                : "text"
          }
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          min={number ? 0 : undefined}
          step={number ? "any" : undefined}
          onChange={(e) =>
            onChange(
              arrayKeys.has(name)
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : number
                  ? e.target.value === ""
                    ? null
                    : Number(e.target.value)
                  : e.target.value || null,
            )
          }
        />
      )}
    </label>
  );
}
function Section({
  title,
  children,
  onEdit,
  editing,
}: {
  title: string;
  children: ReactNode;
  onEdit?: () => void;
  editing?: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {onEdit && (
          <button
            className="text-sm font-medium text-emerald-700 underline"
            onClick={onEdit}
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      `${data.code ?? "ERROR"}: ${data.error ?? "Request failed"}`,
    );
  return data;
}
export function CompanyIntelligence({ companyId }: { companyId: string }) {
  const [c, setC] = useState<CanonicalCompany>(),
    [editing, setEditing] = useState<Record<string, boolean>>({}),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [tenders, setTenders] = useState<TenderSummary[]>([]),
    [tender, setTender] = useState("");
  const url = `/api/companies/${companyId}`;
  useEffect(() => {
    request<CanonicalCompany>(`${url}?view=canonical`)
      .then(setC)
      .catch((e) => setError(e.message));
    api
      .tenders()
      .then(setTenders)
      .catch(() => {});
  }, [url]);
  const edit = (section: string) =>
    setEditing((s) => ({ ...s, [section]: !s[section] }));
  function change(fn: (draft: CanonicalCompany) => void) {
    setC((old) => {
      if (!old) return old;
      const next = structuredClone(old);
      fn(next);
      return next;
    });
    setDirty(true);
    setNotice("");
  }
  async function save() {
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      setC(
        await request<CanonicalCompany>(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
        }),
      );
      setDirty(false);
      setNotice("Profile saved. Matching uses the confirmed information.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function build() {
    setBusy(true);
    setError("");
    try {
      if (file || text.trim()) {
        let body: BodyInit, headers: HeadersInit | undefined;
        if (file) {
          const f = new FormData();
          f.append("file", file);
          body = f;
        } else {
          body = JSON.stringify({ text });
          headers = { "Content-Type": "application/json" };
        }
        await request(`${url}/sources`, { method: "POST", body, headers });
      }
      await request(`${url}/extract`, { method: "POST" });
      setC(await request<CanonicalCompany>(`${url}?view=canonical`));
      setText("");
      setFile(null);
      setNotice("Profile built. Please review the new claims.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function evidence(ids: unknown) {
    const chunks = (c?.chunks ?? []).filter(
      (ch) => Array.isArray(ids) && ids.includes(ch.id),
    );
    return chunks.length ? (
      <details className="mt-3 text-xs text-zinc-600">
        <summary className="cursor-pointer text-emerald-700">
          Source evidence ({chunks.length})
        </summary>
        {chunks.map((ch) => (
          <blockquote
            className="mt-2 border-l-2 border-emerald-200 pl-3"
            key={ch.id}
          >
            <p className="mb-1 font-medium">
              {c?.sources.find((s) => s.id === ch.source_id)?.filename}
              {ch.page ? ` · page ${ch.page}` : ""}
            </p>
            {ch.text}
          </blockquote>
        ))}
      </details>
    ) : null;
  }
  function collection(section: Collection, title: string) {
    if (!c) return null;
    const rows = (c[section] ?? []) as unknown as Row[];
    const add = () =>
      change((d) => {
        let row: unknown;
        if (section === "resources" || section === "capacity")
          row = manualOperational(companyId);
        else if (section === "constraints" || section === "preferences")
          row = {
            ...manualPolicy(companyId),
            severity: section === "preferences" ? "SOFT" : "HARD",
            operator: section === "preferences" ? "PREFER" : "EXCLUDE",
          };
        else if (section === "capabilities")
          row = {
            ...rowMeta(companyId, "CAP", [], "CONFIRMED"),
            label: "",
            type: "OTHER",
          };
        else if (section === "qualifications")
          row = {
            ...rowMeta(companyId, "QUAL", [], "CONFIRMED"),
            label: "",
            type: "OTHER",
            knowledge_state: "KNOWN_PRESENT",
            valid_from: null,
            valid_until: null,
            freshness: "STALE",
          };
        else
          row = {
            ...rowMeta(companyId, "REF", [], "CONFIRMED"),
            name: "",
            client: null,
            location: null,
            contract_value_eur: null,
            completed_at: null,
            project_types: [],
            capabilities: [],
          };
        (d as unknown as Record<string, unknown>)[section] = [
          ...((d[section] ?? []) as unknown[]),
          row,
        ];
        setEditing((s) => ({ ...s, [section]: true }));
      });
    return (
      <Section
        title={title}
        editing={editing[section]}
        onEdit={() => edit(section)}
      >
        {!rows.length && (
          <p className="text-sm text-zinc-500">No information provided.</p>
        )}
        <div className="divide-y divide-zinc-100">
          {rows.map((r, i) => (
            <div className="py-4 first:pt-0" key={String(r.id)}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {String(r.name ?? r.label ?? r.value ?? "New item")}
                  </p>
                  {section === "qualifications" && (
                    <p className="mt-1 text-sm">
                      {pretty(r.knowledge_state)} ·{" "}
                      {r.valid_until
                        ? `valid until ${r.valid_until}`
                        : "Validity not established"}
                    </p>
                  )}
                  {section === "references" && (
                    <p className="mt-1 text-sm text-zinc-600">
                      {euro(r.contract_value_eur)} · completed:{" "}
                      {String(r.completed_at ?? "unknown")}
                    </p>
                  )}
                  {["capacity", "resources"].includes(section) && (
                    <p className="mt-1 text-sm text-zinc-600">
                      {r.value !== null
                        ? `${r.value} ${pretty(r.unit)}`
                        : pretty(r.raw_value)}
                      {r.available_from ? ` · from ${r.available_from}` : ""}
                      {r.state === "AMBIGUOUS" ? " · ⚠ Ambiguous" : ""}
                    </p>
                  )}
                  {["constraints", "preferences"].includes(section) && (
                    <p className="mt-1 text-sm">
                      {pretty(r.type)} · {pretty(r.operator)} ·{" "}
                      {pretty(r.severity)}
                    </p>
                  )}
                </div>
                <label className="text-xs text-zinc-500">
                  Review
                  <select
                    aria-label={`Review ${r.name ?? r.label ?? r.value}`}
                    className="ml-2 rounded border p-1 text-sm text-zinc-700"
                    value={String(r.status)}
                    disabled={busy}
                    onChange={(e) =>
                      change((d) => {
                        (d[section] as unknown as Row[])[i].status =
                          e.target.value;
                      })
                    }
                  >
                    <option value="PENDING">Pending review</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </label>
              </div>
              {editing[section] && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {fields[section].map((key) => (
                    <Field
                      key={key}
                      name={key}
                      value={r[key]}
                      policy={
                        section === "constraints" || section === "preferences"
                      }
                      onChange={(v) =>
                        change((d) => {
                          (d[section] as unknown as Row[])[i][key] = v;
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {evidence(r.evidence)}
            </div>
          ))}
        </div>
        <button
          onClick={add}
          disabled={busy}
          className="mt-3 text-sm font-medium text-emerald-700"
        >
          + Add {title.toLowerCase().replace(/s$/, "")}
        </button>
      </Section>
    );
  }
  function scalar(
    section: "identity" | "geography" | "commercial_profile",
    title: string,
    keys: string[],
  ) {
    if (!c) return null;
    const row = c[section] as unknown as Row;
    return (
      <Section
        title={title}
        editing={editing[section]}
        onEdit={() => edit(section)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {keys.map((key) =>
            editing[section] ? (
              <Field
                key={key}
                name={key}
                value={row?.[key]}
                onChange={(v) =>
                  change((d) => {
                    (d[section] as unknown as Row)[key] = v;
                  })
                }
              />
            ) : (
              <div key={key}>
                <p className="text-xs text-zinc-500">
                  {labels[key] ?? pretty(key)}
                </p>
                <p className="mt-1 font-medium">
                  {key.endsWith("_eur") ? euro(row?.[key]) : pretty(row?.[key])}
                </p>
                {evidence(c.field_evidence?.[`${section}.${key}`]?.evidence)}
              </div>
            ),
          )}
        </div>
      </Section>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link href="/companies" className="text-sm text-emerald-700">
        ← Companies
      </Link>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </p>
      )}
      {!c ? (
        <p>Loading Company Intelligence…</p>
      ) : (
        <>
          <header>
            <p className="text-sm text-emerald-700">Company Intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold">{c.identity.name}</h1>
            <p className="mt-3 text-zinc-600">
              {c.identity.headquarters || "Headquarters unknown"} ·{" "}
              {c.identity.employees ?? "Unknown"} employees ·{" "}
              {euro(c.identity.revenue_eur)} revenue
            </p>
          </header>
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="rounded bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-40"
            >
              {busy ? "Working…" : "Save profile"}
            </button>
            <span className="text-sm text-zinc-500">
              {dirty
                ? "Unsaved review changes"
                : notice ||
                  "Review extracted information before confirming it."}
            </span>
          </div>
          {scalar("identity", "Overview", [
            "name",
            "headquarters",
            "employees",
            "revenue_eur",
            "website",
          ])}
          {collection("capabilities", "Capabilities")}
          {scalar("geography", "Operating Area", [
            "regions",
            "countries",
            "radius_km",
          ])}
          {scalar("commercial_profile", "Commercial Profile", [
            "contract_min_eur",
            "contract_max_eur",
            "partner_threshold_eur",
            "guarantee_capacity_eur",
            "self_perform_share_pct",
          ])}
          {collection("references", "References")}
          {collection("qualifications", "Qualifications")}
          <h2 className="text-xl font-semibold">Resources & Capacity</h2>
          {collection("resources", "Resources")}
          {collection("capacity", "Capacity")}
          <h2 className="text-xl font-semibold">Constraints & Preferences</h2>
          {collection("constraints", "Constraints")}
          {collection("preferences", "Preferences")}
          <Section title="Missing Information">
            {c.knowledge_gaps.length ? (
              <ul className="space-y-2 text-sm text-amber-800">
                {c.knowledge_gaps.map((g) => (
                  <li key={g.id}>• {g.reason}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">
                No general gaps detected. Tender-specific requirements may need
                additional information.
              </p>
            )}
          </Section>
          <Section title="Add information">
            <p className="mb-3 text-sm text-zinc-500">
              Add sources or retry a failed build. Save review changes first.
            </p>
            <textarea
              aria-label="Additional company information"
              className={`${inputClass} h-24`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste additional company information…"
            />
            <input
              aria-label="Additional company document"
              type="file"
              accept=".pdf,.txt,.docx,.xlsx,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              className="mt-3 block rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-40"
              disabled={busy || dirty}
              onClick={build}
            >
              {busy ? "Building…" : "Build company profile"}
            </button>
            <ul className="mt-4 space-y-1 text-xs text-zinc-500">
              {c.sources.map((s) => (
                <li key={s.id}>
                  {s.filename} · {s.status}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Tender matching">
            <p className="mb-3 text-sm text-zinc-500">
              Evaluate a tender against the saved, reviewed company profile.
            </p>
            <select
              aria-label="Tender to evaluate"
              className={inputClass}
              value={tender}
              onChange={(e) => setTender(e.target.value)}
            >
              <option value="">Choose a tender…</option>
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title ?? t.id}
                </option>
              ))}
            </select>
            {dirty ? (
              <p className="mt-3 text-sm text-amber-700">
                Save changes before evaluating.
              </p>
            ) : (
              tender && (
                <div className="mt-4">
                  <MatchEvaluationPanel
                    key={`${tender}-${c.revision}`}
                    tenderId={tender}
                    companyId={companyId}
                  />
                </div>
              )
            )}
          </Section>
        </>
      )}
    </div>
  );
}
