# Brainstorm: German tender documents → actionable eligibility suggestion

Date 18.09.2026 11:18 (Europe/Berlin). Submission 15:00 today. Advisory only; nothing changed.

## Contract

- **Outcome.** For a chosen company, every lot on the triage board carries a verdict whose
  reasons come from the *documents* (German quote, file, page) compared against a typed company
  fact, and the judge's unseen tender/company pair takes the same path.
- **Constraints.** ~3.5 h to submission; demo laptop frozen after this morning's tech check
  (no new runtimes on it); ~24 % of document-bearing lots are anonymously fetchable
  (`apps/pipeline/README.md`); OpenRouter is the only model access today; team on free plans.
- **Non-goals.** OCR, DOCX/XLSX, lot-combination optimisation, a local LLM before the deadline,
  any similarity score presented as a verdict.
- **Acceptance.** (1) Switching company on `/` changes the shortlist using Supabase lots, not
  `lib/mock/tenders.ts`. (2) A rejected lot shows a Blocker with `quote_de` + file + page from
  `observations_resolved`. (3) A requirement the buyer stated but no rule checks appears as
  "stated, not checked". (4) A gated portal shows as *Unknown, open portal X*, never as OK.
  (5) `/api/match` returns a result when the model is down (UNCERTAIN, not 502).

## As built (verified in source)

```
eForms notice ─► lots + xpath observations (factsheet.py)
      │
      ├─ rules.py over BT-750 prose ─► rule observations / REFERRED_TO_DOCUMENTS
      │
      └─ document_urls ─► adapters.classify ─► 4 adapters (aumass, RIB, evergabe-online,
           Staatsanzeiger) ─► unpack ZIP ─► sha256 store ─► reader.route (filename regex)
           ─► pdftotext pages ─► ONE model call per routed file, strict JSON, six kinds +
           unmatched + facts ─► quote-substring gate ─► observations
                                   │
              observations_resolved (Postgres view: state, precedence, CONFLICTING)
                                   │
   web: tender/db.ts builds the 15-field fact sheet ─► match/tasks.ts ─► RULE / ONTOLOGY /
        SEMANTIC / REFERENCE / CONSTRAINT matchers ─► matrix ─► VIABLE / REVIEW / BLOCKED
        (persisted in match_*), exposed at POST /api/match
```

## Gaps between "documents are read" and "the judge sees a document-backed reason"

| # | Gap | Evidence | Effect |
|---|---|---|---|
| 1 | Triage board and briefing call `/api/screen`, which screens **mock** tenders with the placeholder engine; `/api/match` (real DB) is called by no page | `apps/web/src/app/page.tsx:62`, `components/tender-review-client.tsx:44`, `app/api/screen/route.ts:31-33` | Nothing extracted from documents reaches the UI. Code and slides would diverge (judging note on fake demos). |
| 2 | Files routed `OTHER` are never read; only `READ` matches are | `reader.py:27-38`, `enrich.py:162-166` | Silent recall loss on Baubeschreibung, Angebotsschreiben, Formblatt 124, Bewerbungsbogen, Nachunternehmer-Erklärung. |
| 3 | Unmatched requirements (Umsatz, Präqualifikation, Versicherung, Personal) are stored but the web reads only the 15 fact attributes | `tender/db.ts:24-40,165-176`; company side already has `revenue_eur`, `company_qualifications` | The document facts that most often decide eligibility never become a task. |
| 4 | Semantic matcher receives a scalar value and **file names**, not the German clause | `tasks.ts:40-43`, `semantic-matcher.ts:69-76` | Model judges "penalty" without seeing the penalty sentence. |
| 5 | Semantic matcher throws 503 when the model is unavailable; `Promise.all` fails the whole evaluation | `semantic-matcher.ts:66-68`, `assemble.ts:248-250` | One OpenRouter hiccup on stage = no verdict at all. |
| 6 | Every `/api/match` run creates a new evaluation and re-calls the model; no cache lookup | `assemble.ts:240,274` | Rate-limit exposure during the live click-through; slow company switch. |
| 7 | `/api/ingest` returns 501; `ingest_jobs` + `claim_ingest_job()` exist, no worker | `app/api/ingest/route.ts` | Unseen tender must be ingested by CLI (`ingest_one`); ingest page errors. |
| 8 | No page selection for long files (promised in pipeline doc Flow 5, not built) | `enrich.py:285` sends the whole file | Blocks reading `OTHER` files safely; cost grows with page count. |

## Options

### A. Wire what exists (integration first, no new ML)

Point `/` and `/tenders/[id]` at `/api/match`; map `MatchEvaluation` onto the `Verdict` shape the
components render (BLOCKED→NoGo, REVIEW→Consider, VIABLE→Bid; FAIL→Blocker, UNCERTAIN→Unknown,
SOFT non-PASS→Risk). Surface `kind='unmatched'` rows and `documents.status` in the briefing.
Pass `quote_de` into semantic tasks. Catch model errors → UNCERTAIN. Reuse the newest
`match_evaluations` row when nothing is newer than `updated_at`.

- Depends on: the Supabase batch already holding `llm_doc` observations for enough open lots in
  the demo companies' regions. Check first: `select key,value from sync_state where key like
  'enrich.%'` and `select count(distinct scope_key) from observations where extractor='llm_doc'`.
- Fails first if: few lots are enriched → run `python -m tender_extract.enrich --limit N` now,
  soonest deadline first (the store is idempotent; a re-run costs nothing).
- Worst case: the shortlist is short but every reason is real and cites a page.

### B. Retrieval-augmented extraction (local embeddings in the pipeline)

Add a stage between `pdftotext` and the model: embed every page of every retrieved file
(including `OTHER`) with **bge-m3** (MIT licence, 8 k tokens, German covered), keep vectors in
`chunks` (pgvector) or a local file, retrieve top-k pages per requirement kind and per unmatched
category using fixed German query sentences, and send only those pages to the extractor. Use the
same vectors to (a) route files by first-page similarity to prototypes instead of filename
regex, (b) collapse duplicate unmatched requirements across files, (c) pre-filter company
references before the reference matcher's model call.

- Depends on: `torch` + `sentence-transformers` install and a ~1 GB model download on the build
  machine (not on the frozen demo laptop), and a batch re-run before 15:00. Neither is installed
  today; the network here has already timed out on a 40 MB ZIP and the CPV codelist.
- Fails first if: install or download stalls → hours gone, no visible change for the judges.
- Worst case: the pipeline is faster and reads more files, but the UI still shows mock data.
- Note: **jina-embeddings-v3 is CC BY-NC 4.0**; fine for a hackathon, awkward in the
  "growth potential" story. bge-m3 is MIT.

### C. Fully local stack (embeddings + local LLM)

bge-m3 retrieval plus a 7–8 B instruct model via Ollama for extraction and semantic matching.
Zero API calls; on-prem story for a Mittelstand contractor whose *company* documents are
confidential (tender documents are public anyway).

- Depends on: a 7 B model producing schema-valid JSON with verbatim quotes that pass the
  substring gate (`llm.gate`). Small models paraphrase; the gate would reject most items.
- Fails first if: quote fidelity → coverage collapses; 1–2 min per file on an M3 Pro.
- Worst case: honest but empty fact sheets. Not for today.

## Recommendation

**A before 15:00. B is the first post-deadline step. C is the roadmap line in the pitch.**

Rationale: the documents are already being read with page-level evidence and a verified gate;
the missing value is entirely in the last metre (gaps 1, 3, 4, 5). Local embeddings improve
*recall and cost* of the reading step but do not change what a judge sees, and they cannot
produce a typed condition or a reason (judging bonus: a similarity score is not a reason). The
extraction and semantic judgement still need a model; "no API calls" only becomes true with C.

Free-plan angle, honestly: the pipeline caches by `(source_id, prompt_version)`, so the whole
batch is a one-off of roughly `fetchable open lots × ~3 routed files` calls, not a rate-limit
problem. The live exposure is the semantic matcher during the demo (gap 6); caching evaluations
per `(tender, company, scope)` removes it without any new model.

### Order for the remaining hours (A)

1. Verify enrichment coverage in Supabase (two queries above). If thin, start
   `enrich --limit` in the background now; it is idempotent.
2. `tender-review-client.tsx` and `page.tsx`: call `/api/match` (with `all_lots` for multi-lot
   procedures); adapt `MatchEvaluation → Verdict` in one small mapper next to `api.ts` so the
   components stay untouched.
3. `semantic-matcher.ts`: catch `CompanyError` → `status: "UNCERTAIN"`, reason "model
   unavailable"; `tasks.ts:40-43`: pass `{doc, page, quote_de}` not `doc` only.
4. `tender/db.ts`: add `unmatched_requirements` (category, quote, locator, page) and
   `documents[]` (url, status, platform) to `TenderDetail`; render as "stated, not checked" and
   "Unknown — open portal X" in the briefing.
5. `assemble.ts`: look up the newest `match_evaluations` row for `(tender_id, company_id,
   scope_id)` before computing; recompute only when a newer observation or company update exists.
6. Leave `/api/ingest` at 501 if time runs out; the pitcher runs `ingest_one <notice-id>` in a
   terminal during Q&A and refreshes the briefing. Say so on the slide.

### Target architecture after the deadline (B, then C)

```
pdftotext pages ─► bge-m3 page vectors (pgvector on chunks)
                     ├─► file router: first-page similarity to {conditions, LV, drawing, form}
                     ├─► per-kind top-k pages ─► extractor (whole-file only when ≤ N pages)
                     ├─► unmatched dedup across files (cosine ≥ τ on quotes)
                     └─► reference pre-filter (company references × project_type)
unmatched categories ─► new task specs: UMSATZ→RULE vs revenue_eur, QUALIFICATION→ONTOLOGY vs
                        company_qualifications, INSURANCE/PERSONNEL→knowledge gap
ingest_jobs worker (Python, SKIP LOCKED) ─► /api/ingest, uploaded PDFs as MANUAL_INPUT sources
Optional on-prem profile: Ollama 7–8 B for company-document extraction first (private data),
tender extraction second (needs gate pass-rate ≥ current before switching).
```

## Flow: per-lot document embeddings as matching-engine context (added 11:30)

Principle: embeddings select which pages a matcher reads; they never produce a status. The
existing quote-substring gate verifies every cited clause.

```
PIPELINE (per lot, after insert_chunks in enrich.read_file)
  pages ─► ~300-token passages (keep source_id + page) ─► bge-m3 dense + sparse
        ─► chunk_embeddings(chunk_id, passage_no, model, vector(1024), sparse)
        ─► lot_context(lot_key, kind, top-k chunk_ids, scores)  one fixed German query per
           requirement kind and per unmatched category; company chunks embedded too

MATCHING ENGINE (per evaluation)
  generateTasks (15 fields) + tasks from observations kind='unmatched'
  ─► context.ts: pages = lot_context[lot_key][kind]; REFERENCE adds dynamic retrieve()
  ─► router unchanged: RULE/ONTOLOGY ignore pages; SEMANTIC gets top-3 pages, must answer
     with chunk_id + verbatim quote, TS gate; REFERENCE ranks company refs by cosine, LLM
     verifies top-N; nothing retrieved + no observation → UNCERTAIN "searched N pages of M files"
  ─► match_results.tender_evidence = chunk ids → UI shows file, page, German quote
```

| piece | where |
|---|---|
| embed stage | new `apps/pipeline/src/tender_extract/embed.py`, called from `enrich.read_file`; idempotent on `(chunk_id, model)`; MPS |
| storage | migration: `create extension vector`; `chunk_embeddings`, `lot_context`; lot scoping via existing `document_files` |
| static retrieval | precompute in `embed.py`; hybrid dense + sparse (reuse `rules.py` keyword sets) so PQ-VOB, DB, §6a survive |
| dynamic retrieval | `POST /retrieve {lot_key, query, k}` FastAPI in the pipeline (fastapi/uvicorn already deps); references only |
| context assembly | new `apps/web/src/lib/match/context.ts`, attaches `pages` to `MatchingTask` |
| semantic matcher | prompt gains `tender_context`; schema gains `evidence[{chunk_id, quote}]`; port `llm.gate` to TS |
| reference matcher | cosine ranking before the LLM loop |
| unmatched tasks | `tasks.ts`: FINANCIAL+number → RULE vs `revenue_eur`; QUALIFICATION → ONTOLOGY vs `company_qualifications`; rest → SEMANTIC |

Decisions: retrieval unit = passage, evidence unit = page (gate unchanged). Static context
precomputed in Python; the web runs no model, so the demo laptop needs no torch. Scale: a few
thousand passages for the open batch, minutes on an M3 Pro, then incremental per lot.

## Re-evaluation against bonus criterion 1 (added 11:40): two ordered layers, retrieval as input only

Current engine has no similarity in the decision path but runs every matcher at once and
feeds the model a scalar plus file names. Reshape into ordered layers:

```
LAYER 1 HARD GATE (deterministic, all lots): region/radius, CPV∩trades, value band, guarantee
  %×value vs capacity, self-perf %, window vs earliest start, deadline, hard exclusions,
  qualification KNOWN_ABSENT → PASS|FAIL|UNKNOWN, two-sided template reason.
  Any HARD FAIL ⇒ BLOCKED, no model call.
LAYER 2 SEMANTIC REASONING (model, surviving lots only): typed condition or quote + pages
  about it + company evidence ids → per-sub-condition PASS|FAIL|UNCERTAIN with verbatim
  tender quote, gated against page text. FAIL ⇒ BLOCKED; UNCERTAIN ⇒ REVIEW + question.
Viability: HARD FAIL→BLOCKED, HARD UNCERTAIN→REVIEW, else VIABLE. Desk order = fewest soft
  concerns, then deadline (stated rule).
Retrieval: keyword floor (rules.py kinds) first, dense embedding adds missed pages; whole
  file when ≤ 5 pages. Never a status.
```

Changes, in judge-visible order: (1) `tender/db.ts` carry `condition` through; drop regex
re-parse in `reference-matcher.ts`. (2) `assemble.ts` deterministic first, skip model when
BLOCKED. (3) `tasks.ts`/`semantic-matcher.ts` pass file/page/quote + page text, require and
gate quotes, errors → UNCERTAIN. (4) unmatched → tasks (FINANCIAL→RULE vs revenue,
QUALIFICATION→ONTOLOGY, rest→layer 2). (5) page selection; embeddings only for OTHER/long
files once documents are in the DB. Items 1–4 need no documents and no model weights.

Data status 11:35: local DB has 0 fetched documents / 0 chunks. `scrape_documents.py` (other
session, same worktree) writes a manifest + content store, not DB rows. Missing bridge:
manifest → `enrich.read_file` + `upsert_document` + `insert_document_files` per lot (~40 lines,
existing functions). bge-m3 weights not yet downloaded (only config/tokenizer landed).

## Unresolved questions

1. How many open lots in Supabase have `llm_doc` observations right now, and do they overlap
   the demo companies' CPV/region? Decides whether step 1 needs a batch run.
2. Is `OPENROUTER_API_KEY` set for the web app on the demo laptop, or only for the pipeline?
   Without it every semantic task is UNCERTAIN (acceptable, but say it).
3. Will the judges' unseen tender be on a gated platform? If likely, uploaded-PDF ingest
   (pseudo-URL through `read_file`) is worth the hour more than anything in B.
