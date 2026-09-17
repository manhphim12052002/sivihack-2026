import { describe, it, expect } from "vitest";
import { parseExtractionResult, ExtractionParseError } from "../extract";

const validResult = JSON.stringify({
  capabilities: [
    { type: "ROAD_CONSTRUCTION", label: "Straßenbau", chunk_ids: ["CCHUNK-001"] },
  ],
  references: [
    {
      name: "B17 Rehabilitation",
      client: "State of Bavaria",
      project_types: ["ROAD_REHABILITATION"],
      location: "Bavaria",
      contract_value_eur: 2800000,
      completed_at: "2024-06-12",
      capabilities: ["EARTHWORKS"],
      chunk_ids: ["CCHUNK-002"],
    },
  ],
  qualifications: [
    { type: "PQ_VOB", label: "PQ-VOB", valid_from: null, valid_until: null, chunk_ids: ["CCHUNK-003"] },
  ],
});

describe("parseExtractionResult", () => {
  it("parses a valid extraction result", () => {
    const result = parseExtractionResult(validResult);
    expect(result.capabilities).toHaveLength(1);
    expect(result.references).toHaveLength(1);
    expect(result.qualifications).toHaveLength(1);
    expect(result.capabilities[0]?.label).toBe("Straßenbau");
    expect(result.references[0]?.name).toBe("B17 Rehabilitation");
  });

  it("throws ExtractionParseError on invalid JSON", () => {
    expect(() => parseExtractionResult("not json")).toThrow(ExtractionParseError);
  });

  it("throws ExtractionParseError when result is not an object", () => {
    expect(() => parseExtractionResult('"just a string"')).toThrow(ExtractionParseError);
  });

  it("drops capabilities with no chunk_ids", () => {
    const json = JSON.stringify({
      capabilities: [
        { type: "ROAD_CONSTRUCTION", label: "Straßenbau", chunk_ids: [] },
        { type: "CIVIL_ENGINEERING", label: "Tiefbau", chunk_ids: ["CCHUNK-001"] },
      ],
      references: [],
      qualifications: [],
    });
    const result = parseExtractionResult(json);
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0]?.label).toBe("Tiefbau");
  });

  it("drops references with no chunk_ids", () => {
    const json = JSON.stringify({
      capabilities: [],
      references: [
        { name: "Valid Ref", chunk_ids: ["CCHUNK-001"] },
        { name: "No evidence ref", chunk_ids: [] },
      ],
      qualifications: [],
    });
    const result = parseExtractionResult(json);
    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.name).toBe("Valid Ref");
  });

  it("handles an empty extraction result without crashing", () => {
    const json = JSON.stringify({ capabilities: [], references: [], qualifications: [] });
    const result = parseExtractionResult(json);
    expect(result.capabilities).toHaveLength(0);
    expect(result.references).toHaveLength(0);
    expect(result.qualifications).toHaveLength(0);
  });

  it("handles missing top-level arrays gracefully", () => {
    const result = parseExtractionResult("{}");
    expect(result.capabilities).toHaveLength(0);
    expect(result.references).toHaveLength(0);
    expect(result.qualifications).toHaveLength(0);
  });
});
