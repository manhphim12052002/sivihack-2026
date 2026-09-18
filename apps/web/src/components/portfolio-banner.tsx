"use client";

import { formatEur } from "@/lib/status";

export type PortfolioSlot = {
  tenderId: string;
  title: string;
  value: number | null | undefined;
  deadline: string | null | undefined;
};

export type SwapCandidate = { tenderId: string; title: string; overall: "Bid" | "Consider" | "NoGo" };

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
  const totalScanned = slots.length + swapPool.length;

  return (
    /* Outer sage-green gradient frame */
    <div
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(145deg, #A8BF99 0%, #7C9B6E 50%, #6B8A5E 100%)",
      }}
    >
      {/* Inner white card */}
      <div className="rounded-xl bg-white px-6 py-5">

        {/* Header row */}
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          <span>Recommended Bid Portfolio</span>
          <span>·</span>
          <span className="text-[#5A8A4A]">Active</span>
        </div>

        <div className="my-4 border-t border-zinc-100" />

        {/* Main headline */}
        <p className="text-lg leading-snug text-zinc-800">
          <span className="font-bold">
            {slots.length === 0
              ? "No bids shortlisted"
              : slots.length === 1
              ? "One project"
              : slots.length === 2
              ? "Two projects"
              : `${slots.length} projects`}
          </span>{" "}
          {slots.length === 0
            ? "— recommendations appear here once screening runs."
            : "worth your time, ready for your team."}
        </p>

        {/* Slot rows */}
        {slots.length > 0 && (
          <div className="mt-4 space-y-2">
            {slots.map((slot, index) => (
              <div key={slot.tenderId}>
                <div
                  className="flex items-center justify-between rounded-lg px-4 py-3"
                  style={{ background: "#F5F4F1" }}
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenTender(slot.tenderId)}
                      className="text-left text-sm font-medium text-zinc-800 hover:underline"
                    >
                      {slot.title}
                    </button>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <span className="text-sm text-[#4E7A3A]">
                      {formatEur(slot.value)}
                      {slot.deadline ? ` · ${new Date(slot.deadline).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenSwap(index)}
                      className="text-xs font-semibold text-[#4E7A3A] hover:underline"
                    >
                      ↻ Replace
                    </button>
                  </div>
                </div>

                {swappingSlot === index && (
                  <div className="mt-1 rounded-lg border border-zinc-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-zinc-500">Choose a replacement</p>
                    {swapPool.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-400">No other screened tenders available.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {swapPool.map((candidate) => (
                          <li key={candidate.tenderId}>
                            <button
                              type="button"
                              onClick={() => onChooseReplacement(index, candidate.tenderId)}
                              className="block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              {candidate.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" onClick={onCancelSwap} className="mt-2 text-xs text-zinc-400 hover:underline">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="my-4 border-t border-zinc-100" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Screened this week</span>
          <span className="font-semibold text-zinc-800">
            {totalScanned} projects · {slots.length} shortlisted
            {capacity !== null ? ` / ${capacity} capacity` : ""}
          </span>
        </div>

      </div>
    </div>
  );
}
