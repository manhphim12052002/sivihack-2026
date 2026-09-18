/**
 * File store for the JSON backend.
 *
 * One file per relation (`<dir>/<table>.json`), holding a JSON array of row objects. Reads are
 * cached and invalidated by mtime, so a file replaced on disk (a fresh export) is picked up
 * without restarting the server. Writes are serialized per table and land atomically
 * (temp file + rename) so a crashed write cannot truncate a table.
 */

import { promises as fs } from "fs";
import path from "path";
import type { DbRow } from "../types";

/**
 * Directory holding the JSON tables. Defaults to `<repo>/data/json-db`, resolved from the Next.js
 * working directory (`apps/web`); override with JSON_DB_DIR.
 */
export function jsonDbDir(): string {
  return (
    process.env.JSON_DB_DIR ??
    path.resolve(process.cwd(), "..", "..", "data", "json-db")
  );
}

function tableFile(table: string): string {
  return path.join(jsonDbDir(), `${table}.json`);
}

interface CacheEntry {
  rows: DbRow[];
  /** 0 means "file absent"; an absent file is an empty table. */
  mtimeMs: number;
}

const cache = new Map<string, CacheEntry>();
const writeChains = new Map<string, Promise<unknown>>();

async function mtimeOf(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return 0;
  }
}

/** All rows of a table. The returned array is shared with the cache — treat it as read-only. */
export async function readTable(table: string): Promise<DbRow[]> {
  const file = tableFile(table);
  const mtimeMs = await mtimeOf(file);
  const hit = cache.get(table);
  if (hit && hit.mtimeMs === mtimeMs) return hit.rows;

  if (mtimeMs === 0) {
    cache.set(table, { rows: [], mtimeMs: 0 });
    return [];
  }

  const raw = await fs.readFile(file, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${table}.json is not valid JSON: ${String(e)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${table}.json must be a JSON array of row objects`);
  }
  const rows = parsed as DbRow[];
  cache.set(table, { rows, mtimeMs });
  return rows;
}

async function persist(table: string, rows: DbRow[]): Promise<void> {
  const file = tableFile(table);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(rows, null, 2)}\n`, "utf-8");
  await fs.rename(tmp, file);
  cache.set(table, { rows, mtimeMs: await mtimeOf(file) });
}

/**
 * Read-modify-write a table under a per-table lock. `mutate` receives a mutable copy of the rows
 * and returns the rows it affected, which is what the query reports back to the caller.
 */
export function writeTable(
  table: string,
  mutate: (rows: DbRow[]) => DbRow[],
): Promise<DbRow[]> {
  const run = async (): Promise<DbRow[]> => {
    const rows = [...(await readTable(table))];
    const affected = mutate(rows);
    await persist(table, rows);
    return affected;
  };
  const chain = (writeChains.get(table) ?? Promise.resolve()).then(run, run);
  // Keep the chain alive for the next writer even if this write failed.
  writeChains.set(
    table,
    chain.catch(() => undefined),
  );
  return chain;
}

/** Drop the read cache. Used by tests; production relies on mtime invalidation. */
export function clearCache(): void {
  cache.clear();
  writeChains.clear();
}
