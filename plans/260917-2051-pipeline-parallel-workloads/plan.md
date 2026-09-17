---
title: "Tender pipeline end to end: parallel workloads to a golden dataset in Supabase"
description: "Ticket graph with blocking edges for finishing poll → load → enrich → screen → serve, landing the golden dataset in Supabase before the 18.09 15:00 submission"
status: accepted
priority: P0
effort: "~14h wall clock, 3 people in parallel"
tags: [sivihack, track-2, pipeline, supabase, parallel]
created: 2026-09-17
spec: plans/260917-1945-tender-ingestion-pipeline/prd.md, docs/tender_document_pipeline.md, docs/adr/0001–0004
---

# Pipeline end to end → golden dataset in Supabase

Written 17.09 20:51. Submission 18.09 15:00 (~18h). Tech check 18.09 morning; no config changes after.

## What "golden dataset" means here (acceptance)

Supabase Postgres holds, and `supabase/seed.sql` snapshots:

1. **`lot`**: every lot of every notice version from the 14-day CPV-45 batch (3,201 lots today) plus
   anything polled since; `lot_latest` view = one row per lot.
2. **`source`**: one row per notice version and per fetched document (url, sha256, status, platform).
3. **`observation`**: immutable rows per ADR 0001; `xpath` rows for all lots; `rule`/`llm_doc`/`llm_notice`
   rows for the enriched slice (union of lots surviving region+CPV for the 3 seeded companies).
4. **`chunk`**: page text for every retrieved document, so evidence quotes are checkable offline.
5. **`document`**: fetch status per (lot, url): `retrieved | gated | unreachable | scanned | skipped`, platform named.
6. **`company`** ×3 seeded, **`verdict`** cache for each company × enriched lot, and the three shortlists differ.
7. `observation_resolved` view implements precedence + CONFLICTING; `unknown` is never `OK`.

## Decisions (confirmed 17.09 21:00)

- **Supabase Postgres** replaces the PRD's SQLite. Record as **ADR 0005** in W0.2. Offline fallback: `supabase start` + `supabase/seed.sql` on the demo laptop (W5.4).
- **LLM:** Claude Sonnet via OpenRouter (`OPENROUTER_MODEL=anthropic/claude-sonnet-5`); a GPT model is the swap-in if Sonnet misbehaves on German JSON. One env var, no code change.
- **Two builders, not three.** Backend A runs W0 → W1 → W3 in sequence; backend B runs W2 from W0 onward. W3.1 (`screen()` golden tests) is pure Python with no DB and is the one W3 ticket backend B or the web owner can pull forward while A is on W1.
- **Unseen tender handover is text-based** (URL, notice id, or pasted text). PDF upload is P2. `POST /ingest` gains an additive `text` field (W3.5).

Trade-off accepted with the Supabase decision:

| | SQLite (PRD) | Supabase (this plan) |
|---|---|---|
| Offline demo (PRD story 43/51, venue wifi) | free | needs `supabase start` (Docker) + committed `seed.sql`, or a hotspot |
| Job queue / concurrent writers | single writer | `FOR UPDATE SKIP LOCKED`, API + worker + CLI write concurrently |
| Team sharing during the hack | copy a file | one shared DB, everyone loads/enriches into it |
| Resolution view | SQL view | SQL view, same |
| Reviewer verifiability | clone & run | clone, `supabase start`, `db reset` from migrations + seed |

**Serving layer stays FastAPI** implementing the contract the web is already built against
(`apps/web/src/lib/api-types.d.ts`). `supabase-js` in the web is optional (realtime job progress only);
rules must not be duplicated in TypeScript (ADR 0003: one pure `screen()` function, in Python).

## Workstreams and owners

| id | workstream | owner | file ownership | detail |
|---|---|---|---|---|
| W0 | Foundations: gitignore fix, Supabase schema, Python project, ADR 0005 | backend A (1h, solo, first) | `supabase/`, `pyproject.toml`, `src/tender_extract/db.py`, `.gitignore`, `docs/adr/0005*` | [phase-00](./phase-00-foundations.md) |
| W1 | Acquisition + load: poll, load, backfill, eForms fixes, parse tests | backend A | `src/tender_extract/{fetch,poll,load,eforms,factsheet}.py`, `tests/test_parse_notice.py` | [phase-01](./phase-01-acquisition-and-load.md) |
| W2 | Documents + enrich: adapters, router, pdftotext, LLM extraction, evidence check | backend B | `src/tender_extract/{documents,adapters/,reader,llm,rules,enrich}.py` | [phase-02](./phase-02-documents-and-enrich.md) |
| W3 | Decision + API: `screen()`, company normalisation, FastAPI, job worker, ingest-one | backend A after W1.3; W3.1 may be pulled by B or web owner | `src/tender_extract/{screen,templates,company}.py`, `apps/api/`, `tests/test_screen.py` | [phase-03](./phase-03-decision-and-api.md) |
| W4 | Web wiring: commit `lib/`, regenerate types, unmatched list, click-through | web owner | `apps/web/**` | [phase-04](./phase-04-web-wiring.md) |
| W5 | Curation + seed: 3 profiles, tracer tender, README, `seed.sql`, slides | curator | `data/companies/`, `README.md`, `supabase/seed.sql`, slides | [phase-05](./phase-05-curation-and-seed.md) |

## Dependency graph (blocking edges only)

```
W0.1 gitignore fix ──────────────► W4.1 commit lib, build passes
W0.2 schema + ADR 0005 ─┬────────► W1.1 port load to Postgres ──► W1.3 batch loaded ──► W2.6 enrich batch ──► W3.6 precompute verdicts
                        ├────────► W2.1 fetch/adapters (fixture-driven, no DB needed until W2.5)
                        ├────────► W3.1 screen() golden tests (fixture fact sheets, no DB)
                        └────────► W3.3 FastAPI over Postgres ──► W4.2 regenerate types ──► W4.4 live click-through
W0.3 pyproject + db.py ──────────► W1, W2, W3 (import path)
W5.1 tracer tender chosen ───────► W2.2 filename router fixture, W2.4 LLM prompt fixture
W5.2 three profiles ─────────────► W3.1 golden tests, W3.6 precompute
W3.5 job worker + ingest-one ────► W4.3 ingest page live
W1.3 + W2.6 + W3.6 ──────────────► W5.4 seed.sql dump ──► freeze
```

Everything not on an edge runs in parallel. W1, W2, W3.1 and W5 can all start the moment W0 lands.

## Milestones (Europe/Berlin)

| when | milestone | proves |
|---|---|---|
| 17.09 22:00 | **M0** W0 merged: schema applied to Supabase, `tests/` runs, web builds | everyone unblocked |
| 18.09 02:00 | **M1 tracer bullet**: one real procedure (aumass.de lot) poll→load→enrich→screen, visible on `/tenders/[id]` from Supabase | the whole path is real |
| 18.09 09:00 | **M2 batch**: 3,201 lots loaded; enriched slice done; 3 company shortlists differ | the golden dataset exists |
| 18.09 12:00 | **M3 live**: unseen notice URL/id/text via `/ingest`, unseen company via `/companies`, both end on the briefing page | generalises for judges |
| 18.09 13:00 | **M4 freeze**: `seed.sql` committed, README, tech check, no more config changes | submission-safe |

## Rules of the road

- Tracer bullet before breadth (pipeline doc §7). Every ticket lands a thin vertical slice, not a layer.
- `ingest-one` **is** `load` + `enrich` on one notice. No parallel code path.
- Per ticket: `/tdd` for the two pure seams (`parse_notice`, `screen`), `/code-review` before commit,
  Conventional Commits, no secrets. `poll`, adapters and the LLM client are verified by running, not unit tests (PRD).
- `store.py`, `load.py`, `factsheet.py` are untracked in the main checkout. Their author commits them
  before W1.1 ports them; nobody else stages them.
- Never commit `.env`, `data/cache/`, `data/documents/`.

## Risks

| risk | mitigation | owner |
|---|---|---|
| Venue network down → hosted Supabase unreachable | `supabase start` + `supabase/seed.sql` on the demo laptop, rehearsed at M4; hotspot as second fallback | W5 |
| Search index endpoint changes shape | `backfill` over documented bulk export already works (`fetch.py`) | W1 |
| LLM key/model not chosen; OpenRouter down | rules-only fallback, everything else `Unknown` (ADR 0003); model picked in W0 | W2 |
| Document coverage ~24.5% (two probe rounds) | say so on stage; per-company readable counts exceed 3 | W5 |
| Three people touching one DB | additive migrations only; observations immutable; `load`/`enrich` idempotent | W0 |

## Unresolved questions

None. Demo laptop runs Docker, so the offline fallback is local Supabase (W5.4). Unseen tender handover assumed text-based
(URL, notice id, pasted text); confirm with Arctis on site, and move W3.5's P2 upload path up only if they bring PDFs.
