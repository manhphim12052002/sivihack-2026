/**
 * JSON-file implementation of the DbClient port.
 *
 * Filters, ordering, projection and write semantics follow PostgREST closely enough that the
 * callers in `app/api/**` and `lib/**` are identical for both backends:
 *   - a write with `.select()` returns the affected rows, otherwise `data` is null
 *   - `insert` on an existing primary key fails with SQLSTATE 23505
 *   - `upsert` merges the given columns over the existing row (`on conflict do update`)
 *   - `single()` on zero or many rows fails with PGRST116
 */

import { tableSchema, withDefaults, type TableSchema } from "../schema";
import type { DbClient, DbError, DbQuery, DbResult, DbRow } from "../types";
import { readTable, writeTable } from "./store";
import { claimIngestJob, saveCompanyIntelligence } from "./rpc";

class JsonDbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

interface Filter {
  column: string;
  test: (value: unknown) => boolean;
}

function compare(a: unknown, b: unknown): number {
  // Postgres sorts nulls last on ascending order; keep them last in both directions so a
  // partially populated export never pushes empty rows to the top of a list.
  if (a === null || a === undefined)
    return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function project(rows: DbRow[], columns: string[] | null): DbRow[] {
  if (!columns) return rows;
  return rows.map((row) => {
    const out: DbRow = {};
    for (const column of columns) out[column] = row[column];
    return out;
  });
}

/** `select("a,b")` becomes ["a","b"]; `select()` and `select("*")` mean all columns. */
function parseColumns(columns?: string): string[] | null {
  if (!columns || columns.trim() === "" || columns.trim() === "*") return null;
  const names = columns
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return names.includes("*") ? null : names;
}

class JsonQuery<T extends DbRow> implements DbQuery<T> {
  private mode: Mode = "select";
  private payload: DbRow[] = [];
  private columns: string[] | null = null;
  private returning = false;
  private readonly filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;

  constructor(private readonly table: string) {}

  select(columns?: string): DbQuery<T> {
    this.columns = parseColumns(columns);
    this.returning = true;
    return this;
  }

  insert(values: DbRow | DbRow[]): DbQuery<T> {
    this.mode = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: DbRow): DbQuery<T> {
    this.mode = "update";
    this.payload = [values];
    return this;
  }

  upsert(values: DbRow | DbRow[]): DbQuery<T> {
    this.mode = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  delete(): DbQuery<T> {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown): DbQuery<T> {
    this.filters.push({ column, test: (v) => v === value });
    return this;
  }

  in(column: string, values: readonly unknown[]): DbQuery<T> {
    const set = new Set(values);
    this.filters.push({ column, test: (v) => set.has(v) });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): DbQuery<T> {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): DbQuery<T> {
    this.limitCount = count;
    return this;
  }

  then<R1 = DbResult<T[] | null>, R2 = never>(
    onfulfilled?:
      | ((value: DbResult<T[] | null>) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  async single(): Promise<DbResult<T | null>> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length !== 1) {
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: `JSON result contains ${rows.length} rows, expected exactly 1`,
        },
      };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<DbResult<T | null>> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length === 0) return { data: null, error: null };
    if (rows.length > 1) {
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: `JSON result contains ${rows.length} rows, expected at most 1`,
        },
      };
    }
    return { data: rows[0], error: null };
  }

  private matches(row: DbRow): boolean {
    return this.filters.every((f) => f.test(row[f.column]));
  }

  private keyOf(schema: TableSchema, row: DbRow): string {
    return JSON.stringify(schema.primaryKey.map((c) => row[c] ?? null));
  }

  private async run(): Promise<DbResult<T[] | null>> {
    try {
      const rows = await this.execute();
      const shaped = rows === null ? null : (project(rows, this.columns) as T[]);
      return { data: shaped, error: null };
    } catch (e) {
      const error: DbError =
        e instanceof JsonDbError
          ? { message: e.message, code: e.code }
          : { message: e instanceof Error ? e.message : String(e) };
      return { data: null, error };
    }
  }

  /** Returns the rows to report, or null when a write was issued without `.select()`. */
  private async execute(): Promise<DbRow[] | null> {
    const schema = tableSchema(this.table);
    if (!schema) {
      throw new JsonDbError(
        `relation "${this.table}" is not part of the replicated schema (see lib/db/schema.ts)`,
        "42P01",
      );
    }
    if (this.mode !== "select" && schema.readOnly) {
      throw new JsonDbError(
        `relation "${this.table}" is a view and is read-only`,
        "42809",
      );
    }

    if (this.mode === "select") return this.runSelect();

    const affected = await writeTable(this.table, (rows) =>
      this.applyWrite(schema, rows),
    );
    return this.returning ? affected : null;
  }

  private async runSelect(): Promise<DbRow[]> {
    let rows = (await readTable(this.table)).filter((r) => this.matches(r));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort(
        (a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1),
      );
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  /** Mutates `rows` in place and returns the affected rows. */
  private applyWrite(schema: TableSchema, rows: DbRow[]): DbRow[] {
    const affected: DbRow[] = [];

    if (this.mode === "insert" || this.mode === "upsert") {
      for (const value of this.payload) {
        const row = withDefaults(schema, value);
        const key = this.keyOf(schema, row);
        const at = rows.findIndex((r) => this.keyOf(schema, r) === key);
        if (at === -1) {
          rows.push(row);
          affected.push(row);
          continue;
        }
        if (this.mode === "insert") {
          throw new JsonDbError(
            `duplicate key value violates unique constraint "${this.table}_pkey"`,
            "23505",
          );
        }
        // on conflict do update: only the supplied columns change.
        rows[at] = { ...rows[at], ...value };
        affected.push(rows[at]);
      }
      return affected;
    }

    for (let i = rows.length - 1; i >= 0; i--) {
      if (!this.matches(rows[i])) continue;
      if (this.mode === "delete") {
        affected.unshift(rows[i]);
        rows.splice(i, 1);
      } else {
        rows[i] = { ...rows[i], ...this.payload[0] };
        affected.unshift(rows[i]);
      }
    }
    return affected;
  }
}

export const jsonDb: DbClient = {
  from<T extends DbRow = DbRow>(table: string): DbQuery<T> {
    return new JsonQuery<T>(table);
  },

  async rpc<T = unknown>(fn: string, args: DbRow): Promise<DbResult<T | null>> {
    try {
      if (fn === "save_company_intelligence") {
        const revision = await saveCompanyIntelligence(
          args.payload as DbRow,
          Number(args.expected_revision ?? 0),
        );
        return { data: revision as unknown as T, error: null };
      }
      if (fn === "claim_ingest_job") {
        const job = await claimIngestJob();
        return { data: job as unknown as T, error: null };
      }
      return {
        data: null,
        error: { message: `function "${fn}" does not exist`, code: "42883" },
      };
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
      };
    }
  },
};
