# Arctis Tender Intelligence --- Document Pipeline Specification

> **Status (17.09.2026, after design review).** This is the target design. The shipped v1 shape
> is the schema in `plans/260917-1945-tender-ingestion-pipeline/prd.md` (`lot`, `claim`,
> `document`, `company`, `verdict`) plus the deltas listed under Flow 13. Vocabulary follows
> `CONTEXT.md`: *Procedure* and *Lot* are the two scope levels; "tender" is UI copy only.
> Storage is Supabase Postgres per `docs/adr/0005-supabase-postgres-over-sqlite.md` (schema in
> `supabase/migrations/`), superseding the SQLite file named below.
> Section 5a says what starts each stage; section 7 says which flows are code and which are
> prose for the hackathon.
> Resolution rules are recorded in `docs/adr/0001-immutable-observations-read-time-resolution.md`.

## 1. Goal

Given **one public procurement notice** from ÖffentlicheVergabe plus its
linked **Vergabeunterlagen**, transform heterogeneous and messy
procurement data into a **canonical, evidence-backed tender
representation** that can be consumed by a separate company-matching and
Bid/No-Bid decision pipeline.

ÖffentlicheVergabe publishes the same submission as eForms, CSV and OCDS. eForms is the
publisher's original format and the only one carrying the submission deadline and the
eligibility prose (see `docs/tender-data-extraction.md`), so **v1 reads eForms only**. The
normalization layer (eForms XML → `NormalizedNotice`) is real code; aggregating a second format
into an enriched intermediary dataset is a future extension, to be built when a concrete field
gap appears (candidate: OCDS release history for amendments).

The document pipeline ends at the **Resolved Procedure**. It does **not**
decide whether a specific company should bid.

------------------------------------------------------------------------

# 2. High-Level Architecture

``` text
                    ÖFFENTLICHEVERGABE
                            │
                            │
                         eForms        (CSV / OCDS: future aggregation)
                            │
                            ▼
                   NOTICE NORMALIZATION
                            │
                            ▼
                    NORMALIZED NOTICE
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
    STRUCTURED EXTRACTION             DOCUMENT LINKS
             │                             │
             │                             ▼
             │                    FETCH VERGABEUNTERLAGEN
             │                             │
             │                    PDF / DOCX / XLSX
             │                             │
             │                             ▼
             │                       PARSE + CHUNK
             │                             │
             │                             ▼
             │                     LLM EXTRACTION
             │                             │
             │                    Facts + Requirements
             │                             │
             └──────────────┬──────────────┘
                            ▼
                    SEMANTIC NORMALIZATION
                            │
                            ▼
                     DEDUPLICATE + MERGE
                            │
                            ▼
                AMENDMENT / CONFLICT RESOLUTION
                            │
                            ▼
                  CONFIDENCE + PROVENANCE
                            │
                            ▼
                    RESOLVED PROCEDURE
                            │
                            ▼
                            DB
```

------------------------------------------------------------------------

# 3. MVP Requirements

  -------------------------------------------------------------------------
  ID                      Requirement             Acceptance Criterion
  ----------------------- ----------------------- -------------------------
  DP1                     Ingest notice           Accept a notice from
                                                  ÖffentlicheVergabe in
                                                  eForms, CSV, or OCDS

  DP2                     Normalize notice        Equivalent notices map
                          formats                 into the same internal
                                                  representation regardless
                                                  of source format

  DP3                     Deterministic           Extract structured fields
                          structured extraction   such as buyer, title,
                                                  CPV, location, dates,
                                                  lots, award criteria, and
                                                  document URLs without an
                                                  LLM where possible

  DP4                     Preserve tender/lot     Procedure-level and
                          hierarchy               lot-level information
                                                  remain separate and every
                                                  fact/requirement has a
                                                  scope

  DP5                     Detect notice           Capture
                          versions/amendments     correction/amendment
                                                  relationships and notice
                                                  versions

  DP6                     Discover procurement    Extract links to linked
                          documents               Vergabeunterlagen

  DP7                     Ingest heterogeneous    Fetch accessible
                          documents               documents; MVP requires
                                                  PDF, with DOCX/XLSX
                                                  desirable

  DP8                     Produce                 Parsed content retains
                          evidence-addressable    document and exact source
                          chunks                  location

  DP9                     Extract atomic facts    Free text can produce
                                                  structured factual
                                                  observations

  DP10                    Extract atomic          Extract arbitrary
                          requirements            eligibility, financial,
                                                  technical, contractual,
                                                  execution, and submission
                                                  requirements

  DP11                    Normalize semantics     Different wording
                                                  representing the same
                                                  concept maps to a common
                                                  ontology

  DP12                    Preserve provenance     Every extraction points
                                                  to actual source evidence

  DP13                    Merge corroborating     Duplicate/corroborating
                          information             observations become a
                                                  canonical item with
                                                  multiple evidence sources

  DP14                    Resolve amendments      Authoritative newer
                                                  information may supersede
                                                  older information without
                                                  deleting history

  DP15                    Represent               Missing, ambiguous,
                          uncertainty/conflicts   referred, conflicting,
                                                  superseded, etc. are
                                                  explicit states

  DP16                    Compute explainable     Confidence is derived
                          confidence              after extraction/merging
                                                  from evidence signals,
                                                  not an arbitrary LLM
                                                  probability

  DP17                    Persist canonical       Store tender, lots,
                          tender                  facts, requirements,
                                                  sources, evidence,
                                                  history, and unresolved
                                                  items for downstream use
  -------------------------------------------------------------------------

**v1 reading of the table.** DP1/DP2: eForms only. DP7: PDF only; DOCX/XLSX are P2. DP11, DP13,
DP14, DP16: satisfied in v1 by the read-time resolution view (Flow 8/9) and extractor-derived
confidence (Flow 11), not by dedicated stages. DP15: four states (Flow 10).

------------------------------------------------------------------------

# 4. Core Data Concepts

## 4.1 Facts

A Fact is a descriptive statement about the Procedure or Lot. The decision pipeline may compare
a Fact against a company constraint (place vs. regions, CPV vs. trades, value vs. contract band),
but that does not make it a Requirement.

Examples:

-   Location = Gaimersheim
-   CPV = 45221112
-   Execution start = 2026-11-02
-   Submission deadline = 2026-09-17 10:00
-   Price award weight = 85%

## 4.2 Requirements

A Requirement is a condition the buyer imposes on the bidder or the bid — there is a *muss* /
*hat … zu* sentence behind it in the source. The test is normative wording, not whether the
decision pipeline compares it.

**v1 has a closed set of six Requirement kinds**, each with its own typed condition shape,
declared next to the decision rule that consumes it:

``` text
PERFORMANCE_GUARANTEE      { percent_of_contract_value }
COMPARABLE_REFERENCES      { minimum_count, lookback_years, project_type }
CONSTRUCTION_WINDOW        { start, end }
SELF_PERFORMANCE_MINIMUM   { percent }
PENALTY_CLAUSE             { percent_per_day, cap_percent }
CONTRACTOR_ROLE            { role }              -- GENERAL | TRADE | SUBCONTRACTOR
```

Anything else the extractor finds (prequalification, personnel qualifications, insurance,
turnover, legal form, …) is an **Unmatched Requirement**: kept with an ontology category, a
verbatim quote, source, page and scope, and shown to the estimator as "stated, not checked".
Unmatched Requirements are collapsed when their whitespace-normalized quotes match; both
evidence pointers are kept.

## 4.3 Scope

Every fact and requirement must state what it applies to:

``` text
PROCEDURE          applies to every lot; stored once, inherited by the lot view
LOT-0001           applies to one lot
LOT-0002
```

There is no `TENDER` and no `ALL_LOTS` scope: both collapse into `PROCEDURE`.

## 4.4 Evidence / Provenance

Every extraction should retain enough information to return the user to
the source:

``` text
source_id          the Notice version or the fetched document (both are Sources)
locator            eForms business term (BT-751) or page number
source passage     verbatim German quote, never translated
```

Page plus quote is the v1 locator. Section headings and bounding boxes are P2.

## 4.5 State

State and Confidence are two separate axes (two enums in the API). v1 has exactly four states:

``` text
KNOWN                    a resolved value exists
NOT_FOUND                sources were read and do not state it
REFERRED_TO_DOCUMENTS    the notice defers to the Vergabeunterlagen and they were not read
                         (the reason names the document fetch status and platform,
                          e.g. "gated, www.evergabe.de")
CONFLICTING              observations at equal precedence disagree; no current value
```

`SUPERSEDED` is not a state: observations from an older notice version stay stored and drop out
of the resolved view. `AMBIGUOUS` is the model's extraction metadata, not a state.

------------------------------------------------------------------------

# 5. Low-Level Flows

## Flow 1 --- Notice Ingestion & Format Normalization

### Purpose

Make all downstream processing independent of whether the notice arrived
as eForms, CSV, or OCDS.

### Flow

``` text
Notice ID / Raw Notice
        │
        ▼
   Identify Format
        │
 ┌──────┼──────┐
 ▼      ▼      ▼
eForms  CSV   OCDS
 │      │      │
 ▼      ▼      ▼
Format-Specific Adapters
 └──────┬──────┘
        ▼
 NORMALIZED NOTICE
```

### Example Output

``` json
{
  "notice_id": "...",
  "version": "01",
  "notice_type": "CONTRACT_NOTICE",
  "publication_date": "...",
  "previous_notice_id": "...",
  "buyer": {},
  "procedure": {},
  "project": {},
  "lots": [],
  "document_references": [],
  "raw_source_id": "SRC-001"
}
```

### Rules

-   Prefer deterministic parsing.
-   Do not use an LLM to parse structured values unnecessarily.
-   Preserve a reference to the raw source.
-   v1 implements the eForms branch only. Namespace prefixes are not stable across the feed;
    resolve XPaths by namespace URI, never by prefix string.
-   Register the Notice version itself as a Source (`SRC-001`) so every observation carries a
    `source_id`.

### Output

`NormalizedNotice`

------------------------------------------------------------------------

## Flow 2 --- Deterministic Structured Extraction

### Purpose

Extract information already represented explicitly by the notice format.

### Flow

``` text
NormalizedNotice
      │
      ▼
Structured Field Extraction
      │
      ├── buyer
      ├── title / description
      ├── CPV
      ├── location
      ├── procedure
      ├── deadlines
      ├── execution period
      ├── award criteria
      ├── lot rules
      ├── document URLs
      └── amendment references
      │
      ▼
Fact Candidates
```

### Example

``` json
{
  "fact_id": "FACT-001",
  "type": "EXECUTION_START",
  "value": "2026-11-02",
  "scope": {
    "type": "LOT",
    "id": "LOT-0001"
  },
  "extraction": {
    "method": "DETERMINISTIC"
  },
  "evidence": [{
    "source_id": "SRC-001",
    "locator": "BT-536-Lot",
    "raw_text": "2026-11-02+01:00"
  }]
}
```

### Important

Deterministic extraction means we are highly certain about **what the
source states**, not necessarily that the value remains authoritative
after amendments are considered.

### Output

`FactCandidate[]`

------------------------------------------------------------------------

## Flow 3 --- Procedure / Lot Hierarchy Construction

### Purpose

Prevent procedure-wide and lot-specific information from being mixed.

### Flow

``` text
Normalized Notice
       │
       ▼
Identify Scopes
       │
 ┌─────┴─────────────────┐
 ▼                       ▼
PROCEDURE               LOTS
 │                 ┌─────┴─────┐
 │                 ▼           ▼
 │             LOT-0001     LOT-0002
 │                 │           │
 ▼                 ▼           ▼
Global Facts     Lot Facts    Lot Facts
Global Reqs      Lot Reqs     Lot Reqs
```

### Scope Example

``` json
{
  "scope": {
    "type": "LOT",
    "id": "LOT-0001"
  }
}
```

### Output

Procedure scope hierarchy / `Lot[]`

------------------------------------------------------------------------

## Flow 4 --- Source Registry & Document Discovery

### Purpose

Maintain a registry of every source used to construct the tender.

### Flow

``` text
Normalized Notice
       │
       ├── Raw Notice
       ├── Document References
       └── Amendment References
       │
       ▼
    SOURCE REGISTRY
```

### Example

``` text
SRC-001  eForms notice
SRC-002  Eignungskriterien.pdf
SRC-003  Vertragsbedingungen.pdf
SRC-004  Leistungsverzeichnis.xlsx
SRC-005  Nachtrag-02.pdf
```

### Source Object

``` json
{
  "source_id": "SRC-003",
  "type": "PDF",
  "name": "Vertragsbedingungen.pdf",
  "url": "...",
  "retrieved_at": "...",
  "hash": "...",
  "status": "AVAILABLE"
}
```

Suggested fetch states:

``` text
AVAILABLE
FETCH_FAILED
AUTH_REQUIRED
NOT_FOUND
```

Hash files to avoid processing duplicate documents unnecessarily.

### Output

`Source[]`

------------------------------------------------------------------------

## Flow 5 --- Vergabeunterlagen Fetching & Parsing

### Purpose

Retrieve and normalize heterogeneous procurement documents into
evidence-addressable content.

### Flow

``` text
Document References
        │
        ▼
      FETCHER
        │
 ┌──────┼──────┐
 ▼      ▼      ▼
PDF    DOCX   XLSX
 │      │      │
 ▼      ▼      ▼
Format-Specific Parsers
 └──────┬──────┘
        ▼
 Document Content
        │
        ▼
Evidence-Addressable Chunks
```

### PDF Chunk

``` json
{
  "chunk_id": "CHUNK-184",
  "source_id": "SRC-003",
  "location": {
    "page": 17,
    "section": "8. Sicherheiten",
    "bbox": [120, 340, 480, 390]
  },
  "text": "Der Auftragnehmer hat eine..."
}
```

### XLSX Location

``` json
{
  "sheet": "LV",
  "range": "A184:F192"
}
```

### DOCX Location

``` json
{
  "section": "Eignungskriterien",
  "paragraph": 37
}
```

### Rule

Never flatten documents into plain text while discarding their source
locations.

### v1 implementation

-   Plain HTTP only, per-platform adapters, no headless browser, no registration walls.
-   Filename router before the reader: read `Teilnahme|Vertragsbedingungen|Bewerbungsbedingungen|
    Eignung|Aufforderung|Leistungsbeschreibung|Beiblatt|Merkblatt`; skip drawings, `LV_`,
    `Bekanntmachung`, `__MACOSX/`.
-   Text via `pdftotext` (poppler) as a subprocess; pages split on form-feed. A Chunk is one page.
    No OCR: a PDF without a text layer is `status=scanned` and reads `NOT_FOUND`.
-   No embeddings / retrieval. A routed conditions document is a few kilobytes and is sent whole
    (Flow 6). If a document exceeds the model context, select pages by the German keyword
    regexes already in `eforms.py`, not by vector search.
-   DOCX / XLSX parsing is P2.

### Output

`DocumentChunk[]`

------------------------------------------------------------------------

## Flow 6 --- LLM Fact & Requirement Extraction

### Purpose

Convert semistructured and unstructured procurement language into atomic
facts and requirements.

### Input

``` text
Relevant Document Chunks
+
Procedure / Lot Context
+
Extraction Schema
```

### Flow

``` text
Relevant Chunks
      +
Scope Context
      +
Extraction Schema
      │
      ▼
     LLM
      │
 ┌────┴─────┐
 ▼          ▼
FACTS   REQUIREMENTS
```

### Call shape

One call per routed document, full extracted text, schema-enforced JSON output. The prompt
carries the Procedure title and the list of lot ids and titles. Output has three arrays:
`facts`, `requirements` (the six typed kinds only) and `unmatched_requirements`.
The model is Claude Sonnet via OpenRouter, read from `OPENROUTER_MODEL=anthropic/claude-sonnet-5`;
swapping to a GPT model is a change of that one environment variable (ADR 0005).

**Scope assignment.** The model emits a scope per item from the supplied lot list. Default is
`PROCEDURE` unless the file or text names a lot; a filename hint such as `Los_2` sets the default
for that file.

### Example Output

``` json
{
  "requirements": [{
    "kind": "PERFORMANCE_GUARANTEE",
    "condition": { "percent_of_contract_value": 10 },
    "scope": { "type": "LOT", "id": "LOT-0001" },
    "evidence": [{ "chunk_id": "CHUNK-184", "quote": "Der Auftragnehmer hat eine Sicherheit ..." }],
    "statement_type": "EXPLICIT"
  }],
  "unmatched_requirements": [{
    "category": "QUALIFICATION",
    "quote": "Präqualifikation nach PQ-VOB oder gleichwertig",
    "scope": { "type": "PROCEDURE" },
    "evidence": [{ "chunk_id": "CHUNK-102", "quote": "Präqualifikation nach PQ-VOB oder gleichwertig" }]
  }],
  "facts": []
}
```

### Rules

The LLM should answer:

> What does the source state?

It should **not** answer:

> Should this company bid?

The LLM should not generate an arbitrary numerical confidence score.

Useful extraction metadata may include:

``` text
EXPLICIT
INFERRED
AMBIGUOUS
```

Every LLM extraction must reference existing evidence. The check is: the `chunk_id` exists for
this Source **and** the quote is a whitespace-normalized substring of that Chunk's text.
Anything else is rejected, and the rejection count is stored per document so the demo can show
it.

``` text
LLM Claim
   │
   ▼
chunk_id exists AND quote ⊂ chunk text (whitespace-normalized)?
   │
 ┌─┴─┐
YES  NO
 │    │
Keep Reject + count
```

### Output

`FactCandidate[] + RequirementCandidate[]`

------------------------------------------------------------------------

## Flow 7 --- Semantic Normalization

> **v1: prose only.** The closed set of six Requirement kinds plus the schema-enforced output
> does the normalization implicitly; the ontology below survives as the `category` label on
> Unmatched Requirements.

### Purpose

Convert different terminology and value representations into common
machine-comparable concepts.

### Example

``` text
"Vertragserfüllungsbürgschaft"
"Vertragserfüllungssicherheit"
"10 % Sicherheit für die Vertragserfüllung"
                  │
                  ▼
FINANCIAL
└── PERFORMANCE_GUARANTEE
```

Another:

``` text
"vergleichbare Leistungen"
"Referenzprojekte"
"Referenzen aus den letzten 5 Jahren"
                  │
                  ▼
REFERENCE
└── COMPARABLE_PROJECTS
```

### Suggested MVP Requirement Ontology

``` text
REFERENCE
QUALIFICATION
FINANCIAL
INSURANCE
TECHNICAL_CAPABILITY
PERSONNEL
EXECUTION
SUBMISSION
CONTRACTUAL
LEGAL
OTHER
```

### Normalize Values

``` text
"zehn Prozent" → 10
"10 %"         → 10

"5 Jahre"      → 5 years
"EUR 2 Mio."   → 2,000,000 EUR
```

### Output

Normalized fact and requirement candidates.

------------------------------------------------------------------------

## Flow 8 --- Deduplication & Merging

> **v1: the read-time resolution view only** (see ADR 0001). Observations at equal extractor
> precedence whose values agree merge their evidence; Unmatched Requirements collapse on
> whitespace-normalized quote. No semantic dedup step.

### Purpose

Determine whether multiple observations describe separate requirements
or provide evidence for the same underlying requirement.

### Example

``` text
NOTICE
"Comparable previous works required"
          │
          ├──────────────┐
          ▼              ▼
Eignung.pdf         Formblatt.pdf
3 comparable       References from
rail projects      previous 5 years
          │              │
          └──────┬───────┘
                 ▼
        CANONICAL REQUIREMENT
```

### Example Result

``` json
{
  "requirement_id": "REQ-021",
  "type": "COMPARABLE_PROJECTS",
  "condition": {
    "minimum_count": 3,
    "lookback_years": 5,
    "project_type": "railway"
  },
  "evidence": [
    "CHUNK-021",
    "CHUNK-184",
    "CHUNK-311"
  ]
}
```

Keep the underlying observations. The resolved value is a view over them; it points back to
them rather than destroying them.

### Output

Resolved facts and requirements (a view over observations).

------------------------------------------------------------------------

## Flow 9 --- Amendment & Conflict Resolution

> **v1 rules, all deterministic, no LLM:**
> 1. Latest notice version wins. Observations from a superseded version stay stored and drop out
>    of the view; the tender shows an "amended" marker. No per-field history view.
> 2. Document-derived observations attach to Procedure + Lot without a notice version, so a
>    corrected notice does not invalidate document reads.
> 3. Extractor precedence: structured field > rule over notice text > model over document >
>    model over notice text. A structured value beats a disagreeing document value, but the
>    disagreement is flagged and both are shown.
> 4. Disagreement at equal precedence → `CONFLICTING`, no current value.

### Purpose

Determine which values are currently authoritative while retaining
history.

### Explicit Amendment Example

``` text
Original Notice
Deadline = 17 Sep
       │
       ▼
Nachtrag 01
Deadline = 24 Sep
```

Result:

``` text
17 Sep → SUPERSEDED
24 Sep → CURRENT
```

### Representation

``` json
{
  "type": "SUBMISSION_DEADLINE",
  "current_value": "2026-09-24T10:00",
  "history": [
    {
      "value": "2026-09-17T10:00",
      "state": "SUPERSEDED",
      "source_id": "SRC-001"
    },
    {
      "value": "2026-09-24T10:00",
      "state": "CURRENT",
      "source_id": "SRC-005"
    }
  ]
}
```

### Unresolved Conflict

``` text
Document A → €2M
Document B → €1.5M
No clear precedence
        │
        ▼
    CONFLICTING
```

Do not let the LLM silently choose between unresolved authoritative
sources.

### Output

Resolved canonical values + unresolved conflicts.

------------------------------------------------------------------------

## Flow 10 --- Missing / Uncertain Information Handling

### Purpose

Represent what the system does not know instead of turning missing
evidence into a false pass/fail.

Example:

``` text
Notice:
Guarantee required = TRUE

Details:
"Sicherheiten gemäß Vergabeunterlagen"
```

Initial representation:

``` json
{
  "type": "PERFORMANCE_GUARANTEE_AMOUNT",
  "state": "REFERRED_TO_DOCUMENTS"
}
```

After document ingestion:

``` text
Found                     → KNOWN
Read, not stated          → NOT_FOUND
Documents gated/unreached → stays REFERRED_TO_DOCUMENTS, reason names platform + fetch status
Disagreement              → CONFLICTING
```

### Core Rule

``` text
UNKNOWN ≠ PASS
UNKNOWN ≠ FAIL
```

Unknown information should later become a reason for **human review**
where material.

### Output

Explicit unresolved state objects.

------------------------------------------------------------------------

## Flow 11 --- Confidence Calculation

> **v1: derived from the Extractor, nothing else.** Structured field → HIGH, rule → MEDIUM,
> model over document → MEDIUM, model over notice text → LOW. Corroboration by a second source
> is shown as a signal line ("Supported by 2 sources") and does **not** change the level.
> The signal-based engine below is the target design.

### Purpose

Provide explainable confidence after all available evidence has been
considered.

### Inputs

``` text
Extraction method
Explicit vs inferred
Evidence quality
Number of corroborating sources
Source agreement
Conflicting evidence
Amendment/version status
```

### Flow

``` text
Resolved Fact / Requirement
          │
          ├── Extraction Method
          ├── Explicit / Inferred
          ├── Evidence Quality
          ├── Corroborating Sources
          ├── Agreement
          ├── Conflicts
          └── Amendment State
          │
          ▼
     CONFIDENCE ENGINE
          │
          ▼
 HIGH / MEDIUM / LOW / CONFLICT
```

### Example

``` json
{
  "level": "HIGH",
  "signals": [
    "Explicit statement in source",
    "Exact numerical value present",
    "Confirmed by two sources",
    "No conflicting current evidence"
  ]
}
```

Low-confidence example:

``` json
{
  "level": "LOW",
  "signals": [
    "Requirement inferred from surrounding text",
    "Only one supporting source",
    "No explicit numerical threshold found"
  ]
}
```

A deterministic eForms extraction can be:

> **HIGH --- Direct structured field**

This describes confidence in the extraction/resolution, not a
statistically calibrated probability.

### Output

Explainable confidence attached to canonical facts/requirements.

------------------------------------------------------------------------

## Flow 12 --- Provenance Assembly

### Purpose

Ensure every canonical conclusion can be inspected and cited in the UI.

### Flow

``` text
Resolved Requirement
"10% performance guarantee"
            │
            ▼
        PROVENANCE
       /          \
      ▼            ▼
 notice.xml     contract.pdf
 BT-751         Page 17
                    │
                    ▼
               Exact Passage
```

### Example

``` json
{
  "requirement_id": "REQ-037",
  "evidence": [
    {
      "source_id": "SRC-001",
      "source_type": "EFORM",
      "locator": "LOT-0001 / BT-751",
      "text": "Sicherheiten gemäß Vergabeunterlagen"
    },
    {
      "source_id": "SRC-003",
      "source_type": "PDF",
      "page": 17,
      "section": "8. Sicherheiten",
      "bbox": [120, 340, 480, 390],
      "text": "..."
    }
  ]
}
```

This enables UI interactions such as:

``` text
Performance guarantee — 10%
HIGH confidence
Supported by 2 sources

Vertragsbedingungen.pdf · p.17
[View evidence]
```

### Output

Evidence/provenance attached to canonical items.

------------------------------------------------------------------------

## Flow 13 --- Resolved Procedure Persistence

### Purpose

Create the stable API/DB contract consumed by the rest of the
application.

### Structure

``` text
           RESOLVED PROCEDURE
                  │
     ┌────────────┼─────────────┐
     ▼            ▼             ▼
 Metadata       Lots         Sources
                  │
          ┌───────┴────────┐
          ▼                ▼
        Facts         Requirements
          │                │
          └───────┬────────┘
                  ▼
              Evidence
                  │
          ┌───────┴────────┐
          ▼                ▼
       History         Unresolved
```

### Example

``` json
{
  "procedure_id": "...",
  "metadata": {},
  "lots": [],
  "facts": [],
  "requirements": [],
  "sources": [],
  "amendments": [],
  "unresolved": []
}
```

### v1 storage: deltas to the PRD `claim` table

SQLite, single committed file, as decided in the PRD. The `claim` table becomes the Observation
table:

-   Primary key widens to `(scope_key, attribute, extractor, source_id)` so two documents stating
    the same requirement are two rows.
-   New columns: `kind` (`fact | requirement | unmatched`), `scope_type` (`PROCEDURE | LOT`),
    `scope_id`, `state`, `condition` JSON (per-kind shape), `category` (unmatched only).
-   Procedure-scoped rows are stored once with `scope_type = PROCEDURE`; the lot view inherits
    them.
-   Document-derived rows carry no `notice_version`; notice-derived rows do.
-   The Notice version is a row in the source registry, so `source_id` is never null.
-   Resolution is a view (ADR 0001); there is no canonical table.
-   API: `state` and `confidence` are two fields; tender detail gains an
    `unmatched_requirements` list (category, quote, document, page, scope).

### Output

Persisted `ResolvedProcedure`.

This is the end of the **Document Pipeline**.

------------------------------------------------------------------------

# 5a. Triggers --- What Starts Each Stage

Decided 17.09 20:45. Every stage is an idempotent command over the store; triggers are thin and
external to the stages, so the same code runs from a shell, an HTTP request or a scheduler.

| stage | v1 trigger | idempotency key | scaling path |
|---|---|---|---|
| `poll` → `load` | CLI, run by hand or in a shell loop; no scheduler in the API process | watermark in `sync_state`, `(notice_id, notice_version, lot_id)` diff | any external scheduler (cron, systemd timer, CI schedule) calls the same command; the watermark lives in the DB, so the scheduler is stateless and replaceable |
| `enrich` (batch) | CLI `enrich --for-company <id>` before the demo, over lots that pass region + CPV and still have Unknowns | document content hash + prompt version | same command fanned out per host; politeness limits per platform, not per process |
| `enrich` (on demand) | `POST /tenders/{id}/enrich` → job. The detail response carries `documents_read: false`; the briefing page fires the request. Reads never enrich as a side effect | same as above, so a double fire is a no-op | unchanged |
| `ingest-one` (live) | `POST /ingest` with a notice URL, id or files → job → `load` + `enrich` for all six kinds and the unmatched list, no company filter | notice id + version; document hash | unchanged |
| `screen` | compute on read, cached in `verdict` keyed `(lot, company)`; recomputed when any observation or the profile is newer than `computed_at` | pure function | precompute per company after `enrich`; cache is already the contract |
| company normalization | synchronous inside `POST /companies` (one model call) | — | move behind a job if profiles get long |
| `backfill` | CLI only | export day / month | unchanged |

**Job runner.** One in-process worker (background task in the API) drains the `ingest_job` table
sequentially: claim the oldest `queued` row inside a `BEGIN IMMEDIATE` transaction, run the stage
functions, update `stage` / `pct` / `message`, finish with `done` or `error`. The web polls the
job row through the existing stepper (`queued → downloading → extracting_text →
extracting_facts → done | error`).

The table is the queue contract. Scaling out means a separate worker process claiming rows
from the same table with the same transaction, and the API only writing rows; nothing in the
stage code changes. Beyond SQLite's single-writer limit, swap the claim for Postgres
`SKIP LOCKED` or a real queue. Stages are idempotent, so a crashed worker's job is safe to
re-run, and observations are written per document, so partial progress survives a failure.

**Failure.** A job ends in `error` with the message; retry is a new `POST`. A platform fetch
failure marks the document (`gated | unreachable | scanned`) and the job continues; only a
notice fetch failure fails the job.

**Health.** `GET /health` returns `last_poll_at` and `queued_jobs` so the UI can show how fresh
the batch is instead of implying real time.

------------------------------------------------------------------------

# 6. Pipeline Boundary

The document pipeline must remain independent from company-specific
Bid/No-Bid reasoning.

``` text
DOCUMENT PIPELINE

Messy Tender Data
       │
       ▼
Resolved Procedure
       │
       ▼
════════ API / DB BOUNDARY ════════
       │
       ▼
DECISION PIPELINE

Resolved Procedure
       +
Company Profile
       │
       ▼
Requirement Matching
       │
       ▼
PASS / FAIL / UNCERTAIN
       │
       ▼
Business Decision Aspects
       │
       ▼
Procedure / Lot Viability
       │
       ▼
PURSUE / REVIEW / SKIP
       │
       ▼
Top-3 Portfolio
```

------------------------------------------------------------------------

# 7. Suggested Implementation Priority for the Hackathon

Decided 17.09 20:30, submission 18.09 15:00.

``` text
CODE (v1)
  Flow 1   eForms → NormalizedNotice (namespace-URI-aware XPaths)
  Flow 2   structured extraction incl. BT-750 / BT-758 fixes from the PRD
  Flow 3   Procedure / Lot scopes, procedure rows stored once
  Flow 4   source registry incl. the Notice as a Source; content-hashed documents
  Flow 5   plain-HTTP fetch, filename router, pdftotext pages, no OCR
  Flow 6   one schema-enforced call per document; six kinds + unmatched list;
           quote-substring evidence check with rejection count
  Flow 9   latest-version-wins + precedence/agreement view (minimal)
  Flow 10  four states
  Flow 11  extractor-derived confidence + corroboration signal line
  Flow 13  SQLite with the claim-table deltas; state/confidence split;
           unmatched_requirements in the API

PROSE (target design, not built)
  Flow 7   semantic normalization
  Flow 8   semantic dedup beyond the resolution view
  Flow 9   per-field amendment history
  Flow 11  signal-based confidence engine
  CSV / OCDS aggregation, DOCX / XLSX, bounding boxes, OCR
```

One ugly real Procedure processed end to end beats broad shallow coverage.

------------------------------------------------------------------------

# 7a. Known Limitations (stated, not hidden)

-   **Estimated contract value** is absent from ~95% of notices and stays `NOT_FOUND` unless the
    notice states it. No reading of bills of quantities (Leistungsverzeichnis).
-   **Registration-walled platforms** (~33% of document-bearing lots) leave requirements at
    `REFERRED_TO_DOCUMENTS`; the reason names the platform.
-   **Scanned PDFs** without a text layer are not read.
-   **Locator granularity** is page + verbatim quote; no section or bounding box.
-   **Contractor role** is inferred from CPV breadth and flagged as inference.

------------------------------------------------------------------------

# 8. Engineering Principles

1.  **Structured before AI.** Parse structured fields deterministically
    whenever possible.
2.  **LLMs extract; they do not decide.** Company-specific Bid/No-Bid
    reasoning belongs downstream.
3.  **No evidence, no trusted claim.** Every LLM extraction must
    reference real source evidence.
4.  **Never lose scope.** Procedure-level and lot-level requirements
    must remain distinguishable.
5.  **Never lose provenance.** Every canonical fact should be traceable
    back to its source.
6.  **Unknown is a valid state.** Missing evidence must never silently
    become PASS or FAIL.
7.  **Preserve history.** Amendments supersede facts; they should not
    erase them.
8.  **Confidence must be explainable.** Prefer HIGH/MEDIUM/LOW/CONFLICT
    plus reasons over fake probability precision.
9.  **Canonical representation is the contract.** Everything downstream
    should depend on the canonical schema, not source-specific
    eForms/CSV/OCDS structures.
10. **Optimize the hackathon for end-to-end credibility.** One ugly real
    tender processed correctly is more valuable than broad but shallow
    format coverage.
