import Link from "next/link";
import type { IngestJob } from "@/lib/api";
import { JOB_STAGES, JOB_STAGE_LABELS } from "@/lib/status";

const STEP_STAGES = JOB_STAGES.filter((stage) => stage !== "error");

/** Stage stepper for an ingest job, polled every 2s from the ingest page. */
export function JobProgress({ job }: { job: IngestJob }) {
  // Index against the full stage list (not the filtered STEP_STAGES) since
  // TS infers a narrowed element type for the `.filter(!== "error")` result.
  const currentIndex = JOB_STAGES.indexOf(job.stage);

  return (
    <div className="rounded border border-zinc-200 p-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEP_STAGES.map((stage, index) => {
          const active = job.stage === stage;
          const complete = job.stage !== "error" && index < currentIndex;
          return (
            <li
              key={stage}
              className={`rounded-full border px-3 py-1 ${
                active
                  ? "border-blue-600 bg-blue-50 font-semibold text-blue-800"
                  : complete
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-zinc-200 text-zinc-500"
              }`}
            >
              {JOB_STAGE_LABELS[stage]}
            </li>
          );
        })}
      </ol>

      {job.stage === "error" ? (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">
          {job.message ?? "Ingest failed."}
        </p>
      ) : (
        <div className="mt-3">
          <div className="h-2 w-full rounded bg-zinc-100">
            <div
              className="h-2 rounded bg-blue-600"
              style={{ width: `${Math.min(100, Math.max(0, job.pct))}%` }}
            />
          </div>
          {job.message && <p className="mt-2 text-sm text-zinc-600">{job.message}</p>}
        </div>
      )}

      {job.stage === "done" && job.tender_id && (
        <p className="mt-3">
          <Link href={`/tenders/${job.tender_id}`} className="text-blue-700 underline">
            Open the briefing for this tender →
          </Link>
        </p>
      )}
    </div>
  );
}
