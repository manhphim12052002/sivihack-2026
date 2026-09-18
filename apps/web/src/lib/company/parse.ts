import { normalizeCapabilityTypes } from "./normalize";
import type {
  CanonicalCompany,
  ChunkRow,
  ExtractionState,
  OperationalItem,
  PolicyItem,
} from "./types";
import {
  emptyCompany,
  rowMeta,
  evidenceText,
  normalizeCapabilityType,
  normalizeQualificationType,
} from "./model";
import { CompanyError } from "./errors";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new CompanyError("LLM_PARSE_ERROR", "Expected an extraction object.");
  return v as Obj;
};
const list = (v: unknown): unknown[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v))
    throw new CompanyError("LLM_PARSE_ERROR", "Expected an extraction array.");
  return v;
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const strings = (v: unknown): string[] =>
  list(v)
    .map(str)
    .filter((v): v is string => v !== null);

function specificName(v: unknown, source: string): string | null {
  const s = str(v);
  return s &&
    !/^(state|district|municipal|city|landkreis|staat|stadt)$/i.test(s) &&
    source.toLowerCase().includes(s.toLowerCase())
    ? s
    : null;
}

export function safeDate(value: unknown, source: string): string | null {
  const s = str(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (!source.includes(s)) return null; // No invented day/year, including month-only availability.
  const date = new Date(s);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === s
    ? s
    : null;
}
/** Normalize explicit source numbers including German/English monetary suffixes. */
export function sourceNumbers(source: string): number[] {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    ein: 1,
    eine: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    fünf: 5,
  };
  const wordNumbers = Object.entries(words)
    .filter(([word]) => new RegExp(`\\b${word}\\b`, "i").test(source))
    .map(([, n]) => n);
  return [
    ...wordNumbers,
    ...[
      ...source.matchAll(
        /\d+(?:[.,]\d+)*(?:\s*(?:million(?:en)?|mio\.?|milliarden|billion|[mk])\b)?/gi,
      ),
    ].map((m) => {
      let value = m[0].toLowerCase().replace(/\s/g, "");
      const multiplier = /(?:milliarden|billion)$/.test(value)
        ? 1e9
        : /(?:million(?:en)?|mio\.?|m)$/.test(value)
          ? 1e6
          : /k$/.test(value)
            ? 1000
            : 1;
      value = value.replace(/[a-z]+\.?$/, "");
      if (/^\d{1,3}(?:[.,]\d{3})+$/.test(value))
        value = value.replace(/[.,]/g, "");
      else value = value.replace(",", ".");
      return Number(value) * multiplier;
    }),
  ];
}
const groundedNumber = (v: unknown, text: string) => {
  const n = num(v);
  return n !== null && sourceNumbers(text).some((x) => Math.abs(x - n) < 0.001)
    ? n
    : null;
};

export function parseIntelligence(
  json: string,
  companyId: string,
  chunks: ChunkRow[],
): CanonicalCompany {
  let raw: Obj;
  try {
    raw = obj(JSON.parse(json));
  } catch {
    throw new CompanyError(
      "LLM_PARSE_ERROR",
      "The model returned invalid structured company data.",
    );
  }
  if (
    ![
      "facts",
      "capabilities",
      "references",
      "qualifications",
      "resources",
      "capacity",
      "constraints",
      "preferences",
    ].some((k) => k in raw)
  )
    throw new CompanyError(
      "LLM_PARSE_ERROR",
      "The model omitted all company extraction fields.",
    );
  const c = emptyCompany(companyId, "");
  const evidence = (r: Obj) => {
    const ids = strings(r.chunk_ids);
    if (!ids.length || ids.some((id) => !chunks.some((ch) => ch.id === id)))
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        "Extraction cited missing or invalid source chunks.",
      );
    const quote = str(r.raw_value);
    if (
      quote &&
      !evidenceText(ids, chunks).toLowerCase().includes(quote.toLowerCase())
    )
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        "Extraction excerpt is not present in the cited source.",
      );
    return ids;
  };
  const claim = (r: Obj, ids: string[]) => ({
    origin: "DOCUMENT_EXTRACTED",
    evidence: ids,
    raw_value: str(r.raw_value),
    state: (["EXPLICIT", "NORMALIZED", "AMBIGUOUS", "UNKNOWN"].includes(
      String(r.state),
    )
      ? r.state
      : "EXPLICIT") as ExtractionState,
  });
  const allowed: Record<string, "number" | "string" | "array"> = {
    "identity.name": "string",
    "identity.headquarters": "string",
    "identity.employees": "number",
    "identity.revenue_eur": "number",
    "identity.website": "string",
    "geography.regions": "array",
    "geography.countries": "array",
    "geography.radius_km": "number",
    "commercial_profile.contract_min_eur": "number",
    "commercial_profile.contract_max_eur": "number",
    "commercial_profile.partner_threshold_eur": "number",
    "commercial_profile.guarantee_capacity_eur": "number",
    "commercial_profile.self_perform_share_pct": "number",
  };
  for (const item of list(raw.facts)) {
    const r = obj(item);
    const field = String(r.field);
    if (!allowed[field])
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        `Unsupported company field: ${field}`,
      );
    const ids = evidence(r);
    const text = str(r.raw_value) ?? evidenceText(ids, chunks);
    const value =
      allowed[field] === "number"
        ? groundedNumber(r.value, text)
        : allowed[field] === "array"
          ? strings(r.value)
          : str(r.value);
    const [section, key] = field.split(".");
    (c[section as keyof CanonicalCompany] as unknown as Obj)[key] = value;
    c.field_evidence![field] = {
      ...claim(r, ids),
      state: value === null ? "AMBIGUOUS" : claim(r, ids).state,
    };
  }
  for (const item of list(raw.capabilities)) {
    const r = obj(item),
      ids = evidence(r),
      label = str(r.label);
    if (!label)
      throw new CompanyError("LLM_PARSE_ERROR", "Capability label missing.");
    for (const type of normalizeCapabilityTypes(label))
      c.capabilities.push({ ...rowMeta(companyId, "CAP", ids), type, label });
  }
  for (const item of list(raw.references)) {
    const r = obj(item),
      ids = evidence(r),
      name = str(r.name) ?? str(r.raw_value);
    const text = str(r.raw_value) ?? evidenceText(ids, chunks);
    if (!name)
      throw new CompanyError("LLM_PARSE_ERROR", "Reference name missing.");
    c.references.push({
      ...rowMeta(companyId, "REF", ids),
      name,
      client: specificName(r.client, text),
      location: specificName(r.location, text),
      project_types: strings(r.project_types),
      capabilities: [
        ...new Set([
          ...strings(r.capabilities).flatMap(normalizeCapabilityTypes),
          ...normalizeCapabilityTypes(name),
        ]),
      ].filter((t) => t !== "OTHER"),
      contract_value_eur: groundedNumber(r.contract_value_eur, text),
      completed_at: safeDate(r.completed_at, text),
    });
  }
  for (const item of list(raw.qualifications)) {
    const r = obj(item),
      ids = evidence(r),
      label = str(r.label);
    const text = str(r.raw_value) ?? evidenceText(ids, chunks);
    if (
      !label ||
      !["KNOWN_PRESENT", "KNOWN_ABSENT"].includes(String(r.knowledge_state))
    )
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        "Qualification requires an explicit knowledge state.",
      );
    // Negative claims require a source statement, never mere omission.
    if (
      r.knowledge_state === "KNOWN_ABSENT" &&
      (!/\b(no|not|without|kein\w*|nicht|ohne)\b/i.test(text) ||
        normalizeQualificationType(text) !== normalizeQualificationType(label))
    )
      throw new CompanyError(
        "LLM_PARSE_ERROR",
        "Unsupported negative qualification claim.",
      );
    c.qualifications.push({
      ...rowMeta(companyId, "QUAL", ids),
      type: normalizeQualificationType(label),
      label,
      knowledge_state: r.knowledge_state as "KNOWN_PRESENT" | "KNOWN_ABSENT",
      valid_from: safeDate(r.valid_from, text),
      valid_until: safeDate(r.valid_until, text),
      freshness: "STALE",
    });
  }
  for (const section of ["resources", "capacity"] as const) {
    for (const item of list(raw[section])) {
      const r = obj(item),
        ids = evidence(r),
        label = str(r.label),
        type = str(r.type);
      const text = str(r.raw_value) ?? evidenceText(ids, chunks);
      if (!label || !type)
        throw new CompanyError(
          "LLM_PARSE_ERROR",
          "Resource/capacity type and label required.",
        );
      if (
        type === "ESTIMATOR_CAPACITY" &&
        !/(?:bids?|tenders?|angebote|ausschreibungen).{0,50}(?:week|woche)|(?:week|woche).{0,50}(?:bids?|tenders?|angebote)/i.test(
          text.replace(/\n/g, " "),
        )
      )
        continue;
      if (
        section === "capacity" &&
        ![
          "ESTIMATOR_CAPACITY",
          "AVAILABLE_CREWS",
          "CREW_AVAILABILITY",
          "GUARANTEE_AVAILABLE",
        ].includes(type)
      )
        throw new CompanyError("LLM_PARSE_ERROR", "Unsupported capacity type.");
      if (
        type === "AVAILABLE_CREWS" &&
        /committed|gebunden|belegt/i.test(text) &&
        !/available|verfügbar|frei/i.test(text)
      )
        continue;
      const available = safeDate(r.available_from, text);
      const row: OperationalItem = {
        ...rowMeta(companyId, "OP", ids),
        ...claim(r, ids),
        type,
        label,
        value: groundedNumber(r.value, text),
        unit: str(r.unit),
        available_from: available,
        valid_as_of: safeDate(r.valid_as_of, text),
      };
      if (type === "CREW_AVAILABILITY" && !available) {
        row.state = "AMBIGUOUS";
        row.raw_value = str(r.raw_value) ?? text;
      }
      c[section]!.push(row);
    }
  }
  for (const section of ["constraints", "preferences"] as const) {
    for (const item of list(raw[section])) {
      const r = obj(item),
        ids = evidence(r),
        value = str(r.value),
        type = str(r.type),
        operator = str(r.operator);
      if (!value || !type || !operator)
        throw new CompanyError(
          "LLM_PARSE_ERROR",
          "Constraint/preference needs type, operator, value.",
        );
      const row: PolicyItem = {
        ...rowMeta(companyId, "POL", ids),
        ...claim(r, ids),
        type,
        operator:
          type === "COUNTRY" &&
          /outside|außerhalb|ausserhalb/i.test(str(r.raw_value) ?? "")
            ? "OUTSIDE"
            : operator,
        value,
        severity:
          section === "preferences"
            ? "SOFT"
            : r.severity === "SOFT"
              ? "SOFT"
              : "HARD",
      };
      c[section]!.push(row);
    }
  }
  c.geography!.headquarters = c.identity.headquarters;
  c.regions = c.geography!.regions;
  c.radius_km = c.geography!.radius_km;
  return c;
}
