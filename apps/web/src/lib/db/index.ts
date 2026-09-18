/**
 * The app's single data handle.
 *
 * DATA_BACKEND selects the implementation behind the DbClient port:
 *   - unset / "json"  → local JSON files in data/json-db (default; no services required)
 *   - "supabase"      → the Supabase instance
 *
 * Both backends see the same schema; see lib/db/schema.ts for the relations and their keys.
 */

import { jsonDb } from "./json/client";
import { supabaseDb } from "./supabase";
import type { DbClient } from "./types";

export type DataBackend = "json" | "supabase";

export const backend: DataBackend =
  (process.env.DATA_BACKEND ?? "json").toLowerCase() === "supabase"
    ? "supabase"
    : "json";

export const db: DbClient = backend === "supabase" ? supabaseDb : jsonDb;

export type { DbClient, DbError, DbQuery, DbResult, DbRow } from "./types";
