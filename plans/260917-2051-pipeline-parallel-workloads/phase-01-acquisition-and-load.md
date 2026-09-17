# W1 · Acquisition and load (backend A, after W0)

**Goal:** every CPV-45 lot from the last 14 days, plus anything published since, sits in Supabase as
`lots` rows and `xpath` observations, with a poll watermark so the next run costs one request.
**Spec:** PRD "Source and acquisition", "Extractor bugs to fix as part of load"; ADR 0002.

## Status (17.09 23:10, branch `manhphim12052002/w1-acquisition-and-load`)

All six tickets done; verified against a local `supabase start` stack, not yet run against the hosted project.

| ticket | result |
|---|---|
| W1.1 | `load --zip` loads one day in ~1 s; re-run inserts 0 observations, counts unchanged |
| W1.2 | 23 tests green (`tests/test_parse_notice.py`); CLI still writes 3,201 lots to `data/tenders.jsonl` |
| W1.3 | 14 days → `lots` 3,222, `lots_latest` 3,201, `observations` 19,733; deadline 93.8%, value 4.9%; `sync_state.load.dropped_awarded_by_title = 72` |
| W1.4 | `poll` run 1 fetched 1 new notice version, run 2 fetched 0; watermark + `last_poll_at` in `sync_state` |
| W1.5 | `backfill --start --end` over two cached days: same counts, 0 new observations |
| W1.6 | same-id versions resolve correctly (`25758778` v2→v3, `a1771259…` v1→v3). Finding below. |

Findings for W2/W3:
- **Corrigenda come in two shapes.** The national profile bumps the version under the same notice id
  (`lots_latest` handles it). The EU-threshold profile publishes a **new notice id** and points back with
  BT-758; 430 amended lot rows in the batch, 88 predecessors present. New view **`lots_current`**
  (`supabase/migrations/20260917230000_lots_current.sql`) = `lots_latest` minus superseded predecessors
  (3,113 rows). W2.6 should enrich `lots_current`; the W3.5 read contract should point downstream owners at it
  and name `changed_notice_id` as the amended marker (always `<predecessor id>-<version>` for both profiles).
- `lots.published` is NULL for the thin profile (no IssueDate in eforms-sdk-0.1). The poll stub carries
  `publicationDate`; not written to `lots` to keep one load path. The W3.5 read contract should say: fall back to `ingested_at`.
- BT-750 prose is stored as a **LOT-scoped** `selection_criteria_text` observation (not PROCEDURE as this
  ticket said: the observations primary key includes the source, so two notice versions of one procedure
  would resolve to CONFLICTING instead of the newer text winning; a lot key is per version), and per lot in
  `lots.qualification_text` and `lots.extra.selection_criteria` (with the `slc-*` code). Rules (W2.3) can read either.
- `active` is not sent in the poll query: measured on lots since 16.09, `active=true` trims 1,074 → 1,022 and
  keeps every `can-*` award notice, so it is a deadline filter, not a competition filter. Poll skips award
  stubs by `noticeType` before fetching instead (values match the eForms subtype codes, verified live).
- Stub identity pinned live: 40 of 41 `cn-standard` stubs of 16.09 matched stored `(notice_id, notice_version,
  lot_id)`; rich ids are bare UUIDs with zero-padded versions, national ids bare integers.
- The lot search endpoint is `POST https://oeffentlichevergabe.de/bkmk/searches`; single notice is
  `GET /api/notices/<bare id>?format=eforms&noticeVersion=<v>`. Both in `fetch.py`.

## Existing code to reuse
- `apps/pipeline/src/tender_extract/eforms.py` — `parse_notice(xml_bytes) -> list[LotRecord]`, namespace map `NS`, CPV/NUTS/placeholder normalisation, awarded-title heuristic.
- `apps/pipeline/src/tender_extract/fetch.py` — `fetch_day` (bulk export, becomes `backfill`), `fetch_notice(notice_id)` (single eForms notice, the live path), polite `USER_AGENT`.
- Untracked in main, author commits first: `load.py` (load_notice_bytes, load_zip), `factsheet.py` (15 attributes → xpath claims, `DOCUMENT_ONLY`), `store.py` (SQLite; superseded by `db.py`).

## Tickets

### W1.1 · Port `load` to Postgres — blocked by W0.2, W0.3
- Swap `store` for `db` in `load.py`; `factsheet.xpath_claims` output gains `scope_type`, `scope_key`, `kind='fact'`,
  `state='KNOWN'`, `source_id='notice:<id>:<version>'`; register the notice as a `sources` row first (Flow 4).
- Procedure-scoped facts (buyer, procedure type, BT-750 prose) stored once with `scope_type='PROCEDURE'`.
- Acceptance: `python -m tender_extract.load --zip data/cache/<day>.zip` loads one day; re-run changes zero rows.

### W1.2 · eForms fixes, namespace-URI XPaths, parse tests — no blockers, can start before W0
- Fix the five fields (PRD table): **BT-750** selection-criteria description (highest priority; it is the references
  criterion's only notice source), BT-758 changed-notice id, BT-33 lots-max-awarded path, BT-13(d), BT-541.
- Verify every XPath resolves by namespace URI; add a fixture where UBL binds to `ns3:`/`ns5:`.
- `apps/pipeline/tests/test_parse_notice.py` over `data/format-comparison/*` (5 rich, 5 thin): BT-750 read; CPV → 8 digits; thin profile
  yields a lot with absent fields, no crash; `ns3:` fixture parses identically to `cbc:`. Use `/tdd`.
- Acceptance: tests green; `python -m tender_extract --days 14` still writes `data/tenders.jsonl`.

### W1.3 · Batch load — blocked by W1.1
- Load the cached 14-day export (3,201 lots) into Supabase. Record dropped-as-awarded count in `sync_state`.
- Acceptance: `select count(*) from lots_latest` ≈ 3,201; `select attribute, count(*) from observations where extractor='xpath' group by 1`
  matches `factsheet.coverage` numbers within the PRD's measured shares (deadline ~94%, value ~5%).
- Unblocks: W2.6, W3.2.

### W1.4 · `poll` command — blocked by W1.1
- `apps/pipeline/src/tender_extract/poll.py`: POST the lot-search query (PRD JSON envelope) with `publicationDate >= watermark`,
  ISO timestamps only, `active` as JSON boolean, page size 100, `ORDER publicationDate DESC`; diff stubs on
  `(notice_id, notice_version, lot_id)` against `lots`; for each delta `fetch_notice` → `load_notice_bytes`; advance
  watermark in `sync_state` only after the page is loaded. Single-threaded, sleep between pages, identifying UA.
- Set `sync_state.last_poll_at` for `/health`.
- Acceptance: run twice; second run fetches only notices published in between (log shows the delta count).

### W1.5 · `backfill` command — blocked by W1.1 (small)
- Thin wrapper: `backfill --start --end` = `fetch_day` + `load_zip`. Same code path as W1.3.

### W1.6 · Amendment resolution check — blocked by W1.3
- Find a notice in the batch with two versions (BT-758 populated). Confirm `lots_latest` shows the later one and
  `changed_notice_id` links it to the earlier one. Adjust `lots_latest` ordering if versions are not lexically sortable.

## Validation
- `python -m unittest tests.test_parse_notice`; row counts above; one real amended notice resolves correctly.

## Risks
- Search index shape drift → W1.5 remains the fallback. Rate-limit 429 → back off, do not parallelise.
