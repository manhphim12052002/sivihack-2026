import { describe, it, expect } from "vitest";
import {
  normalizeCapabilityType,
  normalizeQualificationType,
  computeFreshness,
} from "../normalize";

describe("normalizeCapabilityType", () => {
  it("maps Straßenbau → ROAD_CONSTRUCTION", () => {
    expect(normalizeCapabilityType("Straßenbau")).toBe("ROAD_CONSTRUCTION");
  });

  it("maps Straßenbauarbeiten → ROAD_CONSTRUCTION", () => {
    expect(normalizeCapabilityType("Straßenbauarbeiten")).toBe("ROAD_CONSTRUCTION");
  });

  it("is case-insensitive", () => {
    expect(normalizeCapabilityType("TIEFBAU")).toBe("CIVIL_ENGINEERING");
  });

  it("maps Erdarbeiten → EARTHWORKS", () => {
    expect(normalizeCapabilityType("Erdarbeiten")).toBe("EARTHWORKS");
  });

  it("maps Kanalbau → SEWER_CONSTRUCTION", () => {
    expect(normalizeCapabilityType("Kanalbau und Entwässerung")).toBe("SEWER_CONSTRUCTION");
  });

  it("maps Rohrleitungsbau → PIPELINE", () => {
    expect(normalizeCapabilityType("Rohrleitungsbau")).toBe("PIPELINE");
  });

  it("matches a term embedded in a sentence", () => {
    expect(normalizeCapabilityType("Referenzen aus Straßenbauarbeiten der letzten 5 Jahre")).toBe(
      "ROAD_CONSTRUCTION",
    );
  });

  it("returns OTHER for an unknown term", () => {
    expect(normalizeCapabilityType("Kühlungsmontage Klimaanlage")).toBe("OTHER");
  });
});

describe("normalizeQualificationType", () => {
  it("maps PQ-VOB → PQ_VOB", () => {
    expect(normalizeQualificationType("PQ-VOB")).toBe("PQ_VOB");
  });

  it("maps 'Präqualifikation' → PQ_VOB", () => {
    expect(normalizeQualificationType("Präqualifikation nach VOB")).toBe("PQ_VOB");
  });

  it("maps ISO 9001 → ISO_9001", () => {
    expect(normalizeQualificationType("ISO 9001:2015")).toBe("ISO_9001");
  });

  it("maps ISO 14001 → ISO_14001", () => {
    expect(normalizeQualificationType("ISO 14001 Umweltmanagement")).toBe("ISO_14001");
  });

  it("maps Haftpflichtversicherung → INSURANCE", () => {
    expect(normalizeQualificationType("Haftpflichtversicherung")).toBe("INSURANCE");
  });

  it("returns OTHER for an unrecognised qualification", () => {
    expect(normalizeQualificationType("Speziallizenz unbekannt")).toBe("OTHER");
  });
});

describe("computeFreshness", () => {
  const ref = new Date("2026-09-17");

  it("returns CURRENT when valid_until is null", () => {
    expect(computeFreshness(null, ref)).toBe("CURRENT");
  });

  it("returns EXPIRED when past the expiry date", () => {
    expect(computeFreshness("2026-01-01", ref)).toBe("EXPIRED");
  });

  it("returns EXPIRING when within 90 days", () => {
    expect(computeFreshness("2026-11-01", ref)).toBe("EXPIRING");
  });

  it("returns CURRENT when more than 90 days away", () => {
    expect(computeFreshness("2027-06-01", ref)).toBe("CURRENT");
  });
});
