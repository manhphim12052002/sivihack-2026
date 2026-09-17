# Tender data extraction

Pulls German public construction tenders (CPV 45*) from the federal notice
service into one JSON record per **lot**, ready for company-fit screening.

```bash
PYTHONPATH=src python3 -m tender_extract --days 14 --out data/tenders.jsonl
PYTHONPATH=src python3 -m tender_extract --start 2026-09-01 --end 2026-09-16
PYTHONPATH=src python3 -m tender_extract --days 7 --only-open   # drop expired
```

No API key, no account, no rate limit encountered. Data is CC0
(Beschaffungsamt des BMI). Downloaded exports are cached under `data/cache/`
(gitignored); reruns of the same day parse from disk.

## Source

`GET https://oeffentlichevergabe.de/api/notice-exports?pubDay=YYYY-MM-DD&format=eforms.zip`

There is **no search or filter API** — only bulk export by day or month, so CPV,
region and date filtering all happen client-side. `pubDay` must lie strictly in
the past; today's date returns HTTP 400, which the fetcher treats as "not
published yet" rather than an error.

`GET /api/notices/{notice_id}` returns a single notice as eForms XML. That is
how to ingest one tender on demand — e.g. an unseen notice named at judging —
without pulling a whole day.

### Why eForms and not OCDS or CSV

The same export is offered as `eforms.zip`, `ocds.zip` and `csv.zip`. eForms-DE
is the native format; the other two are lossy derivations of it:

| Field | eForms | OCDS | CSV |
|---|---|---|---|
| Submission deadline (Angebotsfrist) | yes | **absent** | **absent** |
| Qualification criteria prose | yes | **absent** | **absent** |
| Exclusion grounds, award criteria | yes | **absent** | partial |
| Estimated value | yes (rare) | yes (rare) | yes (rare) |

The deadline and the eligibility prose are the two things screening most needs,
and only eForms carries them — hence eForms is the only format parsed.

## Record shape

One record per lot, not per notice: a EUR 14M tender may contain a single
EUR 700k lot that fits a small contractor perfectly, and collapsing the notice
to one row would hide exactly the cases that matter. Lot fields fall back to the
notice-level project when absent, which is how eForms expresses "same as
overall". See `LotRecord` in `src/tender_extract/eforms.py` for the full field
list; the screening-relevant groups are:

- **identity / link** — `notice_id`, `lot_id`, `notice_url` (human-openable)
- **what** — `title`, `description`, `cpv_main`, `cpv_additional`, `nature`
- **where** — `place_city`, `place_postcode`, `place_nuts`, buyer address
- **money** — `estimated_value` (rare, see below)
- **when** — `submission_deadline`, `construction_start` / `_end` (Bauzeit)
- **terms** — `award_criteria`, `variants_allowed` (Nebenangebote),
  `guarantee_required`, `tender_validity_days`
- **eligibility** — `exclusion_grounds`, `qualification_text`, `prose_signals`
- **documents** — `document_urls`, `has_documents`

`prose_signals` flags which German screening terms appear in the eligibility
prose (`referenzen`, `praequalifikation`, `buergschaft`, `eigenleistung`,
`bauzeit`, `vertragsstrafe`, `bietergemeinschaft`, `umsatz`) — a pointer to
where a hard disqualifier is likely hiding, not a verdict.

CPV codes are normalised to 8 digits: buyers publish them both bare
(`45233120`) and with the check digit (`45233120-8`), and left mixed a prefix
filter silently misses half the matches. Filler values (`-`, `.`, `k.A.`,
`entfällt`) are nulled so a non-null field can be trusted.

## What the data actually contains

Measured over 14 days of publications (2026-09-03 … 2026-09-16): 10,612 notices
of all kinds, of which **3,201 construction lots** in open calls for tenders —
roughly 230 per day nationally.

**Two feeds of very different richness arrive in the same export**, distinguished
by `schema_profile`:

| Field | national sub-threshold (`eforms-sdk-0.1`, n=1781) | EU-threshold (`eforms-de-2.1`, n=1408) |
|---|---|---|
| Submission deadline | 94% | 93% |
| Document links | 99% | 100% |
| Region (NUTS) | 87% | 99% |
| CPV at 8 digits | 52% | 100% |
| Construction period | 5% | 75% |
| Award criteria | 2% | 84% |
| Qualification prose | 1% | 94% |
| Exclusion grounds | 0% | 85% |
| Estimated value | 0% | 11% |

Two consequences for screening:

1. **Contract value is essentially absent** — under 5% overall. Every example
   company screens on contract size, so that number cannot come from notice
   metadata. It has to be read out of the documents (the Leistungsverzeichnis
   quantities) or estimated, and a screener must treat "value unknown" as the
   normal case rather than an exception.
2. **The sub-threshold feed — the majority of lots, and exactly the mid-size
   work the example companies bid on — carries almost no eligibility metadata**,
   while 99% of it does link to documents. Reading the documents is therefore
   not a bonus refinement for these; it is the only way to screen them at all.

Award notices are excluded by default (`--kind competition`). The national feed
labels some finished awards as calls for tenders, so those are additionally
dropped on their German title marker ("Vergebener Auftrag",
"Transparenzbekanntmachung"); the run reports the count as
`dropped_awarded_by_title`.

## Known limits

- `place_nuts` granularity is mixed — some notices give `DE2` (Bavaria), others
  `DE21H` (a district). Match by prefix, never by equality.
- Document URLs point at ~5+ regional e-procurement platforms with very
  different anonymous access. See
  `plans/reports/researcher-260917-1547-tender-data-sources.md` for which were
  confirmed downloadable without login.
- 8 lots of 3,201 (0.2%) carry a submission deadline earlier than their own
  publication date — a source error, mostly in the national feed. `--only-open`
  filters them out along with genuinely expired ones.
- 21 lots in the 14-day window were republished corrections; only the first
  occurrence encountered is kept. Version-aware deduplication is not implemented.
- TED (`api.ted.europa.eu/v3/notices/search`) is not wired up. It only covers
  above-EU-threshold contracts, already present here via the `eforms-de-2.1`
  feed, so it would add coverage only for non-German buyers.
