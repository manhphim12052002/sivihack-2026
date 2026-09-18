import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { jsonDb } from "../json/client";
import { clearCache } from "../json/store";
import { listTenders, getTender } from "@/lib/tender/db";

let dir: string;

async function seed(table: string, rows: unknown[]) {
  await writeFile(path.join(dir, `${table}.json`), JSON.stringify(rows));
  clearCache();
}

async function rowsOnDisk(table: string): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(path.join(dir, `${table}.json`), "utf-8"));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "json-db-"));
  process.env.JSON_DB_DIR = dir;
  clearCache();
});

afterEach(async () => {
  delete process.env.JSON_DB_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("json backend reads", () => {
  it("treats a missing table file as an empty table", async () => {
    const { data, error } = await jsonDb.from("companies").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("filters, orders, limits and projects columns", async () => {
    await seed("companies", [
      { id: "C1", name: "Bravo", status: "READY", created_at: "2026-01-02" },
      { id: "C2", name: "Alpha", status: "READY", created_at: "2026-01-03" },
      { id: "C3", name: "Cesar", status: "ONBOARDING", created_at: "2026-01-01" },
    ]);

    const { data } = await jsonDb
      .from("companies")
      .select("id")
      .eq("status", "READY")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(data).toEqual([{ id: "C2" }]);
  });

  it("matches in() against a value set", async () => {
    await seed("chunks", [
      { id: "K1", source_id: "S1" },
      { id: "K2", source_id: "S2" },
      { id: "K3", source_id: "S3" },
    ]);

    const { data } = await jsonDb
      .from("chunks")
      .select("*")
      .in("source_id", ["S1", "S3"]);

    expect(data?.map((r) => r.id)).toEqual(["K1", "K3"]);
  });

  it("reports zero rows from single() and null from maybeSingle()", async () => {
    const single = await jsonDb
      .from("companies")
      .select("*")
      .eq("id", "missing")
      .single();
    expect(single.data).toBeNull();
    expect(single.error?.code).toBe("PGRST116");

    const maybe = await jsonDb
      .from("companies")
      .select("*")
      .eq("id", "missing")
      .maybeSingle();
    expect(maybe.data).toBeNull();
    expect(maybe.error).toBeNull();
  });

  it("rejects a relation outside the replicated schema", async () => {
    const { error } = await jsonDb.from("not_a_table").select("*");
    expect(error?.code).toBe("42P01");
  });
});

describe("json backend writes", () => {
  it("applies column defaults and persists the inserted row", async () => {
    const { data, error } = await jsonDb
      .from("companies")
      .insert({ id: "C1", name: "Brenner" })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: "C1",
      name: "Brenner",
      status: "ONBOARDING",
      home_base: "",
      revision: 0,
    });
    expect(typeof data?.created_at).toBe("string");
    expect(await rowsOnDisk("companies")).toHaveLength(1);
  });

  it("fails an insert on an existing primary key with 23505", async () => {
    await seed("companies", [{ id: "C1", name: "Brenner" }]);
    const { error } = await jsonDb
      .from("companies")
      .insert({ id: "C1", name: "Other" });
    expect(error?.code).toBe("23505");
  });

  it("upserts by merging the supplied columns over the existing row", async () => {
    await seed("match_evaluations", [
      {
        id: "EVAL1",
        tender_id: "T1",
        company_id: "C1",
        status: "REVIEW",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await jsonDb
      .from("match_evaluations")
      .upsert({ id: "EVAL1", status: "VIABLE" });

    const rows = await rowsOnDisk("match_evaluations");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "EVAL1",
      tender_id: "T1",
      status: "VIABLE",
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("updates only the rows matching every filter", async () => {
    await seed("match_results", [
      { id: "R1", evaluation_id: "EVAL1", status: "FAIL" },
      { id: "R1b", evaluation_id: "EVAL2", status: "FAIL" },
    ]);

    await jsonDb
      .from("match_results")
      .update({ override_status: "PASS" })
      .eq("id", "R1")
      .eq("evaluation_id", "EVAL1");

    const rows = await rowsOnDisk("match_results");
    expect(rows.find((r) => r.id === "R1")?.override_status).toBe("PASS");
    expect(rows.find((r) => r.id === "R1b")?.override_status).toBeUndefined();
  });

  it("deletes the filtered rows", async () => {
    await seed("match_knowledge_gaps", [
      { id: "G1", evaluation_id: "EVAL1" },
      { id: "G2", evaluation_id: "EVAL2" },
    ]);

    await jsonDb
      .from("match_knowledge_gaps")
      .delete()
      .eq("evaluation_id", "EVAL1");

    expect(await rowsOnDisk("match_knowledge_gaps")).toEqual([
      { id: "G2", evaluation_id: "EVAL2" },
    ]);
  });

  it("refuses to write to a view", async () => {
    const { error } = await jsonDb
      .from("lots_latest")
      .insert({ lot_key: "L1" });
    expect(error?.code).toBe("42809");
  });
});

describe("save_company_intelligence", () => {
  const payload = {
    company_id: "C1",
    identity: { name: "Brenner", headquarters: "Augsburg", employees: 140 },
    geography: { regions: ["BY"], radius_km: 120 },
    commercial_profile: { contract_max_eur: 5_000_000 },
    capabilities: [
      {
        id: "CAP1",
        type: "ROAD_CONSTRUCTION",
        label: "Roads",
        origin: "DOCUMENT_EXTRACTED",
        status: "CONFIRMED",
        evidence: ["K1"],
      },
    ],
    references: [
      { id: "REF1", name: "State road", contract_value_eur: 2_900_000 },
    ],
  };

  it("bumps the revision and replaces the child collections", async () => {
    await seed("companies", [{ id: "C1", name: "old", revision: 0 }]);
    await seed("company_capabilities", [
      { id: "STALE", company_id: "C1", type: "OLD", label: "old" },
    ]);

    const { data, error } = await jsonDb.rpc("save_company_intelligence", {
      payload,
      expected_revision: 0,
    });

    expect(error).toBeNull();
    expect(data).toBe(1);

    const [company] = await rowsOnDisk("companies");
    expect(company).toMatchObject({
      name: "Brenner",
      headquarters: "Augsburg",
      employees: 140,
      intelligence_version: 2,
      revision: 1,
    });

    expect(await rowsOnDisk("company_capabilities")).toEqual([
      expect.objectContaining({ id: "CAP1", company_id: "C1" }),
    ]);
    // contract_value_eur lands in the value_eur column, like the stored procedure.
    expect(await rowsOnDisk("company_references")).toEqual([
      expect.objectContaining({ id: "REF1", value_eur: 2_900_000 }),
    ]);
  });

  it("rejects a stale revision with PROFILE_CONFLICT", async () => {
    await seed("companies", [{ id: "C1", name: "old", revision: 3 }]);

    const { error } = await jsonDb.rpc("save_company_intelligence", {
      payload,
      expected_revision: 0,
    });

    expect(error?.message).toContain("PROFILE_CONFLICT");
    expect((await rowsOnDisk("companies"))[0].revision).toBe(3);
  });

  it("reports an unknown company", async () => {
    const { error } = await jsonDb.rpc("save_company_intelligence", {
      payload,
      expected_revision: 0,
    });
    expect(error?.message).toBe("Company not found");
  });
});

describe("tender reads through the JSON backend", () => {
  const lot = {
    lot_key: "oev:N1:LOT-0001",
    procedure_key: "oev:N1",
    source: "oeffentlichevergabe",
    notice_id: "N1",
    notice_version: "01",
    lot_id: "LOT-0001",
    title: "Kanalsanierung",
    buyer_name: "Stadt Augsburg",
    place_city: "Augsburg",
    place_nuts: "DE27",
    cpv_main: "45232400",
    estimated_value: 1_200_000,
    submission_deadline: "2026-10-01T10:00:00Z",
    published: "2026-09-01",
    ingested_at: "2026-09-02T08:00:00Z",
    notice_url: "https://example.invalid/N1",
    lot_count: 1,
    description: "Sewer renewal",
  };

  it("lists lots newest first", async () => {
    await seed("lots_latest", [
      { ...lot, lot_key: "older", ingested_at: "2026-09-01T08:00:00Z" },
      lot,
    ]);

    const tenders = await listTenders();
    expect(tenders.map((t) => t.id)).toEqual(["oev:N1:LOT-0001", "older"]);
    expect(tenders[0]).toMatchObject({
      title: "Kanalsanierung",
      estimated_value_eur: 1_200_000,
      source: "oeffentlichevergabe",
    });
  });

  it("builds a fact sheet from resolved observations, lot scope winning", async () => {
    await seed("lots_latest", [lot]);
    await seed("observations_resolved", [
      {
        scope_key: "oev:N1",
        attribute: "guarantees",
        state: "KNOWN",
        value_text: "5% Vertragserfüllungsbürgschaft",
        value_num: null,
        unit: null,
        confidence: "high",
        evidence: [
          {
            source_id: "notice:N1:01",
            extractor: "xpath",
            locator: "Vergabeunterlagen.pdf",
            page: 4,
            quote: "5 %",
            value: "5%",
          },
        ],
      },
      {
        scope_key: "oev:N1",
        attribute: "estimated_value",
        state: "KNOWN",
        value_text: null,
        value_num: 900_000,
        unit: "EUR",
        confidence: "medium",
        evidence: null,
      },
      {
        scope_key: "oev:N1:LOT-0001",
        attribute: "estimated_value",
        state: "KNOWN",
        value_text: null,
        value_num: 1_200_000,
        unit: "EUR",
        confidence: "high",
        evidence: null,
      },
      {
        scope_key: "oev:N1:LOT-0001",
        attribute: "penalty",
        state: "NOT_FOUND",
        value_text: null,
        value_num: null,
        unit: null,
        confidence: "not_found",
        evidence: null,
      },
    ]);

    const tender = await getTender("oev:N1:LOT-0001");

    // docs_retrieved means a linked document was read (document_files → sources AVAILABLE);
    // observations alone, as seeded here, do not make that claim.
    expect(tender?.docs_retrieved).toBe(false);
    expect(tender?.fact_sheet?.guarantees).toMatchObject({
      value: "5% Vertragserfüllungsbürgschaft",
      confidence: "high",
    });
    expect(tender?.fact_sheet?.guarantees?.evidence?.[0]).toEqual({
      doc: "Vergabeunterlagen.pdf",
      page: 4,
      quote_de: "5 %",
    });
    // Lot scope overrides the procedure-scoped value.
    expect(tender?.fact_sheet?.estimated_value?.value).toBe(1_200_000);
    // NOT_FOUND observations are omitted rather than reported as facts.
    expect(tender?.fact_sheet?.penalty).toBeUndefined();
  });

  it("returns null for an unknown lot", async () => {
    await seed("lots_latest", [lot]);
    expect(await getTender("nope")).toBeNull();
  });
});
