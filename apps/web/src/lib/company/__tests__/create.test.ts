import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// LLM client is null in tests (no API key set)
vi.mock("@/lib/llm", () => ({
  llmClient: null,
  PROFILE_SYSTEM_PROMPT: "",
  EXTRACTION_SYSTEM_PROMPT: "",
}));

import { supabase } from "@/lib/supabase";
import { createCompany, rowToProfile } from "../create";

function mockInsert(returnedRow: Record<string, unknown>) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnedRow, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCompany", () => {
  it("inserts a row with status ONBOARDING", async () => {
    const row = {
      id: "COMP-TESTID01",
      name: "Brenner & Sohn",
      headquarters: "Augsburg",
      home_base: "Augsburg",
      status: "ONBOARDING",
      regions: null,
      radius_km: null,
      trades: null,
      cpv_prefixes: null,
      contract_min_eur: null,
      contract_max_eur: null,
      partner_threshold_eur: null,
      guarantee_capacity_eur: null,
      self_perform_share_pct: null,
      earliest_start: null,
      capacity_per_week: 3,
      references_held: null,
      hard_exclusions: null,
      raw_text: "",
      created_at: "2026-09-17T00:00:00Z",
      updated_at: "2026-09-17T00:00:00Z",
    };
    vi.mocked(supabase.from).mockReturnValue(mockInsert(row) as unknown as ReturnType<typeof supabase.from>);

    const profile = await createCompany({ name: "Brenner & Sohn", headquarters: "Augsburg" });
    expect(profile.id).toMatch(/^COMP-/);
    expect(profile.name).toBe("Brenner & Sohn");
    expect(profile.capacity_per_week).toBe(3);
  });

  it("passes raw_text to the insert when provided", async () => {
    const row = {
      id: "COMP-XYZ",
      name: "Test GmbH",
      headquarters: "",
      home_base: "",
      status: "ONBOARDING",
      raw_text: "some text",
      regions: null,
      radius_km: null,
      trades: null,
      cpv_prefixes: null,
      contract_min_eur: null,
      contract_max_eur: null,
      partner_threshold_eur: null,
      guarantee_capacity_eur: null,
      self_perform_share_pct: null,
      earliest_start: null,
      capacity_per_week: 3,
      references_held: null,
      hard_exclusions: null,
      created_at: "2026-09-17T00:00:00Z",
      updated_at: "2026-09-17T00:00:00Z",
    };
    const insertMock = mockInsert(row);
    vi.mocked(supabase.from).mockReturnValue(insertMock as unknown as ReturnType<typeof supabase.from>);

    await createCompany({ name: "Test GmbH", raw_text: "some text" });
    expect(insertMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ raw_text: "some text" }),
    );
  });
});

describe("rowToProfile", () => {
  it("defaults null JSON arrays to empty arrays", () => {
    const row = {
      id: "COMP-001",
      name: "Test",
      home_base: "",
      regions: null,
      radius_km: null,
      trades: null,
      cpv_prefixes: null,
      contract_min_eur: null,
      contract_max_eur: null,
      partner_threshold_eur: null,
      guarantee_capacity_eur: null,
      self_perform_share_pct: null,
      earliest_start: null,
      capacity_per_week: 3,
      references_held: null,
      hard_exclusions: null,
      raw_text: "",
    };
    const profile = rowToProfile(row);
    expect(profile.regions).toEqual([]);
    expect(profile.trades).toEqual([]);
    expect(profile.hard_exclusions).toEqual([]);
  });
});
