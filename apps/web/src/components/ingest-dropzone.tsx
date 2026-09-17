"use client";

import { useState } from "react";

/** File upload (PDF/ZIP) or a notice URL — the two ways `/ingest` accepts a new tender. */
export function IngestDropzone({
  onSubmitFiles,
  onSubmitUrl,
  busy,
}: {
  onSubmitFiles: (files: File[]) => void | Promise<void>;
  onSubmitUrl: (url: string) => void | Promise<void>;
  busy: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-4 rounded border border-zinc-200 p-4">
      <div>
        <label className="text-sm font-medium">Upload tender documents (PDF or ZIP)</label>
        <input
          type="file"
          accept=".pdf,.zip"
          multiple
          disabled={busy}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          className="mt-1 block text-base"
        />
        <button
          type="button"
          disabled={busy || files.length === 0}
          onClick={() => onSubmitFiles(files)}
          className="mt-2 rounded bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
        >
          Upload{files.length > 0 ? ` (${files.length})` : ""}
        </button>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <label className="text-sm font-medium">or a notice URL</label>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            placeholder="https://www.oeffentlichevergabe.de/..."
            disabled={busy}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="flex-1 rounded border border-zinc-300 p-2 text-base"
          />
          <button
            type="button"
            disabled={busy || !url.trim()}
            onClick={() => onSubmitUrl(url.trim())}
            className="rounded bg-zinc-900 px-4 py-2 text-base font-medium text-white disabled:opacity-40"
          >
            Ingest
          </button>
        </div>
      </div>
    </div>
  );
}
