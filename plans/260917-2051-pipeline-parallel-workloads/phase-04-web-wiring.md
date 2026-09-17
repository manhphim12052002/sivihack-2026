# W4 · Web wiring (web owner; W4.1 now, rest after W3.3)

**Goal:** the four screens run against the real API and Supabase-backed data; nothing mocked; unmatched
requirements and the four states are visible; `npm run build` and `lint` clean.

## Tickets

### W4.1 · Build passes from a fresh clone — blocked by W0.1
- Confirm `apps/web/src/lib/{api.ts,status.ts,api-types.d.ts}` are tracked; `npm ci && npm run build && npm run lint`.
- Decide `@supabase/supabase-js`: remove if unused, or keep only for realtime `ingest_job` progress instead of 2s polling
  (optional; polling already works). Rules never move to TypeScript (ADR 0003).

### W4.2 · Regenerate types from the live contract — blocked by W3.3
- `npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.d.ts`; fix compile errors from the three additions
  (`Fact.state`, `unmatched_requirements`, `CriterionResult.lot_id`).

### W4.3 · Render state and unmatched requirements — blocked by W4.2
- `fact-sheet.tsx`: show `state` as text (`Unknown · referred to documents (gated, evergabe.nrw.de)`, `read, not stated`, `conflicting`),
  confidence chip unchanged. `tenders/[id]`: "Stated, not checked" list from `unmatched_requirements` with quote, doc, page.
- Contractor role labelled "inferred from CPV breadth". Estimated value not used as a sort key (PRD honesty note).

### W4.4 · Live click-through and screenshots — blocked by W3.4, W3.5
- Acceptance criteria from `docs/design.md`: pick Brenner & Sohn → shortlist; open a NoGo → Blocker with German quote, doc, page;
  switch to Hanseatische Bau → different shortlist without reload; ingest an unseen URL → stepper → briefing; paste an unseen company.
- Screenshots at 1280px for slides (W5.5).

## Validation
- `npm run build`, `npm run lint`; the five click-through steps recorded as a short GIF or screenshots.
