---
title: "Tender data pipeline: parallel workloads to a golden dataset in Supabase"
description: "Ticket graph with blocking edges for finishing poll → load → enrich, landing the golden dataset in Supabase before the 18.09 15:00 submission. Data pipeline only: notice sources → DB."
status: in-progress
priority: P0
effort: "~12h wall clock, 2 builders in parallel"
tags: [sivihack, track-2, pipeline, supabase, parallel]
created: 2026-09-17
updated: 2026-09-17 23:00 (rescoped to the data pipeline; decision rules, API and web wiring removed)
spec: plans/260917-1945-tender-ingestion-pipeline/prd.md, docs/tender_document_pipeline.md, docs/adr/0001–0005
---

# Tender data pipeline → golden dataset in Supabase

Written 17.09 20:51, rescoped 23:00. Submission 18.09 15:00. Tech check 18.09 morning.

## Scope

**In:** everything from a public notice source to rows in Supabase: acquisition (`poll`, `backfill`),
`load` (eForms → `lots` + `xpath` observations), `enrich` (rules over notice prose, document fetch, page
text, model extraction with evidence gate), `ingest-one` for an unseen notice, the seed snapshot, and a
written read contract for whoever consumes the data.

**Out (owned elsewhere):** the Bid/No-Bid decision rules, verdict caching, company profiles, any HTTP
API, the job worker that drains `ingest_jobs`, and the web app. The schema keeps `companies`,
`verdicts` and `ingest_jobs` as the contract those owners rely on; this plan does not write to them.

## What "golden dataset" means here (acceptance)

Supabase Postgres holds, and `supabase/seed.sql` snapshots:

1. **`lots`**: every lot of every notice version from the 14-day CPV-45 batch (3,201 lots today) plus
   anything polled since; `lots_latest` view = one row per lot.
2. **`sources`**: one row per notice version and per fetched document (url, sha256, status, platform).
3. **`observations`**: immutable rows per ADR 0001; `xpath` rows for all lots; `rule` rows wherever notice
   prose matched; `llm_doc`/`llm_notice` rows for the enriched slice (open lots with readable documents).
4. **`chunks`**: page text for every retrieved document, so evidence quotes are checkable offline.
5. **`documents`**: fetch status per (lot, url): `RETRIEVED | GATED | UNREACHABLE | SCANNED | SKIPPED`, platform named.
6. `observations_resolved` returns a value, `CONFLICTING`, `REFERRED_TO_DOCUMENTS` or `NOT_FOUND` for
   every (scope, attribute) that has rows; missing data is never a value.
7. `sync_state` holds the poll watermark and the batch totals (lots loaded, documents by status, model
   calls, rejected items) so the numbers on stage come from the database.

## Decisions (confirmed 17.09)

- **Supabase Postgres** (ADR 0005), shared schema with the company-intelligence pipeline, plural table
  names. Offline fallback: `supabase start` + `supabase/seed.sql` on the demo laptop (Docker confirmed).
- **LLM:** Claude Sonnet via OpenRouter (`OPENROUTER_MODEL=anthropic/claude-sonnet-5`), GPT as swap-in.
- **Unseen tender handover is text-based**: `ingest-one` takes a notice URL or id (P1); pasted notice text
  as a source is P2.
- **Enrich slice without company profiles:** open lots (`submission_deadline >= today`) whose document
  URLs resolve to a supported plain-HTTP adapter, ordered by deadline, `--limit N`. Rules over notice
  prose run for every lot; the model runs only on that slice.

## Workstreams and owners

| id | workstream | owner | file ownership | status | detail |
|---|---|---|---|---|---|
| W0 | Foundations: layout, Supabase schema, `db.py`, ADR 0005 | backend A | `supabase/`, `apps/pipeline/`, root `pyproject.toml` | **done** (PR #4) | [phase-00](./phase-00-foundations.md) |
| W1 | Acquisition + load: `poll`, `load`, `backfill`, eForms fixes, parse tests | backend A | `apps/pipeline/src/tender_extract/{fetch,poll,load,eforms,factsheet}.py`, `apps/pipeline/tests/test_parse_notice.py` | todo | [phase-01](./phase-01-acquisition-and-load.md) |
| W2 | Documents + enrich: adapters, router, pdftotext, rules, model extraction, evidence gate, `enrich`, `ingest-one` | backend B | `apps/pipeline/src/tender_extract/{documents,adapters/,reader,llm,rules,enrich,ingest_one}.py`, `apps/pipeline/tests/test_rules.py`, `tests/test_evidence_gate.py` | todo | [phase-02](./phase-02-documents-and-enrich.md) |
| W3 | Seed + handoff: tracer tender, batch totals, `seed.sql`, offline rehearsal, read contract | backend A after W1.3 (tracer pick can be anyone, now) | `data/tracer.md`, `supabase/seed.sql`, `apps/pipeline/README.md` | todo | [phase-03](./phase-03-seed-and-handoff.md) |

## Dependency graph (blocking edges only)

```
W0 (done) ───────────────► W1.1 port load to Postgres ──► W1.3 batch loaded ──► W2.6 enrich the slice ──► W3.2 totals ──► W3.3 seed.sql
                    └─────► W2.1 fetch/adapters (fixture-driven; DB needed only from W2.5)
W3.1 tracer tender chosen ─► W2.2 router fixture, W2.4 model prompt fixture
W1.1 + W2.5 ──────────────► W2.7 ingest-one CLI
W1.3 + W2.6 ──────────────► W3.4 offline rehearsal, W3.5 read contract
```

Everything not on an edge runs in parallel. W1.2 (parse fixes + tests) and W2.1–W2.4 need no database.

## Milestones (Europe/Berlin)

| when | milestone | proves |
|---|---|---|
| 18.09 01:30 | **M1 tracer bullet**: one real procedure (aumass.de lot) `load` → `enrich`, rows visible in `observations_resolved` with quotes and pages | the whole path is real |
| 18.09 08:00 | **M2 batch**: 3,201 lots loaded; rules over all prose; model over the readable open slice; totals in `sync_state` | the golden dataset exists |
| 18.09 10:30 | **M3 unseen**: `ingest-one <url>` on a notice not in the store lands in under a minute | generalises for judges |
| 18.09 12:30 | **M4 freeze**: `seed.sql` committed, offline `supabase db reset` rehearsed, read contract written | submission-safe |

## Rules of the road

- Tracer bullet before breadth (pipeline doc §7). Every ticket lands a thin vertical slice.
- `ingest-one` **is** `load` + `enrich` on one notice. No parallel code path.
- Per ticket: `/tdd` for the pure seams (`parse_notice`, extraction rules, the evidence gate),
  `/code-review` before commit, Conventional Commits with scope `pipeline`, no secrets. `poll`, adapters
  and the model client are verified by running them (PRD testing decision).
- `store.py`, `load.py`, `factsheet.py` are untracked in the main checkout. Their author commits them
  under `apps/pipeline/src/tender_extract/` before W1.1 ports them; nobody else stages them.
- Never commit the env file, `data/cache/`, `data/documents/`.

## Risks

| risk | mitigation | owner |
|---|---|---|
| Venue network down → hosted Supabase unreachable | local `supabase start` + `seed.sql`, rehearsed at M4 | W3 |
| Search index endpoint changes shape | `backfill` over the documented bulk export already works | W1 |
| OpenRouter down or key missing | rules-only, everything else `NOT_FOUND`/`REFERRED_TO_DOCUMENTS` (ADR 0003) | W2 |
| Document coverage ~24.5% (two probe rounds) | totals in `sync_state`, stated plainly in the read contract | W3 |
| Two builders on one DB | additive migrations only; observations immutable; `load`/`enrich` idempotent | all |

## Unresolved questions

None for this scope. Hosted Supabase project creation and `DATABASE_URL` are a human step; until then
both workstreams develop and test against the local stack.
