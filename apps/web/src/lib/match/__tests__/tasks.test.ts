import { describe, it, expect } from "vitest";
import { generateTasks } from "../tasks";
import type { TenderFactSheet } from "../types";

const presentFact = { value: "something", confidence: "high" as const, evidence: [{ doc: "Eignung.pdf", quote_de: "Test" }] };
const absentFact  = { value: null, confidence: "not_found" as const, evidence: [] };

describe("generateTasks", () => {
  it("returns empty when factSheet is null", () => {
    const { tasks, skipped_gaps } = generateTasks(null, () => null);
    expect(tasks).toHaveLength(0);
    expect(skipped_gaps).toHaveLength(0);
  });

  it("generates a task for each present fact field", () => {
    const sheet: TenderFactSheet = {
      trade_scope: presentFact,
      place_of_performance: presentFact,
    };
    const { tasks } = generateTasks(sheet, () => null);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].requirement_id).toBe("trade_scope");
    expect(tasks[1].requirement_id).toBe("place_of_performance");
  });

  it("skips absent HARD facts and records a knowledge gap", () => {
    const sheet: TenderFactSheet = {
      trade_scope: absentFact,        // HARD
      estimated_value: presentFact,   // SOFT
    };
    const { tasks, skipped_gaps } = generateTasks(sheet, () => null);
    const taskIds = tasks.map((t) => t.requirement_id);
    expect(taskIds).not.toContain("trade_scope");
    expect(taskIds).toContain("estimated_value");
    expect(skipped_gaps).toHaveLength(1);
    expect(skipped_gaps[0].concept).toBe("TRADE_SCOPE");
    expect(skipped_gaps[0].importance).toBe("HARD");
  });

  it("skips absent SOFT facts without recording a gap", () => {
    const sheet: TenderFactSheet = { estimated_value: absentFact };
    const { tasks, skipped_gaps } = generateTasks(sheet, () => null);
    expect(tasks).toHaveLength(0);
    expect(skipped_gaps).toHaveLength(0);
  });

  it("assigns correct matcher type per requirement", () => {
    const sheet: TenderFactSheet = {
      trade_scope:         presentFact,
      place_of_performance: presentFact,
      references_required: presentFact,
      special_qualifications: presentFact,
    };
    const { tasks } = generateTasks(sheet, () => null);
    const byId = Object.fromEntries(tasks.map((t) => [t.requirement_id, t]));
    expect(byId["trade_scope"].matcher_type).toBe("ONTOLOGY");
    expect(byId["place_of_performance"].matcher_type).toBe("RULE");
    expect(byId["references_required"].matcher_type).toBe("REFERENCE");
    expect(byId["special_qualifications"].matcher_type).toBe("SEMANTIC");
  });

  it("assigns correct aspect per requirement", () => {
    const sheet: TenderFactSheet = {
      trade_scope:       presentFact,
      guarantees:        presentFact,
      references_required: presentFact,
    };
    const { tasks } = generateTasks(sheet, () => null);
    const byId = Object.fromEntries(tasks.map((t) => [t.requirement_id, t]));
    expect(byId["trade_scope"].aspect).toBe("SCOPE_CAPABILITY");
    expect(byId["guarantees"].aspect).toBe("FINANCIAL_GUARANTEES");
    expect(byId["references_required"].aspect).toBe("REFERENCES");
  });

  it("extracts tender evidence doc names from fact", () => {
    const sheet: TenderFactSheet = {
      trade_scope: { value: "Straßenbau", confidence: "high", evidence: [{ doc: "LV.pdf", quote_de: "Straßenbau" }] },
    };
    const { tasks } = generateTasks(sheet, () => null);
    expect(tasks[0].tender_evidence).toEqual(["LV.pdf"]);
  });

  it("passes company value from callback into task", () => {
    const sheet: TenderFactSheet = { estimated_value: presentFact };
    const { tasks } = generateTasks(sheet, (req) => req === "estimated_value" ? 5000000 : null);
    expect(tasks[0].company_value).toBe(5000000);
  });
});
