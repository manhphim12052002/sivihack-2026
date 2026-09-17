"use client";

export type EvidencePanelData = {
  criterion: string;
  doc: string;
  page: number | null | undefined;
  quote_de: string;
  reason_en: string;
};

/** Slide-over evidence viewer: the source document, the verbatim German passage, and the AI's plain-English read of it. */
export function EvidencePanel({ data, onClose }: { data: EvidencePanelData | null; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity ${data ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        className={`fixed top-0 right-0 z-40 h-full w-full max-w-md transform overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-xl transition-transform ${
          data ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {data && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-[var(--color-pursue)] uppercase">Source evidence</span>
              <button type="button" onClick={onClose} aria-label="Close" className="text-xl text-zinc-400 hover:text-zinc-700">
                &times;
              </button>
            </div>
            <h2 className="mt-2 text-lg font-semibold">Original tender passage</h2>
            <div className="mt-3 flex items-center gap-2 rounded border border-zinc-200 px-3 py-2 text-sm">
              <span>{data.doc}</span>
              {data.page != null && <span className="ml-auto rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs">Page {data.page}</span>}
            </div>
            <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed italic">&ldquo;{data.quote_de}&rdquo;</div>
            <div className="mt-3 rounded border border-[var(--color-pursue)]/30 bg-[var(--color-pursue-soft)] p-4">
              <p className="text-xs font-semibold tracking-wide text-[var(--color-pursue)] uppercase">AI interpretation</p>
              <p className="mt-1 text-sm text-zinc-800">{data.reason_en}</p>
            </div>
            <p className="mt-3 text-xs tracking-wide text-zinc-400 uppercase">Conclusion → Extracted requirement → Original evidence</p>
          </>
        )}
      </div>
    </>
  );
}
