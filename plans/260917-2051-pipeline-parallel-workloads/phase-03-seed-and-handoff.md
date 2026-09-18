# W3 · Seed and handoff (backend A after W1.3; W3.1 can be done by anyone now)

**Goal:** the pipeline's inputs that need a human exist early (the tracer tender), the golden dataset
is snapshotted for offline use, the numbers the team quotes come from the database, and whoever owns
the decision rules, API or web knows exactly what to read.

## Status (18.09 01:10, branch `manhphim12052002/w2-w3-enrich-and-seed`)

| ticket | result |
|---|---|
| W3.1 | `data/tracer.md`: notice `0f60a327-2519-4e0a-8bf6-eca4edeb1fde` (aumass, EU threshold, open until 19.10, all five prose signals present). Its document package could not be downloaded here (network); the fixture bullet says so and how to finish it. |
| W3.2 | `sync_state` has every number the ticket lists except the document/model-stage ones, which are 0 because W2.6 did not run: `load.lots_loaded` (3222), `load.dropped_awarded_by_title` (72), `enrich.lots.count`/`lots_latest.count`/`lots_current.count`, `enrich.observations.xpath` (19931) and `.rule` (1616), `enrich.lots_with_retrieved_document` (0), `enrich.last_run.model_calls` (0), `enrich.sources.rejected_items` (0). |
| W3.3 | `supabase/seed.sql` (30MB, data-only) committed. Verified live: `supabase db reset` from clean migrations + this file reproduces every `sync_state` number exactly. Holds the 14-day batch (xpath) plus the rule stage (mirrored onto the fact sheet, see phase-02) — no document or model observations, since W2.6 did not run. |
| W3.4 | Not run as a rehearsal (needs the demo laptop). The read-contract queries below were run against the live seed and confirmed correct, including the extractor-precedence case: a lot with both an xpath `guarantees=true` and a rule-derived `guarantees=5%` resolves to the xpath value, per ADR 0001. |
| W3.5 | `apps/pipeline/README.md` "Reading the data" section written and every query verified against the live seed. |
| W3.6 | Not applicable yet — freeze is 18.09 12:30 per the plan; W2.6 (documents/model batch) is the remaining blocker before a freeze would be meaningful. |

**Follow-ups before the demo:**
- Run `python -m tender_extract.enrich --limit 300` (W2.6) from a normal network connection with an
  LLM access credential configured, then re-dump `supabase/seed.sql` — the current seed has no
  document or model observations.
- Apply `supabase/migrations/` to the hosted project (still only verified against local `supabase start`)
  and reload the batch there.

## Tickets

### W3.1 · Choose the tracer-bullet procedure — no blockers, do first (30 min)
- From `data/tenders.jsonl`, pick one open `plattform.aumass.de` lot with a conditions PDF
  (`Vertragsbedingungen|Teilnahme|Eignung` in the package) and, ideally, more than one lot. Write notice
  id, URL, lot ids and why into `data/tracer.md`. Hand to W2 (fixture) and W1.6 if it has an amended version.

### W3.2 · Batch totals in `sync_state` — blocked by W1.3, W2.6
- After the batch: lots loaded, lots in `lots_latest`, dropped-as-awarded, documents by status, lots with
  at least one `RETRIEVED` document, model calls, rejected items, observations by extractor. Written by
  `load`/`enrich` themselves, not by hand.
- Acceptance: `select * from sync_state` answers every number that will be said on stage.

### W3.3 · Seed snapshot — blocked by W3.2
- `supabase db dump --data-only -f supabase/seed.sql` (drop `chunks` from the dump only if it pushes the
  repo past ~50MB; note it in the README if so).
- Acceptance: fresh clone → `supabase start && supabase db reset` reproduces the counts in `sync_state`.

### W3.4 · Offline rehearsal — blocked by W3.3
- On the demo laptop (Docker confirmed available): `supabase start`, `supabase db reset`, wifi off,
  run the read-contract queries below and `ingest-one` against a cached notice. Live `ingest-one` needs
  network by nature.

### W3.5 · Read contract for downstream owners — blocked by W1.3, W2.6
- Section "Reading the data" in `apps/pipeline/README.md`: which view answers which question, with one
  query each:
  - one row per lot at its newest version → `lots_latest`
  - fact sheet for a lot → `observations_resolved where scope_key in (lot_key, procedure_key)`,
    procedure rows inherited by the reader; `state` and `confidence` are separate axes
  - evidence for a value → the `evidence` jsonb array (source_id, locator, page, quote)
  - why a requirement is unknown → `documents.status` + `platform` for the lot
  - unmatched requirements → `observations where kind = 'unmatched'`
  - what is fresh → `sync_state.last_poll_at`
  - how to enqueue an unseen tender → insert into `ingest_jobs (id, payload)`; the CLI
    `ingest-one` is the reference implementation of what a worker must run
- State plainly: coverage numbers, uppercase status vocabularies, what `NOT_FOUND` vs
  `REFERRED_TO_DOCUMENTS` mean, and that nothing in this pipeline ranks or decides.

### W3.6 · Freeze checklist (18.09 12:30)
- `git status` clean on main; seed committed; env file present on the laptop; no further config changes.

## Validation
- Offline rehearsal passes; README queries copy-paste against the seeded local database.
