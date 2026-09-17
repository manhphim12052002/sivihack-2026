## Phase Implementation Report

### Executed Phase
- Phase: phase-03-web-pages-and-typed-client
- Plan: /Users/m.pham/orca/projects/sivihack-2026/plans/260917-1933-track-2-boilerplate-api-and-web-apps
- Status: completed

### Files Modified
- Created `apps/web/src/lib/api.ts` (113 lines) — typed fetch wrapper (`ApiError`, `checkHealth`, `api.*`), all types re-exported from `components["schemas"][...]` in `api-types.d.ts`, no hand-written parallel shapes.
- Created `apps/web/src/lib/status.ts` (62 lines) — single source for `STATUS_STYLES` (Blocker red / Risk amber / OK green / Unknown grey), `OVERALL_STYLES` (Bid green / Consider amber / NoGo red), `CONFIDENCE_STYLES`, `JOB_STAGE_LABELS`, `formatEur` (de-DE).
- Created `apps/web/src/components/verdict-badge.tsx` (12), `criterion-table.tsx` (68), `fact-sheet.tsx` (88), `company-form.tsx` (175), `ingest-dropzone.tsx` (63), `job-progress.tsx` (61), `api-offline-banner.tsx` (39).
- Rewrote `apps/web/src/app/layout.tsx` (56) — title "Three Out of Forty", nav Triage · Companies · Ingest, global `<ApiOfflineBanner />`, base font pinned to 16px.
- Rewrote `apps/web/src/app/page.tsx` (182) — triage board: client component, company selector from `GET /companies`, re-screens on change via `POST /screen`, groups verdicts into On the desk (top `capacity_per_week` Bids) / Other Bids / Consider / No-go, joins tender metadata from `GET /tenders`.
- Created `apps/web/src/app/tenders/[id]/page.tsx` (135) — server component; header facts, checklist (via `POST /screen` narrowed to one tender with `tender_ids`), fact sheet, documents list with `docs_retrieved`; prompts to pick a company when `?company=` absent.
- Created `apps/web/src/app/companies/page.tsx` (135) — paste-or-file → `POST /companies` → editable form → `PUT`; lists existing companies.
- Created `apps/web/src/app/ingest/page.tsx` (82) — files or notice URL → `POST /ingest`, polls `GET /jobs/{id}` every 2s, stage stepper, link to briefing on `done`.

### Tasks Completed
- [x] `api.ts` + offline banner on `/health` failure (client-side poll every 10s, global in layout; server component on `/tenders/[id]` shows its own inline error since SSR fetch failures can't reach the client banner).
- [x] Triage page: company selector, shortlist grouping, re-screens without reload.
- [x] Briefing page: checklist table first, fact sheet second, documents list.
- [x] Companies page: paste → normalized → editable form → save; list of existing companies.
- [x] Ingest page with 2s polling stepper and done-link.
- German terms on first use: Referenzen, Bauzeit, Bürgschaft, Vertragsstrafe, Eigenleistung, Angebotsfrist, Vergabeunterlagen — all present in `fact-sheet.tsx` / tender header / documents section.
- Evidence-or-"not found in documents" rendering in both `criterion-table.tsx` and `fact-sheet.tsx`.
- No mock/invented verdicts or tenders anywhere; every render path either shows real API data or an honest empty/error/offline state.

### Tests Status
- Type check: pass (`npm run build` runs `tsc` internally — clean, one fix needed: `job-progress.tsx` indexed against the full `JOB_STAGES` array instead of the `.filter()` result, whose element type TS 5.9's inferred-predicate narrowing had shrunk to exclude `"error"`).
- Lint: pass (`npm run lint` clean). One fix needed: the newer `react-hooks/set-state-in-effect` rule (bundled in `eslint-config-next` 16) flagged `setLoading(true)`/`setError(null)` called synchronously at the top of an effect body; moved them into an inner `async function runScreen()` invoked from the effect, which is the pattern the rule accepts, and dropped the synchronous `setVerdicts(null)` branch in favor of a derived `effectiveVerdicts` value.
- Build: pass — `next build` produces `/`, `/companies`, `/ingest` as static, `/tenders/[id]` as dynamic (server-rendered, since it does a live no-store fetch).
- Runtime: started `next dev` on a scratch port (3100, chosen because 3000 was occupied by an unrelated project's dev server not belonging to this task — left untouched) with the API not running. Verified all four routes return HTTP 200 and the nav renders "Triage · Companies · Ingest" / "Three Out of Forty"; `/tenders/does-not-exist` correctly surfaces "Could not reach the API at http://localhost:8000. Is it running?" instead of fabricating a tender. Stopped the scratch dev server afterward (port 3100 confirmed free). `GET /health` against `localhost:8000` timed out (API not running in this session) — client-side offline banner and the triage/companies/ingest empty states were verified by code review only, not by clicking through a browser.

### Issues Encountered
- `job-progress.tsx`: TypeScript inferred a narrower element type for `JOB_STAGES.filter((s) => s !== "error")` (new "inferred type predicate" behavior), so indexing that array with a full `JobStage` failed; fixed by indexing the unfiltered `JOB_STAGES` instead (order is preserved, `"error"` is last, so indices still line up for step display).
- `eslint-plugin-react-hooks`'s `set-state-in-effect` rule (new in this Next/eslint-config-next version) required restructuring the triage page's screen-refetch effect to call `setState` only from inside a nested async function, not directly in the effect body.
- Port 3000 was already occupied by an unrelated app ("VN Ams Badminton" dev server) — did not touch it; used port 3100 for my own verification run only, and killed that process when done.
- API (`apps/api`) was not running during implementation or verification, per the phase's own risk note — all four pages were only exercised against the offline path.

### Next Steps
- Once `apps/api` (phase 2) is up on `localhost:8000` with CORS allowing `localhost:3000`, do a live click-through: switch companies on `/`, confirm shortlist changes, open a briefing, run an ingest.
- Phase 4 (wire-up/smoke run) can add screenshots for slides once real verdicts exist, per the phase's own step 6 (explicitly out of scope here).

No unresolved questions.
