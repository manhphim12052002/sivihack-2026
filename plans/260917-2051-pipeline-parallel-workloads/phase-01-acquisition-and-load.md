# W1 · Acquisition and load (backend A, after W0)

**Goal:** every CPV-45 lot from the last 14 days, plus anything published since, sits in Supabase as
`lot` rows and `xpath` observations, with a poll watermark so the next run costs one request.
**Spec:** PRD "Source and acquisition", "Extractor bugs to fix as part of load"; ADR 0002.

## Existing code to reuse
- `apps/pipeline/src/tender_extract/eforms.py` — `parse_notice(xml_bytes) -> list[LotRecord]`, namespace map `NS`, CPV/NUTS/placeholder normalisation, awarded-title heuristic.
- `apps/pipeline/src/tender_extract/fetch.py` — `fetch_day` (bulk export, becomes `backfill`), `fetch_notice(notice_id)` (single eForms notice, the live path), polite `USER_AGENT`.
- Untracked in main, author commits first: `load.py` (load_notice_bytes, load_zip), `factsheet.py` (15 attributes → xpath claims, `DOCUMENT_ONLY`), `store.py` (SQLite; superseded by `db.py`).

## Tickets

### W1.1 · Port `load` to Postgres — blocked by W0.2, W0.3
- Swap `store` for `db` in `load.py`; `factsheet.xpath_claims` output gains `scope_type`, `scope_key`, `kind='fact'`,
  `state='KNOWN'`, `source_id='notice:<id>:<version>'`; register the notice as a `source` row first (Flow 4).
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
- Acceptance: `select count(*) from lot_latest` ≈ 3,201; `select attribute, count(*) from observation where extractor='xpath' group by 1`
  matches `factsheet.coverage` numbers within the PRD's measured shares (deadline ~94%, value ~5%).
- Unblocks: W2.6, W3.6, W5.4.

### W1.4 · `poll` command — blocked by W1.1
- `apps/pipeline/src/tender_extract/poll.py`: POST the lot-search query (PRD JSON envelope) with `publicationDate >= watermark`,
  ISO timestamps only, `active` as JSON boolean, page size 100, `ORDER publicationDate DESC`; diff stubs on
  `(notice_id, notice_version, lot_id)` against `lot`; for each delta `fetch_notice` → `load_notice_bytes`; advance
  watermark in `sync_state` only after the page is loaded. Single-threaded, sleep between pages, identifying UA.
- Set `sync_state.last_poll_at` for `/health`.
- Acceptance: run twice; second run fetches only notices published in between (log shows the delta count).

### W1.5 · `backfill` command — blocked by W1.1 (small)
- Thin wrapper: `backfill --start --end` = `fetch_day` + `load_zip`. Same code path as W1.3.

### W1.6 · Amendment resolution check — blocked by W1.3
- Find a notice in the batch with two versions (BT-758 populated). Confirm `lot_latest` shows the later one and the
  API (W3.3) shows an amended marker. Adjust `lot_latest` ordering if versions are not lexically sortable.

## Validation
- `python -m unittest tests.test_parse_notice`; row counts above; one real amended notice resolves correctly.

## Risks
- Search index shape drift → W1.5 remains the fallback. Rate-limit 429 → back off, do not parallelise.
