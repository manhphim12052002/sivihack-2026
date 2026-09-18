import { genId } from "@/lib/id";
import {
  normalizeCapabilityType,
  normalizeQualificationType,
} from "./normalize";
import type {
  CanonicalCompany,
  ChunkRow,
  EvidenceClaim,
  ItemStatus,
  OperationalItem,
  PolicyItem,
} from "./types";
import type { CompanyProfile } from "@/lib/api";

export function emptyCompany(id: string, name: string): CanonicalCompany {
  return {
    company_id: id,
    identity: {
      name,
      headquarters: "",
      employees: null,
      revenue_eur: null,
      website: null,
    },
    capabilities: [],
    references: [],
    qualifications: [],
    commercial_profile: {
      contract_min_eur: null,
      contract_max_eur: null,
      partner_threshold_eur: null,
      guarantee_capacity_eur: null,
      self_perform_share_pct: null,
    },
    geography: {
      headquarters: "",
      regions: [],
      radius_km: null,
      countries: [],
    },
    regions: [],
    radius_km: null,
    resources: [],
    capacity: [],
    constraints: [],
    preferences: [],
    sources: [],
    chunks: [],
    knowledge_gaps: [],
    cpv_prefixes: [],
    field_evidence: {},
    raw_text: "",
    revision: 0,
  };
}

/** One-way compatibility view. No independent flat intelligence is persisted. */
export function toCompanyProfile(c: CanonicalCompany): CompanyProfile {
  const active = (r: { status: string }) => r.status === "CONFIRMED";
  const estimator = c.capacity?.find(
    (r) =>
      r.type === "ESTIMATOR_CAPACITY" &&
      r.unit === "BIDS_PER_WEEK" &&
      active(r) &&
      r.state !== "AMBIGUOUS",
  );
  const start = c.capacity?.find(
    (r) =>
      r.type === "CREW_AVAILABILITY" && active(r) && r.state !== "AMBIGUOUS",
  );
  return {
    id: c.company_id,
    name: c.identity.name,
    home_base: c.identity.headquarters,
    regions: c.geography?.regions ?? c.regions,
    radius_km: c.geography?.radius_km ?? c.radius_km,
    trades: c.capabilities.filter(active).map((r) => r.label),
    cpv_prefixes: c.cpv_prefixes ?? [],
    ...c.commercial_profile,
    earliest_start: start?.available_from ?? null,
    capacity_per_week: estimator?.value ?? null,
    references_held: c.references.filter(active).map((r) => r.name),
    hard_exclusions: (c.constraints ?? [])
      .filter((r) => active(r) && r.severity === "HARD")
      .map((r) => (r.operator === "OUTSIDE" ? `outside ${r.value}` : r.value)),
    raw_text: c.raw_text ?? "",
  };
}

export function gapsFor(c: CanonicalCompany) {
  const gaps: CanonicalCompany["knowledge_gaps"] = [];
  const add = (type: string, reason: string) =>
    gaps.push({
      id: `${c.company_id}-GAP-${type}`,
      company_id: c.company_id,
      type,
      reason,
      state: "UNKNOWN",
      created_at: new Date().toISOString(),
    });
  if (!c.capabilities.some((r) => r.status === "CONFIRMED"))
    add("CAPABILITIES", "Capabilities need customer review or information.");
  if (!c.identity.headquarters)
    add("HEADQUARTERS", "Company headquarters not established.");
  for (const r of c.references.filter((r) => r.status !== "REJECTED")) {
    if (!r.completed_at)
      add(`REFERENCE_DATE_${r.id}`, `Completion date missing for ${r.name}.`);
    if (r.contract_value_eur === null)
      add(`REFERENCE_VALUE_${r.id}`, `Contract value missing for ${r.name}.`);
  }
  for (const r of c.capacity ?? [])
    if (r.state === "AMBIGUOUS")
      add(
        `CAPACITY_${r.id}`,
        `${r.label}: ${r.raw_value ?? "availability"} is ambiguous; supply explicit dates/context.`,
      );
  return gaps;
}

export const rowMeta = (
  companyId: string,
  prefix: string,
  evidence: string[] = [],
  status: ItemStatus = "PENDING",
) => ({
  id: genId(prefix),
  company_id: companyId,
  origin: "DOCUMENT_EXTRACTED",
  status,
  evidence,
  created_at: new Date().toISOString(),
});
const keyText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
export const referenceKey = (name: string) =>
  keyText(
    name
      .replace(/(?:€|EUR)\s*[\d.,]+\s*(?:M|million|Mio|k)?/gi, "")
      .replace(/^(?:a|an|the|several)\s+/i, ""),
  );
export function mergeRows<
  T extends { id: string; evidence: string[] | null; status: string },
>(old: T[], incoming: T[], key: (r: T) => string): T[] {
  const out = [...old];
  for (const row of incoming) {
    const found = out.find((r) => key(r) === key(row));
    if (!found) out.push(row);
    else {
      // Preserve reviewed values and stable ids. New evidence never overwrites a correction.
      const evidence = [
        ...new Set([...(found.evidence ?? []), ...(row.evidence ?? [])]),
      ];
      if (found.status === "PENDING") {
        for (const [k, v] of Object.entries(row))
          if ((found as Record<string, unknown>)[k] == null && v != null)
            (found as Record<string, unknown>)[k] = v;
      }
      found.evidence = evidence;
    }
  }
  return out;
}
export function mergeCompany(
  old: CanonicalCompany,
  next: CanonicalCompany,
): CanonicalCompany {
  const result = structuredClone(old);
  for (const [field, claim] of Object.entries(next.field_evidence ?? {})) {
    if (old.field_evidence?.[field]?.origin === "CUSTOMER_PROVIDED") continue;
    const [section, property] = field.split(".");
    const target = result[
      section as keyof CanonicalCompany
    ] as unknown as Record<string, unknown>;
    const source = next[section as keyof CanonicalCompany] as unknown as Record<
      string,
      unknown
    >;
    if (target && source && source[property] !== null)
      target[property] = source[property];
    result.field_evidence = { ...result.field_evidence, [field]: claim };
  }
  result.capabilities = mergeRows(old.capabilities, next.capabilities, (r) =>
    r.type === "OTHER" ? keyText(r.label) : r.type,
  );
  result.references = mergeRows(
    old.references,
    next.references,
    (r) => referenceKey(r.name) + keyText(r.client ?? ""),
  );
  result.qualifications = mergeRows(
    old.qualifications,
    next.qualifications,
    (r) =>
      `${r.type === "OTHER" ? keyText(r.label) : r.type}:${r.knowledge_state}`,
  );
  for (const section of ["resources", "capacity"] as const)
    result[section] = mergeRows(
      old[section] ?? [],
      next[section] ?? [],
      (r) => `${r.type}:${keyText(r.label)}:${r.available_from ?? r.raw_value}`,
    );
  for (const section of ["constraints", "preferences"] as const)
    result[section] = mergeRows(
      old[section] ?? [],
      next[section] ?? [],
      (r) => `${r.type}:${r.operator}:${keyText(r.value)}`,
    );
  result.regions = result.geography?.regions ?? [];
  result.radius_km = result.geography?.radius_km ?? null;
  result.knowledge_gaps = gapsFor(result);
  return result;
}

/** Transitional import only: keeps old data, never trusts the old inferred availability/default bid capacity. */
export function importLegacy(p: CompanyProfile): CanonicalCompany {
  const c = emptyCompany(p.id, p.name);
  c.identity.headquarters = p.home_base;
  c.geography = {
    headquarters: p.home_base,
    regions: p.regions ?? [],
    radius_km: p.radius_km ?? null,
    countries: [],
  };
  c.regions = p.regions ?? [];
  c.radius_km = p.radius_km ?? null;
  c.cpv_prefixes = p.cpv_prefixes ?? [];
  c.raw_text = p.raw_text;
  c.commercial_profile = {
    contract_min_eur: p.contract_min_eur ?? null,
    contract_max_eur: p.contract_max_eur ?? null,
    partner_threshold_eur: p.partner_threshold_eur ?? null,
    guarantee_capacity_eur: p.guarantee_capacity_eur ?? null,
    self_perform_share_pct: p.self_perform_share_pct ?? null,
  };
  c.capabilities = (p.trades ?? []).map((label, i) => ({
    ...rowMeta(p.id, "CAP", [], "PENDING"),
    id: `${p.id}-LEGACY-CAP-${i}`,
    origin: "CUSTOMER_PROVIDED",
    type: normalizeCapabilityType(label),
    label,
  }));
  c.references = (p.references_held ?? []).map((name, i) => ({
    ...rowMeta(p.id, "REF", [], "PENDING"),
    id: `${p.id}-LEGACY-REF-${i}`,
    name,
    client: null,
    location: null,
    project_types: [],
    capabilities: [],
    completed_at: null,
    contract_value_eur: null,
  }));
  c.constraints = (p.hard_exclusions ?? []).map((value, i) => ({
    ...rowMeta(p.id, "CON", [], "PENDING"),
    id: `${p.id}-LEGACY-CON-${i}`,
    origin: "CUSTOMER_PROVIDED",
    type: "WORK_TYPE",
    operator: "EXCLUDE",
    value,
    severity: "HARD",
    state: "EXPLICIT",
    raw_value: value,
  }));
  return c;
}

export function evidenceText(ids: string[], chunks: ChunkRow[]): string {
  return chunks
    .filter((c) => ids.includes(c.id))
    .map((c) => c.text)
    .join("\n");
}
export function manualClaim(): EvidenceClaim {
  return {
    state: "EXPLICIT",
    raw_value: null,
    origin: "CUSTOMER_PROVIDED",
    evidence: [],
  };
}
export function manualOperational(companyId: string): OperationalItem {
  return {
    ...rowMeta(companyId, "OP", [], "CONFIRMED"),
    ...manualClaim(),
    type: "AVAILABLE_CREWS",
    label: "",
    value: null,
    unit: "CREWS",
    available_from: null,
    valid_as_of: null,
  };
}
export function manualPolicy(companyId: string): PolicyItem {
  return {
    ...rowMeta(companyId, "POL", [], "CONFIRMED"),
    ...manualClaim(),
    type: "WORK_TYPE",
    operator: "EXCLUDE",
    value: "",
    severity: "HARD",
  };
}
export { normalizeCapabilityType, normalizeQualificationType };
