/**
 * The demo board store over the JSON backend: the read/write surface the /api/companies,
 * /api/tenders and /api/screen handlers use, against a copy of the checked-in store
 * (data/json-db/company_profiles.json, data/json-db/demo_lots.json).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { clearCache } from "@/lib/db/json/store";
import type { CompanyProfile } from "@/lib/api";

/** The checked-in store, copied into each test's directory so writes stay in the temp dir. */
const CHECKED_IN_DIR = path.resolve(process.cwd(), "..", "..", "data", "json-db");

let dir: string;
let companyRows: CompanyProfile[];
let lotRows: Array<Record<string, unknown> & { id: string }>;

/** A fresh module instance, bound to this test's store directory. */
async function store() {
  vi.resetModules();
  return import("@/lib/assets");
}

async function rowsOnDisk(table: string): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(path.join(dir, `${table}.json`), "utf-8"));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "assets-db-"));
  process.env.JSON_DB_DIR = dir;
  for (const table of ["company_profiles", "demo_lots"]) {
    await copyFile(
      path.join(CHECKED_IN_DIR, `${table}.json`),
      path.join(dir, `${table}.json`),
    );
  }
  companyRows = JSON.parse(
    await readFile(path.join(dir, "company_profiles.json"), "utf-8"),
  );
  lotRows = JSON.parse(await readFile(path.join(dir, "demo_lots.json"), "utf-8"));
  clearCache();
});

afterEach(async () => {
  delete process.env.JSON_DB_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("demo board reads", () => {
  it("lists the checked-in store, in file order", async () => {
    const { listCompanies, listLots } = await store();

    expect((await listCompanies()).map((c) => c.id)).toEqual(
      companyRows.map((c) => c.id),
    );
    expect((await listLots()).map((l) => l.id)).toEqual(
      lotRows.map((l) => l.id),
    );
  });

  it("orders by created_at, not by position in the file", async () => {
    // A row appended out of order still lists in created_at order.
    await writeFile(
      path.join(dir, "company_profiles.json"),
      JSON.stringify([
        { id: "COMP-second", name: "Second", created_at: "2026-02-01" },
        { id: "COMP-first", name: "First", created_at: "2026-01-01" },
      ]),
    );
    clearCache();

    const { listCompanies } = await store();
    expect((await listCompanies()).map((c) => c.id)).toEqual([
      "COMP-first",
      "COMP-second",
    ]);
  });

  it("returns only the API model's fields, not the store's timestamps", async () => {
    const { getCompany, getLot } = await store();

    const company = await getCompany(companyRows[0].id);
    const lot = await getLot(lotRows[0].id);

    expect(company).toBeDefined();
    expect(company).not.toHaveProperty("created_at");
    expect(company).not.toHaveProperty("updated_at");
    expect(lot).not.toHaveProperty("created_at");
    // Nested fact sheet survives the round-trip through the store.
    expect(lot?.fact_sheet).toEqual(lotRows[0].fact_sheet);
  });

  it("resolves an unknown id to undefined", async () => {
    const { getCompany, getLot } = await store();
    expect(await getCompany("COMP-missing")).toBeUndefined();
    expect(await getLot("lot-missing")).toBeUndefined();
  });
});

describe("demo board writes", () => {
  it("persists a created company and reads it back", async () => {
    const { upsertCompany, getCompany } = await store();

    await upsertCompany({
      id: "COMP-new",
      name: "Neu Bau GmbH",
      home_base: "Lübeck",
      regions: ["Schleswig-Holstein"],
      trades: ["building construction"],
      capacity_per_week: null,
      raw_text: "profile text",
    });

    expect(await getCompany("COMP-new")).toMatchObject({
      id: "COMP-new",
      name: "Neu Bau GmbH",
      regions: ["Schleswig-Holstein"],
    });
    const stored = await rowsOnDisk("company_profiles");
    expect(stored.find((r) => r.id === "COMP-new")).toBeDefined();
  });

  it("merges an update over the stored profile", async () => {
    const { upsertCompany, getCompany } = await store();
    const stored = companyRows[0];

    await upsertCompany({ ...stored, contract_max_eur: 9_000_000 });

    const updated = await getCompany(stored.id);
    expect(updated?.contract_max_eur).toBe(9_000_000);
    expect(updated?.name).toBe(stored.name);
  });

  it("reports whether a delete removed a row", async () => {
    const { deleteCompany, getCompany } = await store();

    expect(await deleteCompany(companyRows[0].id)).toBe(true);
    expect(await getCompany(companyRows[0].id)).toBeUndefined();
    expect(await deleteCompany("COMP-missing")).toBe(false);
  });
});
