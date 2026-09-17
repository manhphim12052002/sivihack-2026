"use client";

import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";

const RECHECK_INTERVAL_MS = 10000;

/**
 * Global banner shown whenever GET /health fails. Never falls back to mock
 * data — an offline API means the pages show empty/error states honestly.
 */
export function ApiOfflineBanner() {
  // null = not checked yet; avoids flashing the banner before the first check resolves.
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const ok = await checkHealth();
      if (!cancelled) setOnline(ok);
    }

    poll();
    const interval = setInterval(poll, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (online !== false) return null;

  return (
    <div className="w-full bg-red-600 px-4 py-2 text-center text-base font-medium text-white">
      API offline — start the API (see README) to see live tenders, companies, and verdicts.
    </div>
  );
}
