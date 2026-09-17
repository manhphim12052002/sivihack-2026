import { describe, it, expect } from "vitest";
import { runRuleMatcher } from "../rule-matcher";
import type { MatchingTask, CanonicalCompany } from "../types";

function makeTask(overrides: Partial<MatchingTask>): MatchingTask {
  return {
    id: "TASK-001",
    requirement_id: "estimated_value",
    label: "Contract value",
    matcher_type: "RULE",
    severity: "SOFT",
    tender_value: null,
    company_value: null,
    tender_evidence: [],
    aspect: "CONTRACT_SIZE",
    ...overrides,
  };
}

const baseCompany: CanonicalCompany = {
  company_id: "COMP-001",
  identity: { name: "Brenner GmbH", headquarters: "Augsburg", employees: 140, revenue_eur: 31_000_000, website: null },
  capabilities: [],
  references: [],
  qualifications: [],
  commercial_profile: {
    contract_min_eur: 400_000,
    contract_max_eur: 5_000_000,
    guarantee_capacity_eur: 1_500_000,
    self_perform_share_pct: 70,
  },
  regions: ["Bavaria", "Baden-Württemberg"],
  radius_km: 150,
  sources: [],
  knowledge_gaps: [],
};

describe("runRuleMatcher — estimated_value", () => {
  it("PASS when tender value is within company range", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "estimated_value", tender_value: 2_800_000 }), baseCompany);
    expect(result.status).toBe("PASS");
    expect(result.method).toBe("DETERMINISTIC");
  });

  it("FAIL when tender value exceeds company max", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "estimated_value", tender_value: 8_000_000 }), baseCompany);
    expect(result.status).toBe("FAIL");
    expect(result.reason).toMatch(/exceeds/i);
  });

  it("FAIL when tender value is below company min", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "estimated_value", tender_value: 100_000 }), baseCompany);
    expect(result.status).toBe("FAIL");
    expect(result.reason).toMatch(/below/i);
  });

  it("UNCERTAIN when tender value is null", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "estimated_value", tender_value: null }), baseCompany);
    expect(result.status).toBe("UNCERTAIN");
  });

  it("UNCERTAIN when company limits are not set", () => {
    const co = { ...baseCompany, commercial_profile: { ...baseCompany.commercial_profile, contract_min_eur: null, contract_max_eur: null } };
    const result = runRuleMatcher(makeTask({ requirement_id: "estimated_value", tender_value: 2_000_000 }), co);
    expect(result.status).toBe("UNCERTAIN");
  });
});

describe("runRuleMatcher — guarantees", () => {
  it("PASS when guarantee required is within capacity", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "guarantees", severity: "HARD", aspect: "FINANCIAL_GUARANTEES", tender_value: 500_000 }), baseCompany);
    expect(result.status).toBe("PASS");
  });

  it("FAIL when guarantee required exceeds capacity", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "guarantees", severity: "HARD", aspect: "FINANCIAL_GUARANTEES", tender_value: 3_000_000 }), baseCompany);
    expect(result.status).toBe("FAIL");
  });

  it("UNCERTAIN when company capacity not on file", () => {
    const co = { ...baseCompany, commercial_profile: { ...baseCompany.commercial_profile, guarantee_capacity_eur: null } };
    const result = runRuleMatcher(makeTask({ requirement_id: "guarantees", severity: "HARD", aspect: "FINANCIAL_GUARANTEES", tender_value: 500_000 }), co);
    expect(result.status).toBe("UNCERTAIN");
  });
});

describe("runRuleMatcher — self_performance_min_pct", () => {
  it("PASS when company share meets requirement", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "self_performance_min_pct", severity: "HARD", aspect: "SCOPE_CAPABILITY", tender_value: 60 }), baseCompany);
    expect(result.status).toBe("PASS");
  });

  it("FAIL when company share is below requirement", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "self_performance_min_pct", severity: "HARD", aspect: "SCOPE_CAPABILITY", tender_value: 80 }), baseCompany);
    expect(result.status).toBe("FAIL");
  });
});

describe("runRuleMatcher — place_of_performance", () => {
  it("PASS when tender place matches a company region", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "place_of_performance", severity: "HARD", aspect: "GEOGRAPHY", tender_value: "Bavaria" }), baseCompany);
    expect(result.status).toBe("PASS");
  });

  it("FAIL when tender place is outside all regions and no radius", () => {
    const co = { ...baseCompany, radius_km: null };
    const result = runRuleMatcher(makeTask({ requirement_id: "place_of_performance", severity: "HARD", aspect: "GEOGRAPHY", tender_value: "Hamburg" }), co);
    expect(result.status).toBe("FAIL");
  });

  it("UNCERTAIN when tender place is outside regions but company has a radius on file", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "place_of_performance", severity: "HARD", aspect: "GEOGRAPHY", tender_value: "Hamburg" }), baseCompany);
    expect(result.status).toBe("UNCERTAIN");
  });
});

describe("runRuleMatcher — submission_deadline", () => {
  it("PASS for a future deadline", () => {
    const future = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const result = runRuleMatcher(makeTask({ requirement_id: "submission_deadline", severity: "HARD", aspect: "TIMING_CAPACITY", tender_value: future }), baseCompany);
    expect(result.status).toBe("PASS");
  });

  it("FAIL for a past deadline", () => {
    const result = runRuleMatcher(makeTask({ requirement_id: "submission_deadline", severity: "HARD", aspect: "TIMING_CAPACITY", tender_value: "2020-01-01" }), baseCompany);
    expect(result.status).toBe("FAIL");
  });
});

describe("runRuleMatcher — reason always populated", () => {
  it("reason is a non-empty string in all cases", () => {
    const reqs = ["estimated_value", "guarantees", "self_performance_min_pct", "place_of_performance", "submission_deadline", "consortium_allowed", "lots"] as const;
    for (const req of reqs) {
      const result = runRuleMatcher(makeTask({ requirement_id: req, severity: "HARD", aspect: "CONTRACT_SIZE", tender_value: null }), baseCompany);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
