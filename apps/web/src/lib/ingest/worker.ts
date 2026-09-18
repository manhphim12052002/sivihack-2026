/**
 * Ingest worker: the "worker" side of the `ingest_jobs` queue the pipeline's init migration
 * documents ("the table is the contract; the web writes rows, a worker claims them"). Runs
 * in-process in the Next.js server — a separate process is unnecessary for a single-laptop demo.
 *
 * Claims one queued job at a time via `claim_ingest_job()` (both backends implement it, see
 * `lib/db/json/rpc.ts` and the Postgres function), shells out to the pipeline's own live-ingest
 * entry point (`python -m tender_extract.ingest_one`, never reimplemented here), and narrates
 * progress back into the same row so `/api/jobs/[id]` has something to report.
 */
import { spawn } from "child_process";
import path from "path";
import { db } from "@/lib/db";
import type { DbRow } from "@/lib/db/types";
import type { JobStage } from "@/lib/status";

const POLL_INTERVAL_MS = 1500;
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;
const LOADED_LINE = /^loaded (\d+) lot\(s\): (.+)$/m;

/** Repo root, two levels above the Next.js app (`apps/web` -> repo root); matches `jsonDbDir()`. */
function repoRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

function tail(text: string, max = 500): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}

async function updateJob(id: string, patch: DbRow): Promise<void> {
  await db.from("ingest_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Runs `python -m tender_extract.<module> <args>` from the repo root; resolves with combined output and exit code. */
function runPipeline(module: string, args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("uv", ["run", "--project", "apps/pipeline", "python", "-m", module, ...args], {
      cwd: repoRoot(),
      env: process.env,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    const timer = setTimeout(() => child.kill("SIGKILL"), PROCESS_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, output: `${output}\n${err.message}` });
    });
  });
}

/** Best-effort refresh of the JSON backend's export so a new tender shows up without a manual step. */
async function refreshJsonExport(): Promise<void> {
  await runPipeline("tender_extract.export_json", ["--out", "data/json-db"]);
}

async function processJob(job: DbRow): Promise<void> {
  const id = String(job.id);
  const payload = (job.payload ?? {}) as DbRow;
  const reference = typeof payload.notice_url === "string" ? payload.notice_url : null;
  if (!reference) {
    await updateJob(id, {
      stage: "error" satisfies JobStage,
      pct: 100,
      message: "Job has no notice_url to ingest.",
    });
    return;
  }

  await updateJob(id, {
    stage: "extracting_text" satisfies JobStage,
    pct: 30,
    message: "Fetching the notice and its documents…",
  });

  const args = typeof payload.text_path === "string" ? [reference, "--text", payload.text_path] : [reference];
  const { code, output } = await runPipeline("tender_extract.ingest_one", args);

  if (code !== 0) {
    await updateJob(id, {
      stage: "error" satisfies JobStage,
      pct: 100,
      message: tail(output) || `ingest_one exited with code ${code}`,
    });
    return;
  }

  const match = LOADED_LINE.exec(output);
  const lotKeys = match ? match[2].split(",").map((k) => k.trim()) : [];
  await updateJob(id, {
    stage: "extracting_facts" satisfies JobStage,
    pct: 80,
    message: match ? `Extracting facts from ${match[1]} lot(s)…` : "Extracting facts…",
  });

  await refreshJsonExport();

  await updateJob(id, {
    stage: "done" satisfies JobStage,
    pct: 100,
    tender_id: lotKeys[0] ?? null,
    message: lotKeys.length > 0 ? `Ingested ${lotKeys.length} lot(s).` : "Ingest finished; no construction lots found.",
  });
}

let started = false;

/** Idempotent: safe to call from every route module that touches ingest, only the first call runs the loop. */
export function startIngestWorker(): void {
  if (started) return;
  started = true;

  let claiming = false;
  setInterval(() => {
    if (claiming) return;
    claiming = true;
    void (async () => {
      try {
        const { data: job } = await db.rpc<DbRow | null>("claim_ingest_job", {});
        if (job) await processJob(job);
      } catch (err) {
        // A single job's failure must not stop the loop from claiming the next one.
        console.error("[ingest-worker]", err);
      } finally {
        claiming = false;
      }
    })();
  }, POLL_INTERVAL_MS);
}
