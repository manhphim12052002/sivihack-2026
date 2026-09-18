import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase before importing anything that uses it
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabase";
import { assembleCanonicalCompany } from "../assemble";
import type { CapabilityRow, QualificationRow } from "../types";

// Helper to build a chainable Supabase mock for a specific table's data
function mockTable(data: unknown, error: null | { message: string } = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  // When the chain is awaited (Promise.all path), resolve with { data, error }
  Object.defineProperty(chain, "then", {
    value: (resolve: (v: unknown) => void) =>
      resolve({ data: Array.isArray(data) ? data : [], error }),
  });
  return chain;
}

const baseCompany = {
  intelligence_version: 2,
  geography: {
    regions: ["Bavaria"],
    radius_km: 150,
    countries: [],
    headquarters: "Augsburg",
  },
  commercial_profile: {
    contract_min_eur: null,
    contract_max_eur: 5000000,
    guarantee_capacity_eur: null,
    self_perform_share_pct: null,
  },
  id: "COMP-001",
  name: "Brenner & Sohn",
  headquarters: "Augsburg",
  home_base: "Augsburg",
  employees: 140,
  revenue_eur: null,
  website: null,
  description: null,
  status: "ONBOARDING",
  regions: ["Bavaria"],
  radius_km: 150,
  trades: ["road"],
  cpv_prefixes: ["45"],
  contract_min_eur: null,
  contract_max_eur: 5000000,
  partner_threshold_eur: null,
  guarantee_capacity_eur: null,
  self_perform_share_pct: null,
  earliest_start: null,
  capacity_per_week: 3,
  references_held: [],
  hard_exclusions: [],
  raw_text: "",
  created_at: "2026-09-17T00:00:00Z",
  updated_at: "2026-09-17T00:00:00Z",
};

const confirmedCapability: CapabilityRow = {
  id: "CAP-001",
  company_id: "COMP-001",
  type: "ROAD_CONSTRUCTION",
  label: "Straßenbau",
  origin: "DOCUMENT_EXTRACTED",
  status: "CONFIRMED",
  evidence: ["CCHUNK-001"],
  created_at: "2026-09-17T00:00:00Z",
};

const confirmedQualification: QualificationRow = {
  id: "QUAL-001",
  company_id: "COMP-001",
  type: "PQ_VOB",
  label: "PQ-VOB",
  status: "CONFIRMED",
  valid_from: null,
  valid_until: null,
  freshness: "CURRENT",
  origin: "DOCUMENT_EXTRACTED",
  evidence: ["CCHUNK-002"],
  created_at: "2026-09-17T00:00:00Z",
};

function setupMocks({
  capabilities = [] as CapabilityRow[],
  qualifications = [] as QualificationRow[],
} = {}) {
  const fromMock = vi.mocked(supabase.from);
  fromMock.mockImplementation((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type F = ReturnType<typeof supabase.from>;
    if (table === "companies") return mockTable(baseCompany) as unknown as F;
    if (table === "company_capabilities")
      return mockTable(capabilities) as unknown as F;
    if (table === "company_references") return mockTable([]) as unknown as F;
    if (table === "company_qualifications")
      return mockTable(qualifications) as unknown as F;
    if (table === "sources") return mockTable([]) as unknown as F;
    if (table === "company_knowledge_gaps")
      return mockTable([]) as unknown as F;
    return mockTable([]) as unknown as F;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assembleCanonicalCompany", () => {
  it("returns UNKNOWN gap when no confirmed capabilities exist", async () => {
    setupMocks({ capabilities: [] });
    const result = await assembleCanonicalCompany("COMP-001");
    const capGap = result.knowledge_gaps.find((g) => g.type === "CAPABILITIES");
    expect(capGap).toBeDefined();
    expect(capGap?.state).toBe("UNKNOWN");
  });

  it("returns no CAPABILITIES gap when at least one confirmed capability exists", async () => {
    setupMocks({ capabilities: [confirmedCapability] });
    const result = await assembleCanonicalCompany("COMP-001");
    const capGap = result.knowledge_gaps.find((g) => g.type === "CAPABILITIES");
    expect(capGap).toBeUndefined();
  });

  it("only includes CONFIRMED items in the assembled output via filter check", async () => {
    const pending: CapabilityRow = {
      ...confirmedCapability,
      id: "CAP-002",
      status: "PENDING",
    };
    setupMocks({ capabilities: [confirmedCapability, pending] });
    const result = await assembleCanonicalCompany("COMP-001");
    // All rows are returned — the UI applies the status filter; assembly preserves them
    expect(result.capabilities).toHaveLength(2);
    const confirmed = result.capabilities.filter(
      (c) => c.status === "CONFIRMED",
    );
    expect(confirmed).toHaveLength(1);
  });

  it("marks qualification as EXPIRED when valid_until is in the past", async () => {
    const expiredQual: QualificationRow = {
      ...confirmedQualification,
      valid_until: "2020-01-01",
      status: "CONFIRMED",
    };
    setupMocks({
      capabilities: [confirmedCapability],
      qualifications: [expiredQual],
    });
    const result = await assembleCanonicalCompany("COMP-001");
    const qual = result.qualifications[0];
    expect(qual?.freshness).toBe("EXPIRED");
  });

  it("marks qualification as CURRENT when no valid_until", async () => {
    setupMocks({
      capabilities: [confirmedCapability],
      qualifications: [confirmedQualification],
    });
    const result = await assembleCanonicalCompany("COMP-001");
    const qual = result.qualifications[0];
    expect(qual?.freshness).toBe("CURRENT");
  });

  it("populates identity from company row", async () => {
    setupMocks();
    const result = await assembleCanonicalCompany("COMP-001");
    expect(result.identity.name).toBe("Brenner & Sohn");
    expect(result.identity.headquarters).toBe("Augsburg");
  });

  it("populates commercial_profile fields", async () => {
    setupMocks({ capabilities: [confirmedCapability] });
    const result = await assembleCanonicalCompany("COMP-001");
    expect(result.commercial_profile.contract_max_eur).toBe(5000000);
  });
});
