# Arctis Tender Intelligence --- Document Pipeline Specification

## 1. Goal

Given **one public procurement notice** from ÖffentlicheVergabe plus its
linked **Vergabeunterlagen**, transform heterogeneous and messy
procurement data into a **canonical, evidence-backed tender
representation** that can be consumed by a separate company-matching and
Bid/No-Bid decision pipeline.

The notice can be available in three source formats:

-   **eForms**
-   **CSV**
-   **OCDS**

The document pipeline ends at the **Canonical Tender**. It does **not**
decide whether a specific company should bid.

------------------------------------------------------------------------

# 2. High-Level Architecture

``` text
                    ÖFFENTLICHEVERGABE
                            │
                ┌───────────┼───────────┐
                │           │           │
             eForms        CSV        OCDS
                │           │           │
                └───────────┼───────────┘
                            ▼
                    NOTICE ADAPTERS
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
                    CANONICAL TENDER
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

------------------------------------------------------------------------

# 4. Core Data Concepts

## 4.1 Facts

Facts describe the tender itself.

Examples:

-   Location = Gaimersheim
-   CPV = 45221112
-   Execution start = 2026-11-02
-   Submission deadline = 2026-09-17 10:00
-   Price award weight = 85%

## 4.2 Requirements

Requirements describe conditions a bidder or bid must satisfy.

Examples:

-   DB prequalification required
-   Comparable projects from previous five years required
-   Performance guarantee = 10% of contract value
-   Specific personnel qualification required

Requirements are first-class objects because they are later evaluated
against a company profile.

## 4.3 Scope

Every fact and requirement must state what it applies to:

``` text
PROCEDURE
TENDER
LOT-0001
LOT-0002
ALL_LOTS
```

## 4.4 Evidence / Provenance

Every extraction should retain enough information to return the user to
the source:

``` text
source_id
document/file
page / section / paragraph / spreadsheet range
source passage
optional bounding box
```

## 4.5 State

Suggested states:

``` text
KNOWN
NOT_FOUND
REFERRED_TO_DOCUMENTS
AMBIGUOUS
CONFLICTING
SUPERSEDED
NOT_APPLICABLE
```

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

## Flow 3 --- Tender / Lot Hierarchy Construction

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

Tender scope hierarchy / `Lot[]`

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
Tender / Lot Context
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

### Example Output

``` json
{
  "type": "PERFORMANCE_GUARANTEE",
  "condition": {
    "operator": "REQUIRED",
    "value": 10,
    "unit": "PERCENT_CONTRACT_VALUE"
  },
  "mandatory": true,
  "scope": {
    "type": "LOT",
    "id": "LOT-0001"
  },
  "evidence_chunk_ids": ["CHUNK-184"],
  "extraction_metadata": {
    "statement_type": "EXPLICIT"
  }
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

Every LLM extraction must reference existing evidence.

``` text
LLM Claim
   │
   ▼
Referenced Evidence Exists?
   │
 ┌─┴─┐
YES  NO
 │    │
Keep Reject / Flag
```

### Output

`FactCandidate[] + RequirementCandidate[]`

------------------------------------------------------------------------

## Flow 7 --- Semantic Normalization

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

Keep the underlying observations. The canonical object should point back
to them rather than destroying them.

### Output

Canonical facts and requirements.

------------------------------------------------------------------------

## Flow 9 --- Amendment & Conflict Resolution

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
Found       → KNOWN
Not found   → NOT_FOUND
Ambiguous   → AMBIGUOUS
Disagreement→ CONFLICTING
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
Canonical Fact / Requirement
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
Canonical Requirement
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

## Flow 13 --- Canonical Tender Persistence

### Purpose

Create the stable API/DB contract consumed by the rest of the
application.

### Structure

``` text
           CANONICAL TENDER
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
  "tender_id": "...",
  "metadata": {},
  "lots": [],
  "facts": [],
  "requirements": [],
  "sources": [],
  "amendments": [],
  "unresolved": []
}
```

### Output

Persisted `CanonicalTender`.

This is the end of the **Document Pipeline**.

------------------------------------------------------------------------

# 6. Pipeline Boundary

The document pipeline must remain independent from company-specific
Bid/No-Bid reasoning.

``` text
DOCUMENT PIPELINE

Messy Tender Data
       │
       ▼
Canonical Tender
       │
       ▼
════════ API / DB BOUNDARY ════════
       │
       ▼
DECISION PIPELINE

Canonical Tender
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
Tender / Lot Viability
       │
       ▼
PURSUE / REVIEW / SKIP
       │
       ▼
Top-3 Portfolio
```

------------------------------------------------------------------------

# 7. Suggested Implementation Priority for the Hackathon

Implement in this order:

``` text
P0
1. One working notice adapter
2. Deterministic extraction
3. Lot hierarchy
4. Document discovery/fetch
5. PDF parsing with source locations
6. LLM requirement extraction with evidence IDs
7. Canonical Tender JSON
8. DB persistence

P1
9. Semantic normalization
10. Deduplication / merging
11. Missing / uncertain states
12. Explainable confidence

P2
13. DOCX / XLSX parsing
14. Amendment resolution
15. Sophisticated conflict resolution
16. All three eForms / CSV / OCDS adapters
```

The architecture should support all three notice formats from the
beginning, but a 24-hour prototype does not need three fully implemented
adapters if one format is sufficient for the end-to-end demo.

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
