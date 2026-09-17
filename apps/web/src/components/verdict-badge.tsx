import type { Overall } from "@/lib/status";
import { OVERALL_STYLES } from "@/lib/status";

/** Overall tender verdict pill (Bid / Consider / No-go) — colours defined once in status.ts. */
export function VerdictBadge({ overall }: { overall: Overall }) {
  const style = OVERALL_STYLES[overall];
  return (
    <span className={`inline-block rounded px-2 py-1 text-sm font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}
