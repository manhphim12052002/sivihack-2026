import type { Confidence, Overall, Status } from "@/lib/status";

// ─── Domain types ─────────────────────────────────────────────────────────────

export type { Confidence, Overall, Status };

export interface Evidence {
  quote_de: string;
  doc: string;
  page?: number | null;
}

export interface Fact {
  value: unknown;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface TenderFactSheet {
  trade_scope: Fact;
  place_of_performance: Fact;
  estimated_value: Fact;
  lots: Fact;
  references_required: Fact;
  eligibility_proofs: Fact;
  construction_window: Fact;
  guarantees: Fact;
  penalty: Fact;
  self_performance_min_pct: Fact;
  side_offers_allowed: Fact;
  consortium_allowed: Fact;
  submission_deadline: Fact;
  special_qualifications: Fact;
  contractor_role: Fact;
}

export interface TenderDocument {
  name: string;
  pages?: number | null;
  text_extracted: boolean;
}

export interface TenderSummary {
  id: string;
  title: string;
  buyer_name: string | null;
  place_city: string | null;
  estimated_value_eur: number | null;
  submission_deadline: string | null;
  lot_count: number;
  source: string;
  docs_retrieved: boolean;
}

export interface TenderDetail extends TenderSummary {
  cpv_main: string | null;
  lots: TenderSummary[];
  documents: TenderDocument[];
  fact_sheet: TenderFactSheet | null;
}

export interface CriterionResult {
  criterion: string;
  status: Status;
  kind: "numeric" | "semantic";
  reason_en: string;
  tender_evidence: Evidence[];
  company_fact: string | null;
}

export interface Verdict {
  tender_id: string;
  overall: Overall;
  blockers: number;
  risks: number;
  unknowns: number;
  summary_en?: string;
  criteria: CriterionResult[];
}

export interface CompanyProfile {
  id: string;
  name: string;
  home_base: string;
  regions?: string[];
  radius_km?: number | null;
  trades?: string[];
  cpv_prefixes?: string[];
  contract_min_eur?: number | null;
  contract_max_eur?: number | null;
  partner_threshold_eur?: number | null;
  guarantee_capacity_eur?: number | null;
  self_perform_share_pct?: number | null;
  earliest_start?: string | null;
  capacity_per_week: number;
  references_held?: string[];
  hard_exclusions?: string[];
  raw_text: string;
}

export type JobStage =
  | "queued"
  | "downloading"
  | "extracting_text"
  | "extracting_facts"
  | "done"
  | "error";

export interface IngestJob {
  id: string;
  stage: JobStage;
  pct: number;
  message?: string | null;
  tender_id?: string | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

async function upload<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b.error) message = b.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  // Companies
  companies(): Promise<CompanyProfile[]> {
    return request("/api/companies");
  },
  createCompanyFromText(text: string): Promise<CompanyProfile> {
    return request("/api/companies", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
  createCompanyFromFile(file: File): Promise<CompanyProfile> {
    const form = new FormData();
    form.append("file", file);
    return upload("/api/companies", form);
  },
  getCompany(id: string): Promise<CompanyProfile> {
    return request(`/api/companies/${id}`);
  },
  updateCompany(id: string, profile: CompanyProfile): Promise<CompanyProfile> {
    return request(`/api/companies/${id}`, {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  },

  // Tenders
  tenders(): Promise<TenderSummary[]> {
    return request("/api/tenders");
  },
  tender(id: string): Promise<TenderDetail> {
    return request(`/api/tenders/${id}`);
  },

  // Screening
  screen(companyId: string, tenderIds?: string[]): Promise<Verdict[]> {
    const params = new URLSearchParams({ company: companyId });
    if (tenderIds?.length) {
      tenderIds.forEach((t) => params.append("tender", t));
    }
    return request(`/api/screen?${params.toString()}`);
  },

  // Ingest jobs
  ingestFiles(files: File[]): Promise<IngestJob> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return upload("/api/ingest", form);
  },
  ingestUrl(url: string): Promise<IngestJob> {
    return request("/api/ingest", { method: "POST", body: JSON.stringify({ url }) });
  },
  job(id: string): Promise<IngestJob> {
    return request(`/api/jobs/${id}`);
  },
} as const;
