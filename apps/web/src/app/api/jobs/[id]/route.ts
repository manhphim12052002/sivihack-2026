import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { IngestJob } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Polled every 2s by the ingest page while the in-process worker (`lib/ingest/worker.ts`) runs the job. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { data: row, error } = await db.from("ingest_jobs").select().eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: `Job ${id} not found` }, { status: 404 });

  const job: IngestJob = {
    id: String(row.id),
    stage: row.stage,
    pct: row.pct,
    message: row.message ?? null,
    tender_id: row.tender_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return NextResponse.json(job);
}
