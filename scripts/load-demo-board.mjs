#!/usr/bin/env node
/**
 * Load the demo board relations into Postgres, for DATA_BACKEND=supabase.
 *
 * The checked-in JSON store (data/json-db/company_profiles.json, data/json-db/demo_lots.json) is
 * the only copy of the demo content: the JSON backend reads those files directly, and this script
 * upserts the same rows through PostgREST so the hosted backend serves the same board. Re-running
 * it is safe — rows merge on their primary key.
 *
 * Usage:
 *   node scripts/load-demo-board.mjs
 *
 * Reads the same two variables the web app's Supabase adapter reads (apps/web/src/lib/db).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TABLES = ["company_profiles", "demo_lots"];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the same ones DATA_BACKEND=supabase needs).",
  );
  process.exit(1);
}

for (const table of TABLES) {
  const file = path.join(repoRoot, "data", "json-db", `${table}.json`);
  const rows = JSON.parse(await readFile(file, "utf-8"));

  const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      // on conflict do update, like the port's upsert
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    console.error(`${table}: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  console.log(`${table}: ${rows.length} rows`);
}
