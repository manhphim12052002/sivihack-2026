---
phase: 3
title: "Web pages and typed client"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Web pages and typed client

## Overview
The four screens from the design, rendering whatever the API returns, including `Unknown`
everywhere on day one. Owner: web person. Runs in parallel with phase 2 against the phase-1
contract; use the API's `/health` to show an offline banner rather than mock data.

## Requirements
- Functional:
  - `/` triage: company selector (from `GET /companies`), calls `POST /screen`, shows shortlist (top `capacity_per_week`) then Consider then No-go; each row: title, buyer, place, value, overall badge, count of Blocker/Risk/Unknown.
  - `/tenders/[id]?company=` briefing: header facts, checklist table (criterion, status, reason_en, tender evidence quote_de + doc/page, company fact, kind numeric|semantic), fact sheet section with confidence per field, documents list with `docs_retrieved` flag.
  - `/companies`: textarea paste or file drop → `POST /companies`; shows normalized profile as an editable form → `PUT`.
  - `/ingest`: file drop (PDF/ZIP) or notice URL → `POST /ingest`; poll `GET /jobs/{id}` every 2 s; stage stepper; link to briefing when done.
- Non-functional: English labels, German terms in parentheses on first use (Referenzen, Bauzeit, Bürgschaft…); readable at projector scale (base 16px+); no client-side scoring.

## Architecture
`src/lib/api.ts` thin fetch wrapper typed with `api-types.d.ts`; server components for reads,
client components for forms and polling; `NEXT_PUBLIC_API_URL` default `http://localhost:8000`.
Status → colour tokens in one place (`src/lib/status.ts`).

## Related Code Files
- Create: `apps/web/src/lib/api.ts`, `src/lib/status.ts`
- Create: `src/app/page.tsx`, `src/app/tenders/[id]/page.tsx`, `src/app/companies/page.tsx`, `src/app/ingest/page.tsx`
- Create: `src/components/{verdict-badge,criterion-table,fact-sheet,company-form,ingest-dropzone,job-progress}.tsx`
- Modify: `src/app/layout.tsx` (nav: Triage · Companies · Ingest)

## Implementation Steps
1. `api.ts` + offline banner on `/health` failure.
2. Triage page with company selector and shortlist grouping.
3. Briefing page: checklist table first, fact sheet second.
4. Companies page: paste → normalized → editable form → save.
5. Ingest page with polling stepper.
6. Screenshot pass for slides once real verdicts appear (phase 4).

## Success Criteria
- [x] All four routes render with the phase-2 API running
- [x] Switching company on `/` changes the shortlist without reload
- [x] Briefing shows a German quote with page for any criterion that has evidence, and "not found in documents" for `Unknown`
- [x] Ingest page reaches `done` and links to the new tender

## Risk Assessment
API not ready when web starts → phase 1 contract + `/health` banner; never invent mock verdicts
(judges review the code). Tailwind defaults look generic → fine for now, polish is phase 4+.
