/**
 * Supabase implementation of the DbClient port.
 *
 * The client is built on first use, not at import time, so running with DATA_BACKEND=json needs
 * no Supabase environment variables at all.
 *
 * The service-role key is server-only (no NEXT_PUBLIC_ prefix, never bundled to the browser).
 * Every caller of `db` is a route handler or a module it imports (app/api/**, lib/company/*),
 * never a "use client" component, so this bypasses RLS the same way the Python pipeline does
 * via postgres.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DbClient, DbQuery, DbResult, DbRow } from "./types";

let client: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "DATA_BACKEND=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// PostgREST builders are a superset of DbQuery (same method names and result shape), but their
// generics are table-typed, so the structural match is asserted here once instead of wrapping
// every method.
export const supabaseDb: DbClient = {
  from<T extends DbRow = DbRow>(table: string): DbQuery<T> {
    return getClient().from(table) as unknown as DbQuery<T>;
  },
  rpc<T = unknown>(fn: string, args: DbRow): PromiseLike<DbResult<T | null>> {
    return getClient().rpc(fn, args) as unknown as PromiseLike<
      DbResult<T | null>
    >;
  },
};
