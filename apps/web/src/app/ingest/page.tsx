"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { IngestJob } from "@/lib/api";
import { IngestDropzone } from "@/components/ingest-dropzone";
import { JobProgress } from "@/components/job-progress";

const POLL_INTERVAL_MS = 2000;

export default function IngestPage() {
  const [job, setJob] = useState<IngestJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.job(jobId);
        setJob(updated);
        if (updated.stage === "done" || updated.stage === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Lost connection while polling the job.");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleFiles(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.ingestFiles(files);
      setJob(created);
      startPolling(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start ingest.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl(url: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await api.ingestUrl(url);
      setJob(created);
      startPolling(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start ingest.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Ingest a new tender</h1>
        <p className="mt-1 text-zinc-600">
          Upload documents or point at a notice URL — this is how judges&rsquo; unseen tenders come in.
        </p>
      </div>

      <IngestDropzone onSubmitFiles={handleFiles} onSubmitUrl={handleUrl} busy={busy} />

      {error && <p className="rounded border border-[--color-skip] bg-[--color-skip-soft] px-3 py-2 text-[--color-skip]">{error}</p>}
      {job && <JobProgress job={job} />}
    </div>
  );
}
