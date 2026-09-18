import type { CanonicalCompany, ItemStatus } from "./types";
import {
  manualClaim,
  normalizeCapabilityType,
  normalizeQualificationType,
  rowMeta,
} from "./model";
import { CompanyError } from "./errors";

function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new CompanyError("INVALID_PROFILE", "Expected profile fields.");
  return v as Record<string, unknown>;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const dates = new Set([
  "completed_at",
  "available_from",
  "valid_as_of",
  "valid_from",
  "valid_until",
]);
const numbers = new Set([
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
const arrays = new Set([
  "regions",
  "countries",
  "project_types",
  "capabilities",
]);
function value(key: string, v: unknown, policy = false): unknown {
  if (v === undefined)
    throw new CompanyError("INVALID_PROFILE", `Missing ${key}.`);
  if (arrays.has(key)) {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
      throw new CompanyError(
        "INVALID_PROFILE",
        `${key} must be a list of text values.`,
      );
    return v;
  }
  if (numbers.has(key) && !(key === "value" && policy)) {
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0))
      throw new CompanyError(
        "INVALID_PROFILE",
        `${key} must be a nonnegative number or empty.`,
      );
    if (key === "employees" && v !== null && !Number.isInteger(v))
      throw new CompanyError(
        "INVALID_PROFILE",
        "Employee count must be a whole number.",
      );
    return v;
  }
  if (v !== null && typeof v !== "string")
    throw new CompanyError("INVALID_PROFILE", `${key} must be text or empty.`);
  if (
    dates.has(key) &&
    v !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(v as string) ||
      Number.isNaN(Date.parse(v as string)) ||
      new Date(v as string).toISOString().slice(0, 10) !== v)
  )
    throw new CompanyError(
      "INVALID_PROFILE",
      `${key} needs a complete valid date; leave unknown dates empty.`,
    );
  return v;
}
export function applyReview(
  old: CanonicalCompany,
  input: unknown,
): CanonicalCompany {
  const body = record(input),
    c = structuredClone(old);
  if (body.revision !== old.revision)
    throw new CompanyError(
      "PROFILE_CONFLICT",
      "Reload the profile before saving newer changes.",
      409,
    );
  for (const [section, keys] of Object.entries({
    identity: ["name", "headquarters", "employees", "revenue_eur", "website"],
    geography: ["regions", "countries", "radius_km"],
    commercial_profile: [
      "contract_min_eur",
      "contract_max_eur",
      "partner_threshold_eur",
      "guarantee_capacity_eur",
      "self_perform_share_pct",
    ],
  })) {
    if (!(section in body)) continue;
    const incoming = record(body[section]);
    const target = c[section as keyof CanonicalCompany] as unknown as Record<
      string,
      unknown
    >;
    for (const key of keys)
      if (key in incoming) {
        const v = value(key, incoming[key]);
        if (!equal(target[key], v)) {
          target[key] = v;
          c.field_evidence = {
            ...c.field_evidence,
            [`${section}.${key}`]: manualClaim(),
          };
        }
      }
  }
  if (!c.identity.name?.trim())
    throw new CompanyError("INVALID_PROFILE", "Company name is required.");
  const specs = {
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
    constraints: [
      "type",
      "operator",
      "value",
      "severity",
      "raw_value",
      "state",
    ],
    preferences: [
      "type",
      "operator",
      "value",
      "severity",
      "raw_value",
      "state",
    ],
  };
  for (const [section, keys] of Object.entries(specs)) {
    if (!(section in body)) continue;
    if (!Array.isArray(body[section]))
      throw new CompanyError("INVALID_PROFILE", `${section} must be an array.`);
    const previous = (old[section as keyof CanonicalCompany] ??
      []) as unknown as Record<string, unknown>[];
    const next = (body[section] as unknown[]).map((item) => {
      const r = record(item);
      const prior = previous.find((p) => p.id === r.id);
      const row: Record<string, unknown> = prior
        ? { ...prior }
        : {
            ...rowMeta(c.company_id, section.toUpperCase(), [], "CONFIRMED"),
            ...manualClaim(),
            freshness: "STALE",
          };
      let changed = !prior;
      for (const key of keys) {
        if (!(key in r)) {
          if (!prior)
            throw new CompanyError(
              "INVALID_PROFILE",
              `${section}.${key} is required.`,
            );
          continue;
        }
        const v = value(
          key,
          r[key],
          section === "constraints" || section === "preferences",
        );
        changed ||= !equal(row[key], v);
        row[key] = v;
      }
      if (!["PENDING", "CONFIRMED", "REJECTED"].includes(String(r.status)))
        throw new CompanyError("INVALID_PROFILE", "Invalid review status.");
      row.status = r.status as ItemStatus;
      if (changed) row.origin = "CUSTOMER_PROVIDED";
      if (section === "capabilities" || section === "qualifications") {
        if (!row.label)
          throw new CompanyError("INVALID_PROFILE", "Label is required.");
        row.type =
          section === "capabilities"
            ? normalizeCapabilityType(String(row.label))
            : normalizeQualificationType(String(row.label));
      }
      if (
        section === "qualifications" &&
        !["KNOWN_PRESENT", "KNOWN_ABSENT"].includes(String(row.knowledge_state))
      )
        throw new CompanyError(
          "INVALID_PROFILE",
          "Specify qualification knowledge state.",
        );
      if (section === "references" && !row.name)
        throw new CompanyError(
          "INVALID_PROFILE",
          "Reference name is required.",
        );
      if (
        ["resources", "capacity", "constraints", "preferences"].includes(
          section,
        ) &&
        !["EXPLICIT", "NORMALIZED", "AMBIGUOUS", "UNKNOWN"].includes(
          String(row.state),
        )
      )
        throw new CompanyError("INVALID_PROFILE", "Invalid extraction state.");
      if (
        ["constraints", "preferences"].includes(section) &&
        !["HARD", "SOFT"].includes(String(row.severity))
      )
        throw new CompanyError("INVALID_PROFILE", "Invalid severity.");
      if (row.type === "CREW_AVAILABILITY" && !row.available_from)
        row.state = "AMBIGUOUS";
      if (row.type === "ESTIMATOR_CAPACITY" && row.unit !== "BIDS_PER_WEEK")
        throw new CompanyError(
          "INVALID_PROFILE",
          "Estimator capacity must use BIDS_PER_WEEK.",
        );
      return row;
    });
    // Omitted rows are retained. Use rejection instead of destructive deletion.
    const ids = new Set(next.map((r) => r.id));
    if (ids.size !== next.length)
      throw new CompanyError("INVALID_PROFILE", "Duplicate record ids.");
    (c as unknown as Record<string, unknown>)[section] = [
      ...next,
      ...previous.filter((r) => !ids.has(r.id)),
    ];
  }
  return c;
}
