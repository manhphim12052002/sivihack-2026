import type { CanonicalCompany } from "./types";
import {
  toCompanyProfile,
  rowMeta,
  manualClaim,
  manualOperational,
  normalizeCapabilityType,
} from "./model";
import { applyReview } from "./review";
/** Translate existing flat form submissions into canonical edits, never into legacy DB writes. */
export function applyLegacyReview(
  c: CanonicalCompany,
  input: Record<string, unknown>,
): CanonicalCompany {
  const old = toCompanyProfile(c),
    draft = structuredClone(c);
  const changed = (k: keyof typeof old) =>
    k in input && JSON.stringify(input[k]) !== JSON.stringify(old[k]);
  if (changed("name")) draft.identity.name = input.name as string;
  if (changed("home_base"))
    draft.identity.headquarters = input.home_base as string;
  for (const k of ["regions", "radius_km"] as const)
    if (changed(k)) Object.assign(draft.geography!, { [k]: input[k] });
  for (const k of Object.keys(draft.commercial_profile) as (keyof typeof old)[])
    if (changed(k)) Object.assign(draft.commercial_profile, { [k]: input[k] });
  if (changed("trades") && Array.isArray(input.trades))
    draft.capabilities = input.trades.map((label) => ({
      ...rowMeta(c.company_id, "CAP", [], "CONFIRMED"),
      origin: "CUSTOMER_PROVIDED",
      type: normalizeCapabilityType(String(label)),
      label: String(label),
    }));
  if (changed("references_held") && Array.isArray(input.references_held))
    draft.references = input.references_held.map((name) => ({
      ...rowMeta(c.company_id, "REF", [], "CONFIRMED"),
      origin: "CUSTOMER_PROVIDED",
      name: String(name),
      client: null,
      location: null,
      completed_at: null,
      contract_value_eur: null,
      project_types: [],
      capabilities: [],
    }));
  if (changed("hard_exclusions") && Array.isArray(input.hard_exclusions))
    draft.constraints = input.hard_exclusions.map((value) => ({
      ...rowMeta(c.company_id, "CON", [], "CONFIRMED"),
      ...manualClaim(),
      type: "WORK_TYPE",
      operator: "EXCLUDE",
      value: String(value),
      severity: "HARD",
    }));
  for (const [key, type, unit] of [
    ["capacity_per_week", "ESTIMATOR_CAPACITY", "BIDS_PER_WEEK"],
    ["earliest_start", "CREW_AVAILABILITY", null],
  ] as const) {
    if (changed(key)) {
      draft.capacity = (draft.capacity ?? []).map((r) =>
        r.type === type ? { ...r, status: "REJECTED" } : r,
      );
      if (input[key] !== null)
        draft.capacity.push({
          ...manualOperational(c.company_id),
          type,
          unit,
          label: type,
          value: key === "capacity_per_week" ? (input[key] as number) : null,
          available_from:
            key === "earliest_start" ? (input[key] as string) : null,
        });
    }
  }
  return applyReview(c, draft);
}
