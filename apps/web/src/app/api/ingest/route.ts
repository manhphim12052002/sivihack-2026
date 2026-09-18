import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startIngestWorker } from "@/lib/ingest/worker";
import type { IngestJob, IngestRequest } from "@/lib/api";

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Enqueues a live-path tender ingest: a row in `ingest_jobs`, claimed and run by the in-process
 * worker (`lib/ingest/worker.ts`), which shells out to `python -m tender_extract.ingest_one` —
 * the same fetch/load/enrich path the pipeline's batch takes, per that module's own docstring.
 *
 * File/ZIP upload isn't part of that pipeline entry point (it only accepts a notice id, URL, or
 * pasted notice text), so it isn't wired here — the ingest page keeps the picker, but an upload
 * gets an honest "not supported" error instead of a fake job.
 */
export async function POST(req: NextRequest) {
  startIngestWorker();

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    return err(
      "Document upload isn't wired to the ingest pipeline yet — paste the notice URL instead.",
      501,
    );
  }

  let body: IngestRequest;
  try {
    body = (await req.json()) as IngestRequest;
  } catch {
    return err("Invalid JSON", 400);
  }
  const noticeUrl = body.notice_url?.trim();
  if (!noticeUrl) return err("notice_url is required", 400);

  const { data, error } = await db
    .from("ingest_jobs")
    .insert({
      id: crypto.randomUUID(),
      stage: "queued",
      pct: 0,
      payload: { notice_url: noticeUrl, title: body.title ?? null, buyer_name: body.buyer_name ?? null },
    })
    .select();
  if (error || !data?.[0]) return err(error?.message ?? "Could not enqueue the ingest job.", 500);

  const row = data[0];
  const job: IngestJob = {
    id: String(row.id),
    stage: row.stage,
    pct: row.pct,
    message: row.message ?? null,
    tender_id: row.tender_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return NextResponse.json(job, { status: 202 });
}
