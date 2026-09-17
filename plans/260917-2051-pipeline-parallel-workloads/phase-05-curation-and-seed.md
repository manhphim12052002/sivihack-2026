# W5 · Curation, seed and pitch (curator; starts now, in parallel with W0)

**Goal:** the inputs the pipeline needs from humans exist early (profiles, tracer tender), the golden dataset is
snapshotted for offline use, and README + slides match the code.

## Tickets

### W5.1 · Choose the tracer-bullet procedure — no blockers, do first (30 min)
- From `data/tenders.jsonl`, pick one open `plattform.aumass.de` lot with a conditions PDF (`Vertragsbedingungen|Teilnahme|Eignung`
  in the package) and, ideally, more than one lot. Write notice id, URL, lot ids and why into `data/tracer.md`.
- Hand to W2 (fixture) and W1.6 if it has an amended version.

### W5.2 · Three company profiles as prose + typed JSON — no blockers
- `data/companies/{brenner-sohn,hanseatische-bau,<third>}.md` prose (as a bid manager would write it) and `.json` in the
  `CompanyProfile` shape from `api-types.d.ts`. Make them differ on region, contract band, guarantee capacity and references so
  the shortlists must differ (design acceptance 2). Use Track-2 Appendix A company profiles as the base.
- Feeds W3.1 golden tests and W3.2 normalisation check.

### W5.3 · README skeleton now, final at freeze — no blockers
- What it is, setup (env variable names only, never values), `supabase start` / `db reset`, run API + web, pipeline commands
  (`backfill`, `poll`, `enrich --for-company`, `ingest-one`), data sources and licences (CC0), known limitations
  (coverage ~24.5%, value absent ~95%, no OCR, gated platforms named), test command.

### W5.4 · Seed snapshot and offline rehearsal — blocked by W1.3, W2.6, W3.6
- `supabase db dump --data-only -f supabase/seed.sql` (exclude `chunks` if it pushes the repo over size; keep it if under ~50MB).
- On the demo laptop (Docker confirmed available): `supabase start`, `supabase db reset` (migrations + seed), API pointed at the local `DATABASE_URL`, web up,
  wifi off, run the click-through. This is the fallback rehearsal for the venue-network risk.
- Acceptance: the click-through passes with wifi off, except live ingest, which needs network by nature.

### W5.5 · Slides and Q&A split — blocked by W4.4 screenshots
- 5-minute arc: problem → "eligibility, not similarity" → how (structured → rules → model extracts → templates explain) →
  demo → value. State the coverage number before a judge asks. Assign Q&A owners: technical (backend A), AI/extraction (backend B),
  business/value (curator), design decisions (web owner).

### W5.6 · Freeze checklist (18.09 13:00)
- `git status` clean on main; seed committed; env file present on the laptop; tech check done; no further config changes.

## Validation
- Offline rehearsal passes; README commands copy-paste from a fresh clone.
