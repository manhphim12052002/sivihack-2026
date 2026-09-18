import { describe, it, expect } from "vitest";
import { runOntologyMatcher } from "../ontology-matcher";
import type { MatchingTask, CanonicalCompany } from "../types";
import type { CapabilityRow, QualificationRow, ItemStatus, Freshness } from "@/lib/company/types";

function makeTask(overrides: Partial<MatchingTask> = {}): MatchingTask {
  return {
    id: "TASK-001",
    requirement_id: "trade_scope",
    label: "Trade scope",
    matcher_type: "ONTOLOGY",
    severity: "HARD",
    tender_value: "Straßenbau",
    company_value: null,
    tender_evidence: ["LV.pdf"],
    aspect: "SCOPE_CAPABILITY",
    ...overrides,
  };
}

const confirmedCap: CapabilityRow & { status: ItemStatus } = {
  id: "CAP-001",
  company_id: "COMP-001",
  type: "ROAD_CONSTRUCTION",
  label: "Straßenbau",
  origin: "DOCUMENT_EXTRACTED",
  status: "CONFIRMED" as ItemStatus,
  evidence: [],
  created_at: "2026-09-17T00:00:00Z",
};

const confirmedQual: QualificationRow & { freshness: Freshness } = {
  id: "QUAL-001",
  company_id: "COMP-001",
  type: "PQ_VOB",
  label: "PQ-VOB",
  knowledge_state: "KNOWN_PRESENT",
  status: "CONFIRMED" as ItemStatus,
  valid_from: null,
  valid_until: null,
  freshness: "CURRENT" as Freshness,
  origin: "DOCUMENT_EXTRACTED",
  evidence: [],
  created_at: "2026-09-17T00:00:00Z",
};

const baseCompany: CanonicalCompany = {
  company_id: "COMP-001",
  identity: { name: "Brenner GmbH", headquarters: "Augsburg", employees: null, revenue_eur: null, website: null },
  capabilities: [confirmedCap],
  references: [],
  qualifications: [confirmedQual],
  commercial_profile: { contract_min_eur: null, contract_max_eur: null, guarantee_capacity_eur: null, self_perform_share_pct: null },
  regions: ["Bavaria"],
  radius_km: null,
  sources: [],
  knowledge_gaps: [],
};

describe("runOntologyMatcher — trade_scope", () => {
  it("PASS when company has matching confirmed capability", () => {
    const result = runOntologyMatcher(makeTask({ tender_value: "Straßenbau" }), baseCompany);
    expect(result.status).toBe("PASS");
    expect(result.company_evidence).toContain("CAP-001");
  });

  it("UNCERTAIN when company has no evidence of a matching capability", () => {
    const result = runOntologyMatcher(makeTask({ tender_value: "Gleisbau" }), baseCompany);
    expect(result.status).toBe("UNCERTAIN");
    expect(result.reason).toMatch(/do not match/i);
  });

  it("UNCERTAIN when company has no confirmed capabilities", () => {
    const co = { ...baseCompany, capabilities: [] };
    const result = runOntologyMatcher(makeTask(), co);
    expect(result.status).toBe("UNCERTAIN");
    expect(result.reason).toMatch(/no confirmed/i);
  });

  it("UNCERTAIN when tender trade scope is not parseable", () => {
    const result = runOntologyMatcher(makeTask({ tender_value: [] }), baseCompany);
    expect(result.status).toBe("UNCERTAIN");
  });
});

describe("runOntologyMatcher — eligibility_proofs", () => {
  it("PASS when required qualification is confirmed and current", () => {
    const result = runOntologyMatcher(
      makeTask({ requirement_id: "eligibility_proofs", tender_value: "PQ-VOB", aspect: "QUALIFICATIONS" }),
      baseCompany,
    );
    expect(result.status).toBe("PASS");
  });

  it("FAIL when required qualification is expired", () => {
    const expired = { ...confirmedQual, valid_until: "2020-01-01", freshness: "EXPIRED" as Freshness };
    const co = { ...baseCompany, qualifications: [expired] };
    const result = runOntologyMatcher(
      makeTask({ requirement_id: "eligibility_proofs", tender_value: "PQ-VOB", aspect: "QUALIFICATIONS" }),
      co,
    );
    expect(result.status).toBe("FAIL");
    expect(result.reason).toMatch(/expired/i);
  });

  it("UNCERTAIN when required qualification is pending (not confirmed)", () => {
    const pending = { ...confirmedQual, status: "PENDING" as ItemStatus };
    const co = { ...baseCompany, qualifications: [pending] };
    const result = runOntologyMatcher(
      makeTask({ requirement_id: "eligibility_proofs", tender_value: "PQ-VOB", aspect: "QUALIFICATIONS" }),
      co,
    );
    expect(result.status).toBe("UNCERTAIN");
  });

  it("UNCERTAIN when required qualification is unmentioned", () => {
    const co = { ...baseCompany, qualifications: [] };
    const result = runOntologyMatcher(
      makeTask({ requirement_id: "eligibility_proofs", tender_value: "ISO 9001", aspect: "QUALIFICATIONS" }),
      co,
    );
    expect(result.status).toBe("UNCERTAIN");
  });
});
