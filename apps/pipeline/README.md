# Tender pipeline

Python package `tender_extract`: pulls eForms notices from the oeffentlichevergabe.de bulk
export, parses construction lots (CPV 45*), and loads lots, sources and immutable observations
into the Supabase Postgres schema in `../../supabase/migrations/` (see `docs/adr/0001`). `db.py`
is the only module that talks to the database.

## Setup and run (from the repo root)

```bash
uv venv .venv && uv pip install -e apps/pipeline           # Python 3.12 via .python-version
.venv/bin/python -m tender_extract --help                  # CLI; data paths are relative to the repo root
.venv/bin/python -m unittest discover -s apps/pipeline/tests -t apps/pipeline
```

`cd apps/pipeline && ../../.venv/bin/python -m unittest` runs the same tests. They use the
stdlib only and never touch a database or the network.

## Pipeline commands (need `DATABASE_URL`)

```bash
python -m tender_extract.load --zip data/cache/2026-09-16-eforms.zip   # one cached day → lots, sources, xpath observations
python -m tender_extract.load --cache data/cache                       # every cached day (the 14-day batch)
python -m tender_extract.backfill --start 2026-09-03 --end 2026-09-16  # download missing days, then load them
python -m tender_extract.poll                                          # lot search index from the sync_state watermark
python -m tender_extract.poll --since 2026-09-17T00:00:00Z             # override the watermark once
```

All three writers are idempotent: re-running upserts the same lot rows and inserts no new
observations. `poll` keeps `poll_watermark` and `last_poll_at` in `sync_state`; `load` and
`backfill` record `load.last_run_at` and `load.dropped_awarded_by_title`. Read screening
candidates from the `lots_current` view (newest version per notice, corrigenda collapsed);
`lots_latest` keeps every notice id.

## Enrich and ingest-one (need `DATABASE_URL`; the model stage needs `OPENROUTER_API_KEY`)

```bash
python -m tender_extract.enrich --all-rules            # extraction rules over BT-750 prose of every current lot
python -m tender_extract.enrich --limit 300            # documents + model over open, fetchable lots, soonest deadline first
python -m tender_extract.enrich --lot <lot_key>        # one lot, rules + documents + model
python -m tender_extract.ingest_one <notice-id|url>    # the live path: fetch, load, enrich one unseen notice
python -m tender_extract.ingest_one <notice-id> --text pasted.txt   # plus pasted notice text as a MANUAL_INPUT source
```

`enrich` is idempotent: a document already extracted with the current `prompt_version` is not sent to
the model again, and a package already retrieved for a lot is not downloaded again. Without the model
key the model stage reports `model_unavailable` and everything else still runs (ADR 0003 fallback).
Downloaded files live in the gitignored content-addressed store `data/documents/<sha256>.<ext>`.

## Reading the data (contract for downstream owners)

Nothing in this pipeline ranks or decides. It stores what the sources state, with evidence, and
says what it does not know. Status vocabularies are uppercase.

| question | read | query |
|---|---|---|
| Screening candidates, one row per lot at its newest version, corrigenda collapsed | `lots_current` | `select * from lots_current where submission_deadline >= now() order by submission_deadline` |
| Every notice id at its newest version (superseded originals included) | `lots_latest` | `select * from lots_latest where notice_id = $1` |
| Fact sheet and requirements for a lot | `observations_resolved` | `select * from observations_resolved where scope_key in ($lot_key, $procedure_key)` (PROCEDURE-scoped rows are not auto-inherited by a lot; include `$procedure_key` in the `IN` list yourself to see them; `state` and `confidence` are separate axes) |
| Evidence behind a value | `observations_resolved.evidence` | jsonb array of `{source_id, extractor, locator, page, quote, value}`; `locator` is `xpath:BT-…` for notice fields or `<file>#p.<page>` for documents |
| Why a requirement is unknown | `documents` | `select status, platform from documents where lot_key = $1` (`RETRIEVED`, `GATED`, `UNREACHABLE`, `SCANNED`, `SKIPPED`); a `REFERRED_TO_DOCUMENTS` row plus a `GATED` document means "open the portal" |
| Conditions the buyer stated that no rule checks | `observations` | `select category, value_text, evidence_quote, locator from observations where kind = 'unmatched' and scope_key in (...)` (`attribute` is `<category>#<hash>` to keep every item; read `category`) |
| Page text a quote came from | `chunks` | `select text from chunks where id = $1` (`<source_id>#p<page>`) |
| What is fresh, what the batch contained | `sync_state` | `select * from sync_state order by key` (`last_poll_at`, `poll_watermark`, `load.*`, `enrich.*`) |
| Enqueue an unseen notice | `ingest_jobs` | `insert into ingest_jobs (id, payload) values ($1, '{"reference": "<notice id or url>"}')`; a worker must run what `python -m tender_extract.ingest_one` runs |

States: `KNOWN` a value with evidence; `NOT_FOUND` a document was read and does not state it;
`REFERRED_TO_DOCUMENTS` the notice defers to documents not (yet) read; `CONFLICTING` two sources at the
same precedence disagree, no value is shown. Confidence (`high` xpath, `medium` rule and model over a
document, `low` model over notice text, `not_found`) is derived from the extractor, never asked of the model.
Coverage on the 14-day batch: deadline 93.8%, place 95.7%, estimated value 4.9% from the notice;
about 24% of document-bearing lots are on anonymously downloadable platforms.

## Extra document scrape (no database needed)

`data/extra_doc.json` is a Supabase export of `(buyer_name, document_urls, notice_ids)` for the
five MVP buyers. `scrape_documents` downloads every package those URLs point at through the
platform adapters, keeps each file once in `data/documents/<sha256>.<ext>` (gitignored) and
writes one manifest entry per URL to `data/extra_doc_files.json` (committed): status
`RETRIEVED | GATED | UNREACHABLE`, platform, reason, package name and size (name is null for
per-file listings such as RIB), and per file its
name inside the package, sha256, size, local path and `reader.route` (`READ | SKIP | OTHER`).
Nothing is filtered: drawings are stored too; the route tells a reader what to open.

```bash
python -m tender_extract.scrape_documents --sample 1          # first URL of every buyer
python -m tender_extract.scrape_documents --buyer Hamburg     # one buyer
python -m tender_extract.scrape_documents                     # every URL; re-runs skip RETRIEVED ones
```

Verified 18.09: DB InfraGO and Schulbau Hamburg (Healy Hudson `evergabe.bieter`, package ZIP from
`api/supplier/subproject/<uuid>/projectFilesZip`), Gemeinde Anröchte (cosinex VMPSatellite,
`documents/archive/*.zip`), München (RIB, per-file links) and Gemeinde Obersulm (vergabe24
Direkt-Kiosk: choosing the package variant leads to a "Download ohne Registrierung" step; no
contact data is entered, one ZIP per variant) download anonymously.

## CPV descriptions (optional; not fetched by default)

The notice states only the CPV code (`45311200`), never its label. `cpv.py` resolves the
label from the eForms SDK's own codelist (`codelists/cpv.gc`, pinned to SDK 1.15.1 --
the same distribution `docs/specifications/eforms-de/` is tailored from), and
`factsheet.lot_row` puts it in `lots.extra.cpv_descriptions` when present. Absent gracefully
(`{}`) when the codelist has never been fetched -- nothing else in the pipeline depends on it.

```bash
python -m tender_extract.cpv --fetch    # once: downloads data/reference/cpv.gc (~32MB, gitignored)
python -m tender_extract.cpv --check    # prints the row count and a sample
```

Not verified against the real file in this session (the network could not sustain the
download); see the module docstring for what to check once it has been fetched.

## Environment variables (names only; values live in an untracked env file)

- `DATABASE_URL` — Postgres DSN read by `tender_extract.db.connect()`; `supabase start` prints a local one.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — LLM extraction over notice text and documents.
