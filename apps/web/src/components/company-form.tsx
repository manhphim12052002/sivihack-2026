"use client";

import { useState, type FormEvent } from "react";
import type { CompanyProfile } from "@/lib/api";

type ListFieldKey = "regions" | "trades" | "cpv_prefixes" | "references_held" | "hard_exclusions";

const LIST_FIELD_LABELS: Record<ListFieldKey, string> = {
  regions: "Regions",
  trades: "Trades",
  cpv_prefixes: "CPV prefixes",
  references_held: "References held (Referenzen)",
  hard_exclusions: "Hard exclusions",
};

function toListText(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function fromListText(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Editable form for a normalized CompanyProfile; list fields edit as comma-separated text. */
export function CompanyForm({
  profile,
  onSave,
  saving,
}: {
  profile: CompanyProfile;
  onSave: (profile: CompanyProfile) => void | Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<CompanyProfile>(profile);
  const [lists, setLists] = useState<Record<ListFieldKey, string>>({
    regions: toListText(profile.regions),
    trades: toListText(profile.trades),
    cpv_prefixes: toListText(profile.cpv_prefixes),
    references_held: toListText(profile.references_held),
    hard_exclusions: toListText(profile.hard_exclusions),
  });

  function updateField<K extends keyof CompanyProfile>(field: K, value: CompanyProfile[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const merged: CompanyProfile = {
      ...draft,
      regions: fromListText(lists.regions),
      trades: fromListText(lists.trades),
      cpv_prefixes: fromListText(lists.cpv_prefixes),
      references_held: fromListText(lists.references_held),
      hard_exclusions: fromListText(lists.hard_exclusions),
    };
    void onSave(merged);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" value={draft.name} onChange={(value) => updateField("name", value)} />
        <TextField label="Home base" value={draft.home_base} onChange={(value) => updateField("home_base", value)} />
        <NumberField
          label="Radius (km)"
          value={draft.radius_km}
          onChange={(value) => updateField("radius_km", value)}
        />
        <NumberField
          label="Capacity per week"
          value={draft.capacity_per_week}
          onChange={(value) => updateField("capacity_per_week", value ?? 3)}
        />
        <NumberField
          label="Contract min (EUR)"
          value={draft.contract_min_eur}
          onChange={(value) => updateField("contract_min_eur", value)}
        />
        <NumberField
          label="Contract max (EUR)"
          value={draft.contract_max_eur}
          onChange={(value) => updateField("contract_max_eur", value)}
        />
        <NumberField
          label="Partner threshold (EUR)"
          value={draft.partner_threshold_eur}
          onChange={(value) => updateField("partner_threshold_eur", value)}
        />
        <NumberField
          label="Guarantee capacity (EUR)"
          value={draft.guarantee_capacity_eur}
          onChange={(value) => updateField("guarantee_capacity_eur", value)}
        />
        <NumberField
          label="Self-performance share (%)"
          value={draft.self_perform_share_pct}
          onChange={(value) => updateField("self_perform_share_pct", value)}
        />
        <TextField
          label="Earliest start"
          value={draft.earliest_start ?? ""}
          onChange={(value) => updateField("earliest_start", value || null)}
        />
      </div>

      {(Object.keys(LIST_FIELD_LABELS) as ListFieldKey[]).map((field) => (
        <div key={field}>
          <label className="text-sm font-medium">{LIST_FIELD_LABELS[field]}</label>
          <input
            className="mt-1 w-full rounded border border-zinc-300 p-2 text-base"
            value={lists[field]}
            onChange={(event) => setLists((current) => ({ ...current, [field]: event.target.value }))}
            placeholder="comma-separated"
          />
        </div>
      ))}

      <div>
        <label className="text-sm font-medium">Raw text (source)</label>
        <textarea
          className="mt-1 h-24 w-full rounded border border-zinc-300 p-2 text-sm text-zinc-600"
          value={draft.raw_text}
          onChange={(event) => updateField("raw_text", event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 w-full rounded border border-zinc-300 p-2 text-base font-normal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type="number"
        className="mt-1 w-full rounded border border-zinc-300 p-2 text-base font-normal"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}
