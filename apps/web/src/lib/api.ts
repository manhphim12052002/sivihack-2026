/**
 * Thin typed fetch wrapper over the tender-screening backend. Every
 * request/response shape comes from the generated `api-types.d.ts` (OpenAPI
 * components) — this file never hand-declares a parallel type.
 *
 * The backend lives in this same Next.js app as route handlers under
 * `src/app/api/*` (same-origin, no separate service to run). Endpoints that
 * have a real implementation behind them (companies) hit Supabase; endpoints
 * that don't have a pipeline yet (tenders, screen) are served by placeholder
 * fixtures + a small rule engine — see `src/lib/mock/tenders.ts` and
 * `src/lib/screening/engine.ts`. `NEXT_PUBLIC_API_URL` can still override this
 * to point at a standalone service later without touching call sites here.
 */
import type { components } from "./api-types";

export type TenderSummary = components["schemas"]["TenderSummary"];
export type TenderDetail = components["schemas"]["TenderDetail"];
export type TenderDocument = components["schemas"]["TenderDocument"];
export type TenderFactSheet = components["schemas"]["TenderFactSheet"];
export type Fact = components["schemas"]["Fact"];
export type Evidence = components["schemas"]["Evidence"];
export type CompanyProfile = components["schemas"]["CompanyProfile"];
export type CompanyCreate = components["schemas"]["CompanyCreate"];
export type Verdict = components["schemas"]["Verdict"];
export type CriterionResult = components["schemas"]["CriterionResult"];
export type ScreenRequest = components["schemas"]["ScreenRequest"];
export type IngestRequest = components["schemas"]["IngestRequest"];
export type IngestJob = components["schemas"]["IngestJob"];

// Same-origin by default — every endpoint below is a route handler in this
// app (`src/app/api/*`). Set NEXT_PUBLIC_API_URL to point at a standalone
// service instead (e.g. once a real FastAPI pipeline replaces the stubs).
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_PREFIX = "/api";

/** Distinguishes "API reachable but returned an error" from "API unreachable". */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  // Never set Content-Type for FormData bodies — the browser must add the
  // multipart boundary itself, an explicit header would break parsing.
  const headers = isFormData
    ? init.headers
    : { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) };

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, `Could not reach the API at ${BASE_URL}${API_PREFIX}. Is the dev server running?`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(response.status, body || response.statusText);
  }

  return (await response.json()) as T;
}

/** Used by the offline banner; never throws, resolves to false on any failure. */
export async function checkHealth(): Promise<boolean> {
  try {
    await request<Record<string, boolean>>("/health");
    return true;
  } catch {
    return false;
  }
}

export const api = {
  tenders: () => request<TenderSummary[]>("/tenders"),
  tender: (id: string) => request<TenderDetail>(`/tenders/${encodeURIComponent(id)}`),

  companies: () => request<CompanyProfile[]>("/companies"),
  company: (id: string) => request<CompanyProfile>(`/companies/${encodeURIComponent(id)}`),

  createCompanyFromText: (text: string) =>
    request<CompanyProfile>("/companies", {
      method: "POST",
      body: JSON.stringify({ text } satisfies CompanyCreate),
    }),

  createCompanyFromFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CompanyProfile>("/companies", { method: "POST", body: form });
  },

  updateCompany: (id: string, profile: CompanyProfile) =>
    request<CompanyProfile>(`/companies/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(profile),
    }),

  /** `tenderIds` narrows a screen to one tender (the briefing page) instead of the whole batch. */
  screen: (companyId: string, tenderIds?: string[]) =>
    request<Verdict[]>("/screen", {
      method: "POST",
      body: JSON.stringify({ company_id: companyId, tender_ids: tenderIds ?? null } satisfies ScreenRequest),
    }),

  ingestFiles: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request<IngestJob>("/ingest", { method: "POST", body: form });
  },

  ingestUrl: (noticeUrl: string) =>
    request<IngestJob>("/ingest", {
      method: "POST",
      body: JSON.stringify({ notice_url: noticeUrl } satisfies IngestRequest),
    }),

  job: (id: string) => request<IngestJob>(`/jobs/${encodeURIComponent(id)}`),
};
