"use client";

import { formatEur } from "@/lib/status";

export type PortfolioSlot = {
  tenderId: string;
  title: string;
  value: number | null | undefined;
  deadline: string | null | undefined;
};

export type SwapCandidate = { tenderId: string; title: string; overall: "Bid" | "Consider" | "NoGo" };

/**
 * Dark "Recommended Bid Portfolio" banner — the week's top `capacity` Bid verdicts, each slot
 * replaceable with another screened tender. Swaps are client-side only (no backend concept of
 * a stored portfolio yet) — see the tender-review page for the same caveat on overrides.
 */
export function PortfolioBanner({
  slots,
  capacity,
  swappingSlot,
  swapPool,
  onOpenSwap,
  onCancelSwap,
  onChooseReplacement,
  onOpenTender,
}: {
  slots: PortfolioSlot[];
  capacity: number | null;
  swappingSlot: number | null;
  swapPool: SwapCandidate[];
  onOpenSwap: (slot: number) => void;
  onCancelSwap: () => void;
  onChooseReplacement: (slot: number, tenderId: string) => void;
  onOpenTender: (tenderId: string) => void;
}) {
  if (slots.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--color-charcoal)] px-6 py-5 text-white/70">
        No Bid-verdict tenders yet this week — recommendations will appear here once screening runs.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--color-charcoal)] px-6 py-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Recommended Bid Portfolio <span className="font-normal text-white/60">{slots.length}{capacity === null ? " shortlisted" : ` / ${capacity} slots`}</span>
        </h2>
        <span className="rounded-full bg-[var(--color-pursue)] px-3 py-1 text-xs font-semibold tracking-wide uppercase">
          {capacity === null ? "Estimating capacity unknown" : "Stated estimating capacity"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 divide-y divide-[rgba(255,255,255,0.14)] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {slots.map((slot, index) => (
          <div key={slot.tenderId} className="pt-4 first:pt-0 sm:pt-0 sm:px-4 sm:first:px-0">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
              <button type="button" onClick={() => onOpenSwap(index)} className="font-semibold text-[var(--color-pursue)] hover:underline">
                ↻ Replace
              </button>
            </div>
            <button type="button" onClick={() => onOpenTender(slot.tenderId)} className="mt-1 block text-left text-base font-semibold hover:underline">
              {slot.title}
            </button>
            <p className="mt-1 text-sm text-white/60">
              {formatEur(slot.value)} · due {slot.deadline ?? "unknown"}
            </p>

            {swappingSlot === index && (
              <div className="mt-3 rounded-lg border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)] p-3">
                <p className="text-xs font-semibold text-white/70">Choose a replacement</p>
                {swapPool.length === 0 ? (
                  <p className="mt-2 text-sm text-white/50">No other screened tenders available to swap in.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {swapPool.map((candidate) => (
                      <li key={candidate.tenderId}>
                        <button
                          type="button"
                          onClick={() => onChooseReplacement(index, candidate.tenderId)}
                          className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-white/10"
                        >
                          {candidate.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={onCancelSwap} className="mt-2 text-xs text-white/50 hover:underline">
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
