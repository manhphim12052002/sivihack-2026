---
title: "Scrape the Vergabeunterlagen behind data/extra_doc.json (5 buyers, 4 portal stacks)"
status: sample-verified (1 URL per buyer); full run pending
priority: P0
created: 2026-09-18 11:30
tags: [sivihack, track-2, pipeline, documents]
inputs: data/extra_doc.json (112 document URLs, 5 buyers)
outputs: data/documents/<sha256>.<ext> (gitignored files), data/extra_doc_files.json (committed manifest)
---

# Extra document scrapers

## Outcome

For every `document_urls` entry in `data/extra_doc.json`, fetch every downloadable file the portal
serves anonymously, keep it in the content-addressed store `data/documents/` and describe the result
in one manifest `data/extra_doc_files.json`: which files came from which URL for which buyer and
notice ids, with size, sha256, local path and filename route (`READ`/`SKIP`/`OTHER`). Where the
portal will not serve files without a form, say so with the file names it lists.

## Probe evidence (18.09, live, `curl`, pipeline user agent, GET only)

| buyer | URLs | host / stack | anonymous path found | status |
|---|---|---|---|---|
| DB InfraGO AG (Bukr 16) | 39 | `bieterportal.noncd.db.de` — Healy Hudson eVergabe V4.9 SPA | `GET /evergabe.bieter/api/supplier/subproject/<uuid>/projectFilesZip` → `application/zip`, 43 MB, `Vergabeunterlagen_26FEI87031.zip`. Endpoint read from the SPA's webpack chunk 611 (`getAllProjectFilesZipDownloadUrl`). `.../attachment/contractnotice` gives the notice PDF. `details/<alias>` is 401 (login) — not needed. | RETRIEVABLE |
| SBH Schulbau Hamburg | 19 | `fbhh-evergabe.web.hamburg.de` — same stack | same endpoint → 200, 23 MB ZIP | RETRIEVABLE |
| Landeshauptstadt München, Baureferat | 18 | `www.meinauftrag.rib.de` (RIB, Bayern backend) | existing `adapters/rib.py` — 36 per-file links on the sample | RETRIEVABLE (adapter exists) |
| Gemeinde Anröchte | 15 | `www.vergabe-westfalen.de` — cosinex VMPSatellite | `/notice/<id>/documents` → 302 → `/VMPSatellite/public/company/project/<id>/de/documents`; page links `./documents/archive/Vergabeunterlagen_<id>.zip` → 200, 13.5 MB, no cookie needed. Corrects ADR 0004's probe: cosinex `/documents` URLs are NOT gated. | RETRIEVABLE |
| Gemeinde Obersulm | 20 | `www.vergabe24.de` → `europa.vergabe24.de` Direkt-Kiosk | Detail page → `site=order` lists package variants; POSTing only the variant id to `step=1` reaches "Download ohne Registrierung" with `download.php?token=…` → ZIP (100 MB, 127 files on the sample). No contact data entered. Expired lots have no order form → UNREACHABLE. | RETRIEVABLE (adapter `vergabe24.py`) |

Closed lots: the DB deeplink for an expired subproject answers `SubProject.NotAvailable`; 8 of 39 DB URLs have deadlines before today. Recorded as UNREACHABLE with that reason.

## Design (KISS, reuse `documents.py` + `adapters/`)

1. **Two new adapters, same `Adapter` signature** (`(url, wanted) -> [(filename, bytes)]`):
   - `adapters/evergabe_bieter.py` — subproject uuid from the deeplink URL, host kept, GET `projectFilesZip`; raise on non-ZIP. Package limit raised for this stack (DB packages exceed the 80 MB default) via a per-adapter `max_bytes`.
   - `adapters/cosinex.py` — follow the `/notice/<id>/documents` redirect, take `documents/archive/*.zip` from the page (fallback: build `…/de/documents/archive/Vergabeunterlagen_<id>.zip`), GET it.
   - `adapters/vergabe24.py` — GET the detail page and the order page, return the listed file names; no form is posted. Used by the scraper for the manifest's `listed_files`; `fetch_documents` keeps treating the host as GATED.
2. **`adapters.classify`**: path-based rules before the host map — `/evergabe.bieter/` → ADAPTER (evergabe_bieter), `VMPSatellite/notice/…/documents` → ADAPTER (cosinex, was GATED); drop `bieterportal.noncd.db.de` from `JS_SHELL_HOSTS`. `enrich` benefits automatically.
3. **`scrape_documents.py`** (new CLI, `python -m tender_extract.scrape_documents`):
   - reads `data/extra_doc.json`, parses the Postgres array literal `{url}`, groups by URL, keeps buyer + notice ids;
   - per URL: adapter → `documents.unpack` → `documents.store_file` (dedup by sha256) with `wanted=None` (all files, drawings included — the user asked for every downloadable document); `reader.route(name)` recorded per file for downstream;
   - writes `data/extra_doc_files.json` after every URL (crash-safe), idempotent: URLs already `RETRIEVED` in the manifest are skipped unless `--refresh`; `--buyer <substring>`, `--limit N`, `--sleep` (1 s default), `--store`;
   - never raises per URL: `RETRIEVED | GATED | UNREACHABLE` with `platform` and `reason`.
4. **Manifest entry shape**
   ```json
   {"buyer_name": "...", "document_url": "...", "notice_ids": ["..."], "platform": "bieterportal.noncd.db.de",
    "status": "RETRIEVED", "reason": null, "package": {"filename": "Vergabeunterlagen_….zip", "bytes": 43417191},
    "files": [{"name": "Bekanntmachung/Auftragsbekanntmachung.pdf", "sha256": "…", "bytes": 1384173,
               "ext": "pdf", "path": "data/documents/<sha256>.pdf", "route": "SKIP"}],
    "listed_files": [], "fetched_at": "2026-09-18T11:40:00+00:00"}
   ```
5. **Tests** (stdlib unittest, no network): array-literal parsing; evergabe_bieter ZIP URL derivation for both hosts; cosinex archive URL from a saved page snippet and the fallback; vergabe24 file-name listing from a saved HTML fixture; `classify` for the three URL shapes; manifest merge/skip logic.
6. **Docs**: `apps/pipeline/README.md` gets a short "Extra document scrape" section; ADR 0004 gets a dated note that cosinex `/documents` and Healy Hudson `projectFilesZip` are plain HTTP after all.

## Non-goals

- No Supabase writes (the manifest is the deliverable; `enrich` can later reuse the store since paths are content-addressed).
- No form posting on vergabe24; no browser; no OCR/reading of the files.
- No change to `fetch_documents`' filter for `enrich` (drawings still skipped there).

## Acceptance

- `python -m tender_extract.scrape_documents --limit 2 --buyer Hamburg` downloads two packages and the manifest lists their files with sha256 and paths that exist.
- Full run over the 112 URLs finishes; manifest has one entry per URL; Obersulm entries are `GATED` with `listed_files` non-empty where the kiosk page listed them; expired DB lots are `UNREACHABLE` with `SubProject.NotAvailable`.
- Existing 62 tests plus the new ones pass: `uv run --project apps/pipeline python -m unittest discover -s apps/pipeline/tests -t apps/pipeline`.
- Re-running the CLI downloads nothing new (`skipped` count = retrieved count).

## Risks

- Package sizes (20–45 MB × ~70) → ~2–3 GB and 20–40 min on venue wifi; `--limit`/`--buyer` allow batches; store is gitignored.
- Portal rate limits: 1 s sleep between URLs, 3 retries already in `http_get`.

## Result (18.09 11:50, `--sample 1`)

| buyer | status | files | MB | READ-routed |
|---|---|---|---|---|
| DB InfraGO | RETRIEVED | 147 | 75 | 3 (Bewerbungsbedingungen, Besondere Vertragsbedingungen, …) |
| Schulbau Hamburg | RETRIEVED | 7 | 29 | 0 |
| Gemeinde Anröchte | RETRIEVED | 12 | 15 | 0 |
| München Baureferat | RETRIEVED | 20 | 98 | 1 (Eignung) — one >80 MB drawing skipped |
| Gemeinde Obersulm | RETRIEVED | 127 | 100 | 0 |

75 tests pass. Re-run skips all 5. Full run (`python -m tender_extract.scrape_documents`, 112 URLs,
est. 2–4 GB) not started: user scoped to the sample.
