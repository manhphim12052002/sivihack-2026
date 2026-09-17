# Arctis Matching Engine Specification

## 1. Goal

Given a **Canonical Tender** and a **Canonical Company**, determine
requirement-by-requirement whether the company can satisfy the tender
and whether important company preferences and constraints fit.

The Matching Engine produces an **evidence-backed evaluation matrix**,
not a black-box similarity score.

> **Core question:** How does this company compare against this tender
> or bid scope, requirement by requirement?

The later question --- **which three opportunities should consume
estimator capacity this week?** --- belongs to a separate **Portfolio
Engine**.

## 2. Inputs

``` text
CANONICAL TENDER
├── Tender metadata
├── Lots[]
├── Facts[]
├── Requirements[]
├── Sources[]
└── Evidence[]

              +

CANONICAL COMPANY
├── Identity
├── Capabilities[]
├── Regions[]
├── Commercial Profile
├── References[]
├── Qualifications[]
├── Resources[]
├── Capacity[]
├── Constraints[]
├── Preferences[]
├── Sources[]
├── Evidence[]
└── Knowledge Gaps[]
```

The Matching Engine consumes canonical structured data and should not
parse raw documents again.

## 3. Output

``` text
MATCH EVALUATION
├── Bid Scope
├── Requirement Matches[]
│   ├── PASS
│   ├── FAIL
│   └── UNCERTAIN
├── Hard Blockers[]
├── Concerns[]
├── Knowledge Gaps[]
├── 8 Decision Aspects
├── Evidence / Explanations
└── Overall Viability
    ├── VIABLE
    ├── REVIEW
    └── BLOCKED
```

Use `VIABLE / REVIEW / BLOCKED` internally. `PURSUE / REVIEW / SKIP` is
a downstream business/portfolio decision.

## 4. General Workflow

``` text
CANONICAL TENDER + CANONICAL COMPANY
                  ↓
          SELECT BID SCOPE
        Tender / Lot / Lots
                  ↓
        BUILD MATCHING TASKS
                  ↓
        REQUIREMENT MATCHER
           ↙      ↓      ↘
        RULE   ONTOLOGY  SEMANTIC
           ↘      ↓      ↙
        REQUIREMENT RESULTS
        PASS / FAIL / UNCERTAIN
                  ↓
          HARD-GATE CHECK
           ↙      ↓      ↘
       BLOCKER  CONCERN  KNOWLEDGE GAP
           ↘      ↓      ↙
          EVALUATION MATRIX
                  ↓
          GROUP INTO ASPECTS
                  ↓
       8 HUMAN-FACING ASPECTS
                  ↓
          OVERALL VIABILITY
          ↙       ↓       ↘
       VIABLE   REVIEW   BLOCKED
                  ↓
          MATCH EVALUATION
```

## 5. Matching Engine Feature List

  -----------------------------------------------------------------------------
  ID                      Feature                 Acceptance Criterion
  ----------------------- ----------------------- -----------------------------
  **ME1**                 Accept canonical inputs Consume `CanonicalTender` +
                                                  `CanonicalCompany` without
                                                  reading raw documents again

  **ME2**                 Scope-aware matching    Evaluate whole tender,
                                                  individual lot, or valid lot
                                                  combination

  **ME3**                 Build matching tasks    Convert tender
                                                  requirements/facts and
                                                  relevant company constraints
                                                  into individual checks

  **ME4**                 Deterministic rule      Evaluate dates, values,
                          matching                counts, distances,
                                                  thresholds, etc.

  **ME5**                 Ontology/exact matching Match normalized
                                                  capabilities, qualifications,
                                                  categories, and known
                                                  concepts

  **ME6**                 Semantic matching       Use constrained LLM/semantic
                                                  reasoning when meaning rather
                                                  than equality determines
                                                  satisfaction

  **ME7**                 Reference matching      Compare reference
                                                  requirements against
                                                  individual company reference
                                                  projects

  **ME8**                 Qualification matching  Verify required
                                                  qualifications/certificates
                                                  and validity

  **ME9**                 Capability matching     Determine whether company
                                                  capabilities cover required
                                                  scope

  **ME10**                Commercial matching     Compare tender
                                                  value/financial conditions
                                                  against company commercial
                                                  profile

  **ME11**                Geographic matching     Compare tender location
                                                  against company operating
                                                  regions/radius

  **ME12**                Capacity/timing         Compare execution
                          matching                requirements against current
                                                  operational capacity

  **ME13**                Hard/soft distinction   Treat mandatory requirements
                                                  differently from
                                                  preferences/concerns

  **ME14**                Explicit uncertainty    Missing/ambiguous information
                                                  produces `UNCERTAIN`, not
                                                  invented PASS/FAIL

  **ME15**                Hard blocker detection  Failed mandatory requirements
                                                  become explicit blockers

  **ME16**                Knowledge-gap detection Identify company information
                                                  needed to resolve important
                                                  uncertain matches

  **ME17**                Two-sided evidence      Every result connects tender
                                                  evidence and relevant company
                                                  evidence

  **ME18**                Human-readable          Every result has a concise
                          explanation             estimator-readable reason

  **ME19**                Evaluation matrix       Return all individual checks
                                                  in one structured
                                                  representation

  **ME20**                Aspect grouping         Group checks into the eight
                                                  human-facing decision aspects

  **ME21**                Overall viability       Derive
                                                  `VIABLE / REVIEW / BLOCKED`
                                                  using transparent rules

  **ME22**                Persist match results   Store results for review,
                                                  correction, and reuse

  **ME23**                Support re-evaluation   Re-run affected checks when
                                                  tender/company intelligence
                                                  changes

  **ME24**                Human override          Allow corrections while
                                                  preserving original result
                                                  and reason
  -----------------------------------------------------------------------------

## 6. Core Match Result Object

``` json
{
  "match_id": "MATCH-091",
  "tender_id": "TENDER-123",
  "company_id": "COMP-001",
  "scope_id": "LOT-001",
  "requirement_id": "REQ-021",
  "status": "FAIL",
  "severity": "HARD",
  "method": "SEMANTIC",
  "reason": "The tender requires three comparable railway bridge projects completed within five years. No verified qualifying company references were identified.",
  "tender_evidence": ["TCHUNK-812"],
  "company_items_checked": ["REF-001", "REF-002", "REF-003"],
  "company_evidence": ["CCHUNK-123", "CCHUNK-456"]
}
```

The Evaluation Matrix, aspect summaries, blockers, knowledge gaps, and
overall viability are derived from these atomic match results.

# 7. Individual Flows

## Flow 1 --- Matching Request

**Purpose:** create one evaluation between a company and tender.

**Input:**

``` text
tender_id
company_id
optional scope_id
```

**Flow:**

``` text
Matching Request
      ├── Load CanonicalTender
      └── Load CanonicalCompany
                 ↓
         MATCHING CONTEXT
```

**Output:** `MatchingContext`

## Flow 2 --- Bid-Scope Resolution

**Purpose:** determine exactly which procurement scope is being
evaluated.

``` text
No lots:
Tender → WHOLE_TENDER

With lots:
Tender
├── LOT-1
├── LOT-2
└── LOT-3
```

Respect:

``` text
max_lots_submitted
max_lots_awarded
allowed combinations
lot-specific restrictions
```

Example:

``` json
{
  "scope_id": "SCOPE-001",
  "type": "LOT",
  "lot_ids": ["LOT-001"]
}
```

**Output:** `BidScope[]`

**Hackathon:** individual lots are sufficient. Avoid sophisticated
combinatorial lot optimization unless time remains.

## Flow 3 --- Matching Task Generation

**Purpose:** turn Tender Intelligence into atomic comparison tasks.

Example:

``` text
REQ-001  Minimum turnover ≥ €10M
REQ-002  PQ-VOB required
REQ-003  3 comparable railway bridge references
REQ-004  Execution starts February
```

Generated tasks:

``` text
TASK-001 → annual revenue → RULE
TASK-002 → qualifications → ONTOLOGY
TASK-003 → references → SEMANTIC_REFERENCE
TASK-004 → capacity → RULE / SEMANTIC
```

**Output:** `MatchingTask[]`

## Flow 4 --- Matcher Routing

**Purpose:** choose the simplest reliable matching method.

``` text
Matching Task
      ↓
Can structured rules solve it?
   YES ─────────────→ RULE
    NO
      ↓
Exact normalized concepts available?
   YES ─────────────→ ONTOLOGY
    NO
      ↓
                  SEMANTIC
```

> **Do not use an LLM when `31 >= 10` answers the question.**

**Output:** task + selected matcher.

## Flow 5 --- Deterministic Rule Matching

**Purpose:** evaluate structured conditions using code.

Suitable examples:

``` text
Minimum turnover
Contract value
Reference count
Lookback years
Distance
Dates
Deadlines
Guarantee amount
Certificate expiration
Employee count
Execution period
```

Example:

``` text
Required turnover >= €10M
Company turnover = €31M
31 >= 10
→ PASS
```

Output:

``` json
{
  "status": "PASS",
  "method": "DETERMINISTIC",
  "reason": "Company turnover of €31M exceeds the required €10M."
}
```

**Output:** `MatchResult`

## Flow 6 --- Ontology / Exact Matching

**Purpose:** compare normalized concepts.

``` text
Tender qualification: PQ_VOB
Company qualification: PQ_VOB / VALID
→ PASS
```

``` text
Tender capability: ROAD_CONSTRUCTION
Company capabilities: ROAD_CONSTRUCTION, EARTHWORKS
→ PASS
```

**Output:** `PASS / FAIL / UNCERTAIN`

## Flow 7 --- Semantic Matching

**Purpose:** handle conditions where meaning determines satisfaction.

Tender:

``` text
Comparable reinforced-concrete railway bridge
construction under ongoing railway operations.
```

Company:

``` text
Replacement of railway overpass while maintaining
single-track railway operation.
```

The model receives only relevant structured objects and supporting
evidence.

Example:

``` json
{
  "status": "UNCERTAIN",
  "conditions": [
    {"condition": "railway bridge", "status": "PASS"},
    {"condition": "under railway operation", "status": "PASS"},
    {"condition": "reinforced concrete", "status": "UNCERTAIN"}
  ],
  "reason": "The reference supports railway bridge work under ongoing operations, but available evidence does not establish reinforced-concrete construction."
}
```

If a material condition cannot be established, return `UNCERTAIN`.

**Output:** `SemanticMatchResult`

## Flow 8 --- Reference Matching

**Purpose:** evaluate complex reference requirements against structured
company references.

Input:

``` json
{
  "minimum_count": 3,
  "project_type": "RAILWAY_BRIDGE",
  "lookback_years": 5,
  "mandatory": true
}
```

Flow:

``` text
Reference Requirement
        ↓
Filter Deterministic Conditions
├── completion date
├── project value
├── geography
└── other structured constraints
        ↓
Candidate References
        ↓
Semantic Comparison
        ↓
Qualifying References
        ↓
Count / Threshold Check
```

Example:

``` text
Required: 3

REF-001    PASS
REF-002    PASS
REF-003    FAIL
REF-004    UNCERTAIN

Verified qualifying: 2
Potential qualifying: 1
→ UNCERTAIN until REF-004 is resolved
```

**Output:** `ReferenceMatchResult`

## Flow 9 --- Hard vs Soft Classification

**Purpose:** determine decision significance.

``` text
Tender Requirement
        ↓
Mandatory?
   YES → HARD
    NO → SOFT
```

Hard:

``` text
Mandatory DB qualification
FAIL + HARD → HARD BLOCKER
```

Soft:

``` text
Company prefers projects < €4M
Tender = €4.5M
→ CONCERN
```

**Output:** `HARD / SOFT`

## Flow 10 --- Uncertainty & Knowledge Gaps

**Purpose:** prevent missing information from becoming artificial
failure.

``` text
Tender requires: DB qualification
Company Intelligence: no information
→ UNCERTAIN
```

Knowledge gap:

``` json
{
  "type": "COMPANY_KNOWLEDGE_GAP",
  "concept": "DB_RAILWAY_QUALIFICATION",
  "triggered_by": "REQ-021",
  "importance": "HARD_REQUIREMENT"
}
```

Can trigger:

``` text
Do you hold this qualification?

[Yes / Upload]
[No]
[Not sure]
```

**Output:** `KnowledgeGap[]`

## Flow 11 --- Match Explanation & Evidence Assembly

**Purpose:** make every decision inspectable from both sides.

``` text
Tender says                      Company says
───────────                      ────────────
3 railway bridge                 References:
references within                B17 Road Rehab
5 years                          Augsburg Sewer
                                 Housing Süd

Eignung.pdf · p.17               Company DB
[View source]                    [View references]

                 ↓
                FAIL

0 verified references satisfy
the railway-bridge requirement.
```

**Output:** evidence-backed `MatchResult`

## Flow 12 --- Evaluation Matrix Assembly

**Purpose:** collect all results for one company × tender × scope.

``` text
Brenner × LOT-001

Requirement                    Result      Severity
────────────────────────────────────────────────────
Road capability                PASS        HARD
Turnover ≥ €10M                PASS        HARD
PQ-VOB                         PASS        HARD
DB bridge PQ                   UNKNOWN     HARD
3 bridge references            FAIL        HARD
Distance                       PASS        SOFT
Preferred contract size        PASS        SOFT
Crew availability              CONCERN     SOFT
Guarantee capacity             PASS        HARD
```

Output:

``` text
EvaluationMatrix
├── MatchResult[]
├── HardBlockers[]
├── Concerns[]
└── KnowledgeGaps[]
```

The Evaluation Matrix is the core aggregate Matching Engine output.

## Flow 13 --- Group Into 8 Decision Aspects

**Purpose:** organize atomic results for human decision-making.

``` text
Individual Checks
       ↓
Aspect Mapping
├── Scope / Capability
├── Geography
├── Contract Size
├── References
├── Qualifications
├── Timing & Capacity
├── Financial / Guarantees
└── Contractual / Delivery Risk
```

The eight aspects are a **UI/explanation taxonomy, not the matching
algorithm**.

**Output:** `DecisionAspect[]`

## Flow 14 --- Overall Viability

**Purpose:** derive a transparent internal state.

``` text
Any confirmed HARD FAIL?
YES → BLOCKED

Otherwise:
Material HARD UNCERTAIN?
YES → REVIEW

Otherwise:
→ VIABLE
```

Soft concerns remain attached.

Example:

``` json
{
  "status": "BLOCKED",
  "hard_blockers": 1,
  "hard_unknowns": 1,
  "soft_concerns": 2
}
```

Do not manufacture an opaque universal score such as `73% match`.

**Output:** `ViabilityResult`

## Flow 15 --- Human Override / Correction

**Purpose:** allow estimator knowledge to correct automation while
preserving history.

``` json
{
  "system_result": "FAIL",
  "effective_result": "PASS",
  "override": {
    "user_id": "...",
    "reason": "Reference REF-019 satisfies the requirement.",
    "timestamp": "..."
  }
}
```

Corrections may feed back into Company Intelligence.

**Output:** auditable corrected match.

## Flow 16 --- Persistence

Suggested tables:

``` text
match_evaluations
matching_tasks
match_results
match_evidence
match_knowledge_gaps
match_overrides
```

Example `match_evaluations`:

``` text
id
tender_id
company_id
scope_id
status
created_at
updated_at
```

Example `match_results`:

``` text
id
evaluation_id
requirement_id
matcher_type
status
severity
reason
metadata JSONB
```

**Output:** persisted `MatchEvaluation`

## Flow 17 --- Re-evaluation

**Purpose:** update matching when Tender or Company Intelligence
changes.

Company example:

``` text
New DB Qualification
        ↓
Identify Affected Matches
        ↓
Re-run Qualification Checks
        ↓
Evaluation Matrix Updated
```

Tender amendment:

``` text
REQ-17 Changed
      ↓
Identify Evaluations Using REQ-17
      ↓
Re-run Affected Matches
```

**Output:** updated `MatchEvaluation`

# 8. Three Matcher Classes

## 8.1 Rule Matcher

Use deterministic logic for:

``` text
numeric thresholds
dates
deadlines
distance
contract value
reference counts
guarantee capacity
certificate validity
```

## 8.2 Ontology / Exact Matcher

Use normalized concepts:

``` text
Tender: PQ_VOB
Company: PQ_VOB
→ PASS
```

``` text
Tender: ROAD_CONSTRUCTION
Company: ROAD_CONSTRUCTION
→ PASS
```

## 8.3 Semantic Matcher

Use a constrained LLM only where meaning genuinely needs interpretation:

``` text
Comparable project references
Complex capability descriptions
Unusual qualification wording
Contractual requirements
Ambiguous equivalence between company evidence and tender condition
```

The semantic matcher receives a small matching task, not the entire
tender and company profile.

# 9. Evaluation Matrix Mental Model

``` text
TENDER REQUIREMENT              COMPANY                  RESULT

Road construction        ↔      Roads ✓                  PASS
Augsburg region          ↔      ≤150 km                  PASS
€2.8M contract           ↔      Prefers €0.4M–€4M       PASS
Turnover ≥ €10M          ↔      €31M                     PASS
PQ-VOB                   ↔      PQ-VOB ✓                 PASS
DB bridge PQ             ↔      Not recorded             UNCERTAIN
3 railway bridge refs    ↔      0 verified               FAIL
Start February           ↔      Crews busy until March   CONCERN
Guarantee €500k          ↔      Capacity €1.5M           PASS
```

This is the simplest mental model for the Matching Engine: an automated,
evidence-backed evaluation matrix.

# 10. Matching Engine Boundary

The Matching Engine answers:

> **How does this company compare against this tender/scope, requirement
> by requirement?**

It does not answer:

> **Which three tenders should we bid on this week?**

``` text
Tender Intelligence ─────┐
                         │
Company Intelligence ─────┤
                         ↓
                 MATCHING ENGINE
                         ↓
               Evaluation Matrix
                         ↓
        VIABLE / REVIEW / BLOCKED
                         ↓
              PORTFOLIO ENGINE
                         ↓
              Which 3 of 40?
```

# 11. Full Arctis Architecture

``` text
                        MESSY DATA
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
      TENDER INTELLIGENCE           COMPANY INTELLIGENCE
             │                             │
             ▼                             ▼
      CANONICAL TENDER              CANONICAL COMPANY
             └──────────────┬──────────────┘
                            ▼
                    MATCHING ENGINE
                            │
                  Requirement-by-Requirement
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          RULE            EXACT         SEMANTIC
         MATCHER          MATCHER         MATCHER
             └──────────────┼──────────────┘
                            ▼
                     MATCH RESULTS
                            │
                   PASS / FAIL / ?
                            │
                            ▼
                   EVALUATION MATRIX
                            │
                            ▼
              HARD BLOCKERS / KNOWLEDGE GAPS
                            │
                            ▼
                VIABLE / REVIEW / BLOCKED
                            │
                            ▼
                    PORTFOLIO ENGINE
                            │
                            ▼
                       TOP 3 BIDS
```

# 12. Hackathon Implementation Priority

## P0 --- Must Work

``` text
CanonicalTender
      +
CanonicalCompany
      ↓
Matching Task Generation
      ↓
Rule / Exact / LLM Matcher
      ↓
PASS / FAIL / UNCERTAIN
      ↓
Hard vs Soft
      ↓
Evaluation Matrix
      ↓
VIABLE / REVIEW / BLOCKED
```

Prioritize:

``` text
ME1–ME7
ME13–ME19
ME21
```

MVP demonstration: 1. One deterministic requirement check. 2. One
ontology/exact check. 3. One semantic reference check. 4.
`PASS / FAIL / UNCERTAIN`. 5. Hard blocker detection. 6. Evidence from
both tender and company. 7. One complete evaluation matrix. 8. Overall
`VIABLE / REVIEW / BLOCKED`.

## P1 --- Strong Demo Features

``` text
8-aspect grouping
Knowledge-gap feedback
Human override
Two-sided evidence UI
Qualification/reference drill-down
```

## P2 --- Architecture / Future

``` text
Lot-combination optimization
Sophisticated incremental dependency re-evaluation
Learned matching from user corrections
Complex scoring models
Large-scale ontology management
Advanced semantic retrieval
```

# 13. Engineering Principles

1.  **Canonical data in, match results out.**
2.  **Requirement-level matching is the core abstraction.**
3.  **Use deterministic logic first.**
4.  **Use normalized ontology matching second.**
5.  **Use constrained semantic/LLM matching only where necessary.**
6.  **No evidence means no trusted semantic claim.**
7.  **Missing information is `UNCERTAIN`, not automatically `FAIL`.**
8.  **Mandatory and optional conditions must remain distinct.**
9.  **A hard failure is more important than twenty soft matches.**
10. **Do not collapse explainability into a single similarity score.**
11. **Every result explains both sides: what the tender requires and
    what company information was checked.**
12. **References deserve dedicated matching logic.**
13. **Scope must never be lost: tender, lot, and lot-specific
    requirements remain distinct.**
14. **Human corrections must be auditable rather than silently replacing
    system output.**
15. **The eight decision aspects organize results; they do not perform
    matching.**
16. **Matching and portfolio selection are separate problems.**
17. **Keep the Matching Engine boring and predictable.** The difficult
    engineering is converting messy tender/company information into
    trustworthy canonical representations.
