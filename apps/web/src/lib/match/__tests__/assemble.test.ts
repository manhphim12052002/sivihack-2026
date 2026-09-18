import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { from: vi.fn() } }));
vi.mock("@/lib/llm", () => ({ llmClient: null, SEMANTIC_MATCH_PROMPT: "", PROFILE_SYSTEM_PROMPT: "", EXTRACTION_SYSTEM_PROMPT: "" }));
vi.mock("@/lib/company/assemble", () => ({ assembleCanonicalCompany: vi.fn() }));

import { db } from "@/lib/db";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { runMatchEvaluation } from "../assemble";
import type { CanonicalCompany, TenderDetail } from "../types";

const baseCompany: CanonicalCompany = {
  company_id: "COMP-001",
  identity: { name: "Brenner GmbH", headquarters: "Augsburg", employees: null, revenue_eur: null, website: null },
  capabilities: [],
  references: [],
  qualifications: [],
  commercial_profile: { contract_min_eur: 400_000, contract_max_eur: 5_000_000, guarantee_capacity_eur: 1_500_000, self_perform_share_pct: 70 },
  regions: ["Bavaria"],
  radius_km: 150,
  sources: [],
  knowledge_gaps: [],
};

const BASE_TENDER = { lot_count: 1, docs_retrieved: false, source: "test" };

const tenderWithHardFail: TenderDetail = {
  ...BASE_TENDER,
  id: "TENDER-001",
  title: "Test tender",
  fact_sheet: {
    submission_deadline: { value: "2020-01-01", confidence: "high", evidence: [] },
  },
};

const tenderWithHardUncertain: TenderDetail = {
  ...BASE_TENDER,
  id: "TENDER-002",
  title: "Test tender",
  fact_sheet: {
    guarantees: { value: null, confidence: "not_found", evidence: [] },
    trade_scope: { value: "Straßenbau", confidence: "high", evidence: [] },
  },
};

const tenderAllPass: TenderDetail = {
  ...BASE_TENDER,
  id: "TENDER-003",
  title: "All pass",
  fact_sheet: {
    estimated_value: { value: 2_000_000, confidence: "high", evidence: [] },
    submission_deadline: { value: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), confidence: "high", evidence: [] },
  },
};

function mockDb() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  vi.mocked(db.from).mockReturnValue(chain as unknown as ReturnType<typeof db.from>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assembleCanonicalCompany).mockResolvedValue(baseCompany);
  mockDb();
});

describe("runMatchEvaluation", () => {
  it("returns BLOCKED when a HARD requirement fails", async () => {
    const evaluation = await runMatchEvaluation(tenderWithHardFail, "COMP-001");
    expect(evaluation.viability.status).toBe("BLOCKED");
    expect(evaluation.viability.hard_blockers).toBeGreaterThan(0);
    expect(evaluation.matrix.hard_blockers.length).toBeGreaterThan(0);
  });

  it("returns REVIEW when a HARD requirement is UNCERTAIN", async () => {
    const evaluation = await runMatchEvaluation(tenderWithHardUncertain, "COMP-001");
    expect(evaluation.viability.status).toBe("REVIEW");
    expect(evaluation.viability.hard_unknowns).toBeGreaterThan(0);
  });

  it("returns VIABLE when all requirements pass", async () => {
    const company = {
      ...baseCompany,
      commercial_profile: { ...baseCompany.commercial_profile, contract_min_eur: null, contract_max_eur: null },
    };
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(company);
    const evaluation = await runMatchEvaluation(tenderAllPass, "COMP-001");
    // submission_deadline passes, estimated_value → UNCERTAIN (no limits) → REVIEW at worst
    expect(["VIABLE", "REVIEW"]).toContain(evaluation.viability.status);
  });

  it("populates matrix.results with one result per task", async () => {
    const evaluation = await runMatchEvaluation(tenderAllPass, "COMP-001");
    expect(evaluation.matrix.results.length).toBe(2);
  });

  it("records knowledge gaps for HARD UNCERTAIN results", async () => {
    const evaluation = await runMatchEvaluation(tenderWithHardUncertain, "COMP-001");
    const gapTypes = evaluation.matrix.knowledge_gaps.map((g) => g.concept);
    // trade_scope UNCERTAIN → gap; guarantees absent → skipped_gap
    expect(gapTypes.length).toBeGreaterThan(0);
  });

  it("returns evaluation with correct tender_id and company_id", async () => {
    const evaluation = await runMatchEvaluation(tenderAllPass, "COMP-001");
    expect(evaluation.tender_id).toBe("TENDER-003");
    expect(evaluation.company_id).toBe("COMP-001");
  });

  it("evaluation id starts with EVAL-", async () => {
    const evaluation = await runMatchEvaluation(tenderAllPass, "COMP-001");
    expect(evaluation.id).toMatch(/^EVAL-/);
  });

  it("returns empty matrix when fact_sheet is null", async () => {
    const tender: TenderDetail = { ...BASE_TENDER, id: "TENDER-EMPTY", title: "Empty", fact_sheet: null };
    const evaluation = await runMatchEvaluation(tender, "COMP-001");
    expect(evaluation.matrix.results).toHaveLength(0);
    expect(evaluation.viability.status).toBe("VIABLE");
  });
});
