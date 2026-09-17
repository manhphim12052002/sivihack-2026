"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile } from "@/lib/api";

/** Dropdown company selector — the triage/review pages' entry point for "screen as company X". */
export function CompanyPicker({
  companies,
  value,
  onChange,
}: {
  companies: CompanyProfile[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = companies.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full max-w-xs">
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Company</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-base font-semibold shadow-sm"
      >
        <span>{selected ? selected.name : companies.length === 0 ? "No companies yet" : "Select a company"}</span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open && companies.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => {
                onChange(company.id);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-base hover:bg-zinc-50 ${
                company.id === value ? "bg-[var(--biddesk-accent-soft)] font-semibold" : ""
              }`}
            >
              <span className="block">{company.name}</span>
              {company.home_base && <span className="block text-xs text-zinc-500">{company.home_base}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
