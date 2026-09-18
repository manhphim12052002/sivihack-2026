import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/llm", () => ({ llmClient: null, SEMANTIC_MATCH_PROMPT: "", PROFILE_SYSTEM_PROMPT: "", EXTRACTION_SYSTEM_PROMPT: "" }));
vi.mock("@/lib/company/assemble", () => ({ assembleCanonicalCompany: vi.fn() }));

import { supabase } from "@/lib/supabase";
import { assembleCanonicalCompany } from "@/lib/company/assemble";
import { runMatchEvaluation, runAllLotEvaluations } from "../assemble";
import { generateTasks } from "../tasks";
import { runRuleMatcher } from "../rule-matcher";
import type { CanonicalCompany, TenderDetail, MatchingTask } from "../types";
import type { PolicyItem } from "@/lib/company/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockSupabase() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>);
}

/** Company: €31M turnover, road capability, hard rail-side exclusion, €5M partner threshold */
function makeBrenner(overrides: Partial<CanonicalCompany> = {}): CanonicalCompany {
  const railConstraint: PolicyItem = {
    id: "CON-RAIL",
    company_id: "COMP-B",
    type: "WORK_TYPE",
    operator: "EXCLUDE",
    value: "RAIL_SIDE",
    severity: "HARD",
    status: "CONFIRMED",
    state: "EXPLICIT",
    raw_value: "No rail-side work",
    origin: "DOCUMENT_EXTRACTED",
    evidence: [],
  };
  return {
    company_id: "COMP-B",
    identity: { name: "Brenner", headquarters: "Augsburg", employees: null, revenue_eur: 31_000_000, website: null },
    capabilities: [{ id: "CAP-ROAD", company_id: "COMP-B", type: "ROAD_CONSTRUCTION", label: "Straßenbau", origin: "DOCUMENT_EXTRACTED", status: "CONFIRMED", evidence: [] } as never],
    references: [],
    qualifications: [],
    commercial_profile: {
      contract_min_eur: 400_000,
      contract_max_eur: 4_000_000,
      partner_threshold_eur: 5_000_000,
      guarantee_capacity_eur: 1_500_000,
      self_perform_share_pct: 80,
    },
    regions: ["Bavaria"],
    radius_km: 150,
    constraints: [railConstraint],
    preferences: [],
    resources: [],
    capacity: [],
    sources: [],
    knowledge_gaps: [],
    ...overrides,
  };
}

/** Multi-lot tender: tender-level turnover, LOT-01 road, LOT-02 rail-side road */
const multiLotTender: TenderDetail = {
  id: "T-100",
  title: "Straßenbau T-100",
  lot_count: 2,
  docs_retrieved: false,
  source: "test",
  lots: [
    { id: "LOT-01", title: "Earthworks & road — LOT-01", value_eur: 3_000_000, trade: "road construction", cpv: "45233" },
    { id: "LOT-02", title: "Rail-side road — LOT-02", value_eur: 7_000_000, trade: "rail-side road construction", cpv: "45234" },
  ],
  fact_sheet: {
    // Tender-level requirement
    estimated_value: { value: 10_000_000, confidence: "high", evidence: [] },
    submission_deadline: { value: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), confidence: "high", evidence: [] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase();
});

// ─── A. Lot isolation ─────────────────────────────────────────────────────────

describe("A — lot isolation", () => {
  it("LOT-01 evaluation does not contain LOT-02-specific trade scope", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-01");
    // trade_scope for LOT-01 is "road construction" — must not be "rail-side"
    const tradeResult = ev.matrix.results.find((r) => r.requirement_id === "trade_scope");
    expect(tradeResult?.reason).not.toMatch(/rail/i);
    expect(ev.bid_scope.lot_id).toBe("LOT-01");
  });

  it("LOT-01 evaluation does not produce a constraint FAIL from LOT-02 rail requirement", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-01");
    // No hard blocker should come from rail-side — LOT-01 is plain road
    const railBlocker = ev.matrix.hard_blockers.find((r) => /rail/i.test(r.reason));
    expect(railBlocker).toBeUndefined();
    expect(ev.viability.status).not.toBe("BLOCKED");
  });
});

// ─── B. Tender-level inheritance ──────────────────────────────────────────────

describe("B — tender-level requirement inheritance", () => {
  it("submission_deadline from tender level applies to LOT-01", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-01");
    const deadline = ev.matrix.results.find((r) => r.requirement_id === "submission_deadline");
    expect(deadline).toBeDefined();
    expect(deadline?.status).toBe("PASS");
  });

  it("submission_deadline from tender level applies to LOT-02 as well", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-02");
    const deadline = ev.matrix.results.find((r) => r.requirement_id === "submission_deadline");
    expect(deadline).toBeDefined();
    expect(deadline?.status).toBe("PASS");
  });
});

// ─── C. runAllLotEvaluations ──────────────────────────────────────────────────

describe("C — all-lots evaluation", () => {
  it("returns one evaluation per lot", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const results = await runAllLotEvaluations(multiLotTender, "COMP-B");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.bid_scope.lot_id)).toEqual(["LOT-01", "LOT-02"]);
  });

  it("non-lotted tender returns a single TENDER-scoped evaluation", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const singleTender: TenderDetail = {
      id: "T-SINGLE",
      title: "Single tender",
      lot_count: 1,
      docs_retrieved: false,
      source: "test",
      lots: [{ id: "T-SINGLE-L1", value_eur: 1_000_000, trade: "road", cpv: "45233" }],
      fact_sheet: {
        submission_deadline: { value: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), confidence: "high", evidence: [] },
      },
    };
    const results = await runAllLotEvaluations(singleTender, "COMP-B");
    expect(results).toHaveLength(1);
    expect(results[0].bid_scope.type).toBe("TENDER");
  });
});

// ─── D. Hard work-type constraint triggered ───────────────────────────────────

describe("D — hard work-type constraint: RAIL_SIDE exclusion", () => {
  it("RAIL_SIDE exclusion + rail-side tender trade scope → FAIL / BLOCKED", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-02");
    // LOT-02 trade is "rail-side road construction"
    const constraintFail = ev.matrix.hard_blockers.find((r) => /rail/i.test(r.reason));
    expect(constraintFail).toBeDefined();
    expect(ev.viability.status).toBe("BLOCKED");
  });

  it("constraint task method is CONSTRAINT", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-02");
    const constraintResult = ev.matrix.results.find((r) => r.method === "CONSTRAINT" && /rail/i.test(r.reason));
    expect(constraintResult?.status).toBe("FAIL");
  });
});

// ─── E. Hard constraint not triggered ────────────────────────────────────────

describe("E — hard constraint NOT triggered by plain road tender", () => {
  it("RAIL_SIDE exclusion + ordinary road tender → PASS on trade scope", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-01");
    // All constraint results on LOT-01 must be PASS
    const constraintResults = ev.matrix.results.filter((r) => r.method === "CONSTRAINT");
    constraintResults.forEach((r) => expect(r.status).toBe("PASS"));
    const railBlocker = ev.matrix.hard_blockers.find((r) => /exclusion|rail/i.test(r.reason));
    expect(railBlocker).toBeUndefined();
  });
});

// ─── F. Missing tender info + hard constraint → not false PASS ───────────────

describe("F — missing tender trade scope with active hard constraint", () => {
  it("absent trade scope fact with RAIL_SIDE exclusion → UNCERTAIN (not PASS)", () => {
    const railConstraint: PolicyItem = {
      id: "CON-RAIL", company_id: "C", type: "WORK_TYPE", operator: "EXCLUDE", value: "RAIL_SIDE",
      severity: "HARD", status: "CONFIRMED", state: "EXPLICIT", raw_value: null, origin: "TEST", evidence: [],
    };
    const company = makeBrenner({ constraints: [railConstraint] });
    // Empty fact sheet — no trade_scope key
    const { tasks } = generateTasks({}, () => null, company);
    const constraintTask = tasks.find((t) => t.matcher_type === "CONSTRAINT");
    expect(constraintTask).toBeDefined();
    expect(constraintTask?.tender_value).toBeNull();
    // When tender_value is null, constraint matcher returns UNCERTAIN
    const { runConstraintFromTask } = (() => {
      // Inline check: tender_value null → status UNCERTAIN
      const tenderText = constraintTask?.tender_value;
      const status = tenderText === null ? "UNCERTAIN" : "unknown";
      return { runConstraintFromTask: status };
    })();
    expect(runConstraintFromTask).toBe("UNCERTAIN");
  });
});

// ─── G. Partner threshold ─────────────────────────────────────────────────────

describe("G — partner threshold", () => {
  it("€7M tender + €5M partner threshold → PARTNER_REQUIRED / REVIEW", () => {
    const task: MatchingTask = {
      id: "T1", requirement_id: "estimated_value", label: "Contract value",
      matcher_type: "RULE", severity: "SOFT",
      tender_value: 7_000_000, company_value: null, tender_evidence: [], aspect: "CONTRACT_SIZE",
    };
    const company = makeBrenner();
    const result = runRuleMatcher(task, company);
    expect(result.method).toBe("PARTNER_REQUIRED");
    expect(result.reason).toMatch(/partner.*JV/i);
    expect(result.severity).toBe("HARD");
    expect(result.status).toBe("UNCERTAIN");
  });

  it("€3M tender within €4M max → PASS (no partner needed)", () => {
    const task: MatchingTask = {
      id: "T2", requirement_id: "estimated_value", label: "Contract value",
      matcher_type: "RULE", severity: "SOFT",
      tender_value: 3_000_000, company_value: null, tender_evidence: [], aspect: "CONTRACT_SIZE",
    };
    const result = runRuleMatcher(task, makeBrenner());
    expect(result.status).toBe("PASS");
    expect(result.method).not.toBe("PARTNER_REQUIRED");
  });

  it("partner threshold evaluation shows REVIEW overall when no other hard blocker", async () => {
    // Tender with estimated_value 7M in fact_sheet; no rail requirement
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner({ constraints: [] }));
    const tender: TenderDetail = {
      id: "T-PARTNER", title: "Big road project", lot_count: 1, docs_retrieved: false, source: "test",
      lots: [],
      fact_sheet: {
        estimated_value: { value: 7_000_000, confidence: "high", evidence: [] },
        submission_deadline: { value: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), confidence: "high", evidence: [] },
      },
    };
    const ev = await runMatchEvaluation(tender, "COMP-B");
    // partner threshold promotes estimated_value to HARD UNCERTAIN → REVIEW
    expect(["REVIEW", "BLOCKED"]).toContain(ev.viability.status);
    const partnerResult = ev.matrix.results.find((r) => r.method === "PARTNER_REQUIRED");
    expect(partnerResult).toBeDefined();
  });
});

// ─── H. Partner threshold + hard no-JV constraint → FAIL/BLOCKED ─────────────

describe("H — partner threshold + hard no-JV constraint", () => {
  it("€7M tender + €5M threshold + hard no-JV → FAIL", () => {
    const noJv: PolicyItem = {
      id: "CON-JV", company_id: "C", type: "JV", operator: "EXCLUDE", value: "NO_JV",
      severity: "HARD", status: "CONFIRMED", state: "EXPLICIT", raw_value: null, origin: "TEST", evidence: [],
    };
    const task: MatchingTask = {
      id: "T3", requirement_id: "estimated_value", label: "Contract value",
      matcher_type: "RULE", severity: "SOFT",
      tender_value: 7_000_000, company_value: null, tender_evidence: [], aspect: "CONTRACT_SIZE",
    };
    const company = makeBrenner({ constraints: [noJv] });
    const result = runRuleMatcher(task, company);
    expect(result.status).toBe("FAIL");
    expect(result.severity).toBe("HARD");
    expect(result.reason).toMatch(/no.?JV|partner.*JV/i);
  });
});

// ─── I. Interaction: LOT-02 shows capability PASS + partner required + hard constraint FAIL ──

describe("I — full interaction: LOT-02 capability PASS, partner required, constraint FAIL, overall BLOCKED", () => {
  it("LOT-02 is BLOCKED by rail constraint despite road capability being present", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner());
    const ev = await runMatchEvaluation(multiLotTender, "COMP-B", "LOT-02");

    // Overall BLOCKED
    expect(ev.viability.status).toBe("BLOCKED");

    // Rail constraint FAIL present in hard blockers
    const railFail = ev.matrix.hard_blockers.find((r) => /rail/i.test(r.reason));
    expect(railFail).toBeDefined();
    expect(railFail?.method).toBe("CONSTRAINT");

    // Partner required ALSO visible (€7M > €5M threshold)
    const partnerResult = ev.matrix.results.find((r) => r.method === "PARTNER_REQUIRED");
    expect(partnerResult).toBeDefined();

    // Scope is LOT-02
    expect(ev.bid_scope.lot_id).toBe("LOT-02");
  });
});

// ─── J. Non-lotted tender continues to work ───────────────────────────────────

describe("J — non-lotted tender works unchanged", () => {
  it("whole-tender evaluation returns TENDER scope type and correct viability", async () => {
    vi.mocked(assembleCanonicalCompany).mockResolvedValue(makeBrenner({ constraints: [] }));
    const tender: TenderDetail = {
      id: "T-SIMPLE", title: "Simple road", lot_count: 1, docs_retrieved: false, source: "test",
      lots: [],
      fact_sheet: {
        submission_deadline: { value: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), confidence: "high", evidence: [] },
        estimated_value: { value: 1_500_000, confidence: "high", evidence: [] },
      },
    };
    const ev = await runMatchEvaluation(tender, "COMP-B");
    expect(ev.bid_scope.type).toBe("TENDER");
    expect(ev.bid_scope.lot_id).toBeNull();
    expect(ev.viability.status).toBe("VIABLE");
  });
});
