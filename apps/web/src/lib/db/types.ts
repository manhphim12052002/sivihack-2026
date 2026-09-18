/**
 * Data-access port.
 *
 * The app talks to this interface instead of to `@supabase/supabase-js` directly, so the same
 * route handlers and lib modules run against either backend:
 *   - `db/db.ts` — PostgREST over the Supabase instance
 *   - `db/json/`       — local JSON files, one per table/view, same column names
 *
 * The surface is deliberately only what the app uses: filtered selects, insert/update/upsert/
 * delete, ordering, limits, `single`/`maybeSingle`, and the one stored procedure.
 */

// Rows are untyped on purpose: this mirrors supabase-js inference for a client without generated
// database types. Callers read arbitrary columns and cast to their own row interfaces.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;

export interface DbError {
  message: string;
  /** Postgres SQLSTATE (e.g. "23505" unique violation) or PostgREST code, when applicable. */
  code?: string;
  details?: string;
}

export interface DbResult<T> {
  data: T;
  error: DbError | null;
}

/**
 * Chainable query. Awaiting it resolves to the rows; `single`/`maybeSingle` resolve to one row.
 * Mirrors PostgREST semantics: a write with `.select()` returns the affected rows.
 */
export interface DbQuery<T extends DbRow = DbRow>
  extends PromiseLike<DbResult<T[] | null>> {
  select(columns?: string): DbQuery<T>;
  insert(values: DbRow | DbRow[]): DbQuery<T>;
  update(values: DbRow): DbQuery<T>;
  upsert(values: DbRow | DbRow[]): DbQuery<T>;
  delete(): DbQuery<T>;
  eq(column: string, value: unknown): DbQuery<T>;
  in(column: string, values: readonly unknown[]): DbQuery<T>;
  order(column: string, options?: { ascending?: boolean }): DbQuery<T>;
  limit(count: number): DbQuery<T>;
  /** Exactly one row expected; zero or many rows resolve to an error. */
  single(): PromiseLike<DbResult<T | null>>;
  /** At most one row expected; zero rows resolve to `data: null` without an error. */
  maybeSingle(): PromiseLike<DbResult<T | null>>;
}

export interface DbClient {
  from<T extends DbRow = DbRow>(table: string): DbQuery<T>;
  rpc<T = unknown>(fn: string, args: DbRow): PromiseLike<DbResult<T | null>>;
}
