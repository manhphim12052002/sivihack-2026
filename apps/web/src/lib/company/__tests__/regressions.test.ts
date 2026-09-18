import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/llm", () => ({ llmClient: null, SEMANTIC_MATCH_PROMPT: "" }));
import { parseIntelligence, safeDate } from "../parse";
import {
  emptyCompany,
  mergeCompany,
  toCompanyProfile,
  importLegacy,
} from "../model";
import { applyReview } from "../review";
import { normalizeQualificationType } from "../normalize";
import { runOntologyMatcher } from "@/lib/match/ontology-matcher";
import { runReferenceMatcher } from "@/lib/match/reference-matcher";
import { MOCK_COMPANIES } from "@/lib/mock/companies";
import type { ChunkRow } from "../types";
import type { MatchingTask } from "@/lib/match/types";
const chunk = (text: string): ChunkRow => ({
  id: "CH-1",
  source_id: "SRC-1",
  page: null,
  section: null,
  paragraph: 1,
  cell_range: null,
  text,
  created_at: "",
});
const parse = (data: unknown, text: string) =>
  parseIntelligence(JSON.stringify(data), "COMP-1", [chunk(text)]);
const task = (id: string, value: unknown): MatchingTask => ({
  id: "TASK-1",
  requirement_id: id,
  label: id,
  matcher_type: "ONTOLOGY",
  severity: "HARD",
  tender_value: value,
  company_value: null,
  tender_evidence: [],
  aspect: "QUALIFICATIONS",
});
describe("Company safety regressions", () => {
  it("month-only March cannot become 2023-03-01 or any inferred year", () => {
    const c = parse(
      {
        capacity: [
          {
            type: "CREW_AVAILABILITY",
            label: "Crew availability",
            available_from: "2023-03-01",
            raw_value: "March",
            state: "NORMALIZED",
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "Free from March — two crews are committed until then.",
    );
    expect(c.capacity?.[0]).toMatchObject({
      available_from: null,
      raw_value: "March",
      state: "AMBIGUOUS",
    });
    expect(toCompanyProfile(c).earliest_start).toBeNull();
  });
  it("only accepts dates actually present with a year and day", () => {
    expect(safeDate("2026-03-01", "March 2026")).toBeNull();
    expect(safeDate("2026-02-30", "2026-02-30")).toBeNull();
    expect(safeDate("2026-03-01", "From 2026-03-01")).toBe("2026-03-01");
  });
  it("missing DB qualification is not a negative claim and matching is UNCERTAIN", () => {
    const c = parse({ qualifications: [] }, "Road construction company");
    expect(c.qualifications).toEqual([]);
    expect(
      runOntologyMatcher(task("eligibility_proofs", "DB qualification"), c)
        .status,
    ).toBe("UNCERTAIN");
  });
  it("explicit confirmed no DB qualification produces FAIL, pending remains UNCERTAIN", () => {
    const c = parse(
      {
        qualifications: [
          {
            label: "DB qualification",
            knowledge_state: "KNOWN_ABSENT",
            raw_value: "No DB qualification",
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "No DB qualification",
    );
    expect(c.qualifications[0].knowledge_state).toBe("KNOWN_ABSENT");
    expect(
      runOntologyMatcher(task("eligibility_proofs", "DB qualification"), c)
        .status,
    ).toBe("UNCERTAIN");
    c.qualifications[0].status = "CONFIRMED";
    expect(
      runOntologyMatcher(task("eligibility_proofs", "DB qualification"), c)
        .status,
    ).toBe("FAIL");
  });
  it("rejects unsupported negative qualifications", () => {
    expect(() =>
      parse(
        {
          qualifications: [
            {
              label: "DB qualification",
              knowledge_state: "KNOWN_ABSENT",
              chunk_ids: ["CH-1"],
            },
          ],
        },
        "Road construction",
      ),
    ).toThrow("Unsupported negative");
  });
  it("no estimator capacity default, and committed crews are not bids/week", () => {
    expect(
      toCompanyProfile(emptyCompany("C", "Test")).capacity_per_week,
    ).toBeNull();
    const c = parse(
      {
        capacity: [
          {
            type: "ESTIMATOR_CAPACITY",
            label: "Bids",
            value: 2,
            unit: "BIDS_PER_WEEK",
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "Two crews are committed",
    );
    expect(c.capacity).toEqual([]);
  });
  it("explicit estimating capacity with a word number is retained", () => {
    const c = parse(
      {
        capacity: [
          {
            type: "ESTIMATOR_CAPACITY",
            label: "Estimating",
            value: 3,
            unit: "BIDS_PER_WEEK",
            raw_value: "three tenders a week",
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "We can pursue three tenders a week.",
    );
    expect(c.capacity?.[0].value).toBe(3);
  });
  it("€2.9M reference is structured and unknown completion stays null", () => {
    const c = parse(
      {
        references: [
          {
            name: "State road rehabilitation",
            contract_value_eur: 2900000,
            completed_at: null,
            project_types: ["ROAD_REHABILITATION"],
            capabilities: ["road construction"],
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "€2.9M state road rehabilitation",
    );
    expect(c.references[0]).toMatchObject({
      name: "State road rehabilitation",
      contract_value_eur: 2900000,
      completed_at: null,
      capabilities: ["ROAD_CONSTRUCTION"],
    });
  });
  it("fabricated numeric values are not accepted", () => {
    const c = parse(
      {
        references: [
          {
            name: "Road rehabilitation",
            contract_value_eur: 2900000,
            chunk_ids: ["CH-1"],
          },
        ],
      },
      "Road rehabilitation project",
    );
    expect(c.references[0].contract_value_eur).toBeNull();
  });
  it("DB-specific ontology wins over generic qualification", () => {
    for (const s of [
      "DB-Präqualifikation",
      "DB qualification",
      "DB_PREQUALIFICATION",
    ])
      expect(normalizeQualificationType(s)).toBe("DB_PREQUALIFICATION");
    expect(normalizeQualificationType("Präqualifikation")).toBe("PQ_VOB");
  });
  it("deduplicates German/English capabilities with merged evidence and stable review", () => {
    const a = parse(
      { capabilities: [{ label: "Straßenbau", chunk_ids: ["CH-1"] }] },
      "Straßenbau",
    );
    a.capabilities[0].status = "CONFIRMED";
    const b = parseIntelligence(
      JSON.stringify({
        capabilities: [{ label: "road construction", chunk_ids: ["CH-2"] }],
      }),
      "COMP-1",
      [{ ...chunk("road construction"), id: "CH-2" }],
    );
    const c = mergeCompany(a, b);
    expect(c.capabilities).toHaveLength(1);
    expect(c.capabilities[0].evidence).toEqual(["CH-1", "CH-2"]);
    expect(c.capabilities[0].status).toBe("CONFIRMED");
    expect(mergeCompany(c, b).capabilities).toHaveLength(1);
  });
  it("keeps reviewed corrections on re-extraction", () => {
    const old = emptyCompany("C", "Test");
    const draft = structuredClone(old);
    draft.identity.employees = 140;
    const reviewed = applyReview(old, draft);
    const extraction = parse(
      {
        facts: [
          { field: "identity.employees", value: 100, chunk_ids: ["CH-1"] },
        ],
      },
      "100 employees",
    );
    expect(mergeCompany(reviewed, extraction).identity.employees).toBe(140);
  });
  it("rejects malformed arrays and foreign evidence ids", () => {
    expect(() => parse({ references: {} }, "text")).toThrow();
    expect(() =>
      parse(
        {
          capabilities: [{ label: "road construction", chunk_ids: ["OTHER"] }],
        },
        "text",
      ),
    ).toThrow();
    expect(() => parse({}, "text")).toThrow();
  });
  it("keeps all original sample companies and removes unsupported availability/capacity", () => {
    expect(MOCK_COMPANIES.map((c) => c.name)).toEqual([
      "Brenner & Sohn Tiefbau GmbH",
      "Elektro Vogtland GmbH",
      "Hanseatische Bau AG",
      "Metallbau Westfalen GmbH",
      "Alu-Fenster Sauerland GmbH",
      "Türen & Tore Rheinland GmbH",
      "Schlosserei Hellweg e.K.",
    ]);
    for (const p of MOCK_COMPANIES) {
      const c = importLegacy(p);
      expect(c.capabilities.length).toBeGreaterThan(0);
      expect(c.references.length).toBeGreaterThan(0);
      expect(c.identity.name).toBe(p.name);
    }
    expect(MOCK_COMPANIES[0].earliest_start).toBeNull();
    expect(MOCK_COMPANIES[0].capacity_per_week).toBeNull();
    expect(MOCK_COMPANIES[1].capacity_per_week).toBeNull();
  });
  it("three references with unknown required completion dates cannot PASS", async () => {
    const c = parse(
      {
        references: [1, 2, 3].map((i) => ({
          name: `Project ${i}`,
          chunk_ids: ["CH-1"],
        })),
      },
      "Three road projects",
    );
    c.references.forEach((r) => (r.status = "CONFIRMED"));
    expect(
      (
        await runReferenceMatcher(
          task("references_required", { minimum_count: 3, lookback_years: 5 }),
          c,
        )
      ).status,
    ).toBe("UNCERTAIN");
  });
  it("unknown required reference value cannot PASS", async () => {
    const c = parse(
      { references: [{ name: "Road project", chunk_ids: ["CH-1"] }] },
      "Road project",
    );
    c.references[0].status = "CONFIRMED";
    expect(
      (
        await runReferenceMatcher(
          task("references_required", {
            minimum_count: 1,
            min_value_eur: 2000000,
          }),
          c,
        )
      ).status,
    ).toBe("UNCERTAIN");
  });
  it("confirmed reference with explicit date/value can satisfy numeric requirements", async () => {
    const date = new Date().toISOString().slice(0, 10);
    const c = parse(
      {
        references: [
          {
            name: "Road project",
            completed_at: date,
            contract_value_eur: 2900000,
            chunk_ids: ["CH-1"],
          },
        ],
      },
      `€2.9M road project completed ${date}`,
    );
    c.references[0].status = "CONFIRMED";
    expect(
      (
        await runReferenceMatcher(
          task("references_required", {
            minimum_count: 1,
            min_value_eur: 2000000,
            lookback_years: 5,
          }),
          c,
        )
      ).status,
    ).toBe("PASS");
  });
});
