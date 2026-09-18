# Arctis Compass --- 5-Minute Hackathon Pitch Plan

## Core Story

> **40 opportunities arrive. You can bid on 3. Arctis Compass turns
> messy procurement data into three defensible decisions.**

The pitch should not try to demonstrate every feature. It should tell
one coherent story:

**Messy procurement data → structured intelligence → constraint-aware
matching → evidence-backed decisions → Top 3 opportunities**

The technical sophistication should appear through the product demo
rather than through dense architecture slides.

------------------------------------------------------------------------

# Product Capabilities to Make Visible

## 1. Messy Tender → Structured Tender Intelligence

### What to show

Start with an ugly procurement package:

``` text
DB_Infrastruktur.zip

├── eForms.xml
├── Leistungsbeschreibung.pdf
├── Eignungskriterien.pdf
├── Preisblatt.xlsx
└── Änderung_02.pdf
```

Then show the structured result:

``` text
✓ 2 lots detected
✓ 14 mandatory requirements
✓ 3 commercial conditions
✓ 2 reference requirements
✓ 1 amendment applied
⚠ 2 unresolved conditions
```

Click one extracted requirement:

``` text
3 comparable railway references required

Source: Eignungskriterien.pdf · p.17
Applies to: LOT-02
Mandatory
```

### What this proves

-   Handles heterogeneous procurement data
-   Understands lots and requirement scope
-   Handles amendments/corrections
-   Preserves provenance
-   Converts documents into a decision-ready canonical representation

### Pitch message

> **We don't just summarize tender documents. We turn messy procurement
> packages into structured, traceable decision intelligence.**

------------------------------------------------------------------------

## 2. Company Intelligence

### What to show

Example company:

**Brenner & Sohn Tiefbau GmbH**

``` text
Capabilities
✓ Road construction
✓ Sewer construction
✓ Earthworks

Operating area
✓ ~150 km from Augsburg

Commercial
€400k–€4M preferred
> €5M → partner required

References
3 verified

Qualifications
...

Hard constraints
✕ Railway-side projects
✕ Bridges

Current capacity
2 crews committed until March
```

Add a small indicator such as:

> **Built from 6 company documents**

### What this proves

Matching is not based on a generic company description.

The system builds reusable intelligence about:

-   capabilities
-   geography
-   commercial limits
-   references
-   qualifications
-   resources
-   capacity
-   constraints
-   preferences

### Pitch message

> **We build a reusable company intelligence layer, so every new tender
> is evaluated against what the company can actually do.**

------------------------------------------------------------------------

## 3. Evaluation Matrix --- Hero Feature

This should be one of the strongest screens in the demo.

### Example

  Requirement         Result      Why
  ------------------- ----------- ------------------------------
  Road construction   PASS        Brenner capability
  Augsburg region     PASS        61 km from base
  €3.0M lot value     PASS        Preferred €0.4--4M
  3 road references   PASS        3 qualifying references
  PQ-VOB              PASS        Verified qualification
  Rail-side work      FAIL        Hard company exclusion
  Guarantee           UNCERTAIN   Current availability unknown

Then:

``` text
OVERALL
BLOCKED

Hard blocker:
Rail-side construction conflicts with
Brenner's explicit operating constraints.
```

### What this proves

-   Fit is not similarity
-   Requirements are evaluated independently
-   Hard blockers cannot be hidden by many positive signals
-   Missing information remains uncertain rather than being hallucinated
-   Decisions are inspectable

### Key message

> **One hard red can matter more than ten green similarities.**

Avoid presenting a black-box percentage such as:

``` text
82% Match
```

The evaluation matrix is much more defensible.

------------------------------------------------------------------------

## 4. Explicit Lot Awareness

Make this visible rather than treating it as backend sophistication.

### Example

``` text
Rail Infrastructure Project

LOT 01 — Road access works
€3.0M
→ VIABLE

LOT 02 — Railway bridge
€7.0M
→ BLOCKED
```

Switch between the two lots during the demo.

### What this proves

The same procurement can contain scopes with completely different
company fit.

### Pitch message

> **We don't match companies to documents. We match companies to the
> actual bid scope.**

For a selected lot, matching should consider:

-   procedure/global requirements
-   tender-level requirements
-   all-lots requirements
-   selected lot requirements

and exclude requirements belonging only to other lots.

------------------------------------------------------------------------

## 5. Decision Dashboard: Thousands → Top 3

This is where technical scalability becomes business value.

### Example dashboard funnel

``` text
MONDAY INBOX

2,184 active tender/lot scopes
        ↓
127 relevant candidates
        ↓
34 fully evaluated
        ↓
18 blocked
7 need review
9 viable
        ↓
3 RECOMMENDED FOR THIS WEEK
```

Then show the Top 3 opportunity cards.

Example:

``` text
#1 Augsburg Road Rehabilitation
LOT 02 · €2.8M

VIABLE
6 PASS · 1 CONCERN

Why pursue
✓ Core road capability
✓ 42 km from base
✓ 3 qualifying references
✓ Preferred project size

Bid deadline: 6 days

[View reasoning]
```

### What this proves

The system is designed for realistic tender volumes rather than a demo
with five manually selected documents.

------------------------------------------------------------------------

# Explainability UX

Every verdict should support progressive disclosure:

``` text
Overall Decision
      ↓
Decision Aspect
      ↓
Atomic Requirement
      ↓
Tender Evidence ↔ Company Evidence
```

Example:

``` text
REFERENCES                         PASS

Requirement
3 comparable road projects
within the last 5 years

Tender evidence
Eignung.pdf · p.17

Matched company evidence

✓ B17 Road Rehabilitation · 2025 · €3.1M
✓ Augsburg District Road · 2024 · €2.4M
✓ State Road B300 · 2023 · €3.7M

[View sources]
```

### Core explainability message

> **Explainability isn't an LLM explanation. It's an evidence chain.**

The system should show both:

1.  What the tender required
2.  What company evidence was checked

------------------------------------------------------------------------

# Human-in-the-Loop Feature

Make uncertainty actionable.

Example:

``` text
AI result: UNCERTAIN

DB qualification status unknown.

[Confirm]
[Correct]
[Upload evidence]
```

After uploading evidence:

``` text
UNCERTAIN → PASS
Evaluation updated
```

### Product loop

``` text
AI extracts
     ↓
System reasons
     ↓
Human verifies
     ↓
Company knowledge improves
```

This demonstrates that the product does not pretend the AI always knows
the answer.

------------------------------------------------------------------------

# 5-Minute Presentation Structure

## Slide 1 --- The Problem

**Target: \~20--25 seconds**

### Headline

> **40 tenders Monday morning. Capacity to bid: 3.**

### Visual

``` text
40 opportunities
↓
thousands of pages
↓
hours of estimator screening
↓
3 bids
```

### Narration

> The problem isn't finding more tenders. It's knowing which three
> deserve scarce estimator time.

### Goal

Immediately establish the scarce-resource problem.

------------------------------------------------------------------------

## Slide 2 --- Why Existing Matching Is Not Enough

**Target: \~30 seconds**

### Headline

> **Fit is not similarity.**

### Visual

``` text
ROAD PROJECT

95% semantic similarity

        BUT

Mandatory railway qualification
Company doesn't have it

        ↓

NO BID
```

### Narration

Explain that eligibility and operational blockers can be buried across:

-   notices
-   lots
-   attachments
-   amendments
-   qualification requirements
-   company evidence

A semantic similarity score can therefore look excellent while the
opportunity is impossible to pursue.

### Goal

Establish the core domain insight.

------------------------------------------------------------------------

## Slide 3 --- Arctis Compass

**Target: \~60 seconds including transition into demo**

### Visual

``` text
MESSY PROCUREMENT                 COMPANY KNOWLEDGE

XML PDF XLSX DOCX                 References
Amendments                        Qualifications
Lots                              Capabilities
        │                         Constraints
        └──────────┬──────────────┘
                   ↓
             ARCTIS COMPASS
                   ↓
          Requirement Matrix
                   ↓
          PASS / UNCERTAIN / FAIL
                   ↓
             3 bids to pursue
```

### Narration

Keep architecture explanation short.

Explain:

1.  Tender Intelligence structures messy procurement material.
2.  Company Intelligence captures the bidder's actual capabilities and
    constraints.
3.  Matching evaluates atomic requirements.
4.  Portfolio prioritization converts viable opportunities into the
    shortlist.

Then move quickly into the product.

------------------------------------------------------------------------

## Slide / Demo 4 --- The Wow Moment

**Target: \~70 seconds**

Use Brenner against a multi-lot railway/infrastructure procurement.

### LOT 01

``` text
Road access works
€3M

✓ Capability
✓ Geography
✓ Size
✓ References

VIABLE
```

### Switch to LOT 02

``` text
Railway bridge
€7M

✓ Broad construction capability
⚠ Partner required
✕ Rail-side hard exclusion

BLOCKED
```

Then click the blocker.

Show:

-   tender requirement
-   exact source/evidence
-   company constraint/evidence
-   resulting reasoning

### Suggested narration

> Compass doesn't ask an LLM whether these two documents look similar.
> It decomposes the tender into atomic requirements, evaluates each
> against structured company evidence, and respects hard constraints.
> The same procurement can therefore be viable for one lot and
> impossible for another. And every verdict traces back to both sides of
> the evidence.

### Goal

Demonstrate simultaneously:

-   domain understanding
-   lot awareness
-   hard constraints
-   matching
-   explainability
-   provenance

------------------------------------------------------------------------

## Slide 5 --- Designed for Thousands, Not 40

**Target: \~40 seconds**

### Visual

``` text
2,184 opportunities
        ↓
High-recall retrieval
        ↓
127 candidates
        ↓
Rules first
        ↓
Semantic reasoning only when needed
        ↓
Persisted evaluations
        ↓
TOP 3
```

Use three short concepts:

### Retrieve broadly

CPV · geography · value · deadlines

### Reason selectively

Rules → ontology → semantic

### Evaluate once

Cached · versioned · auditable

### Suggested narration

> We don't run an LLM across every company-tender pair. Cheap
> deterministic retrieval narrows the search, expensive reasoning only
> resolves ambiguous matches, and evaluations are persisted until the
> tender or company changes.

### Goal

Show scalability without presenting backend architecture.

------------------------------------------------------------------------

## Slide 6 --- Business / Impact

**Target: \~60 seconds**

Business teammate owns most of this slide.

### Core transformation

``` text
TODAY

Estimator time spent deciding
whether to bid

        ↓

ARCTIS COMPASS

Estimator time spent preparing
the bids worth winning
```

### Customer

Initial persona:

**50--500 employee construction companies**

Typical characteristics:

-   many public opportunities
-   limited estimating capacity
-   fragmented tender documents
-   significant cost of preparing bids
-   valuable institutional knowledge spread across documents and
    employees

### Business story

Connect product value directly to scarce estimator capacity:

-   less screening effort
-   fewer late-discovered blockers
-   fewer attractive opportunities missed
-   more estimator time allocated to viable bids
-   reusable company knowledge improves future screening

Use the team's chosen GTM / pricing / market sizing here.

### Closing line

> **From 40 opportunities to the right 3 --- with a reason for every
> decision.**

------------------------------------------------------------------------

# Four Capabilities to Name Explicitly

If there is only room for four product capabilities on a slide, use
these:

## 1. Messy-Data Intelligence

**eForms + documents + amendments → canonical tender and lot
intelligence**

Handles heterogeneous procurement material while preserving scope and
provenance.

## 2. Constraint-Aware Matching

**Eligibility + references + qualifications + capacity + hard blockers**

Fit is determined by actual requirements and company constraints, not
semantic similarity alone.

## 3. Evidence-First Explainability

**Tender requirement ↔ company evidence**

Every decision can be inspected, corrected and traced to source
evidence.

## 4. Scalable Prioritization

**High-recall retrieval → selective matching → persisted evaluations →
Top 3**

Designed to screen thousands of tender/lot scopes without running
expensive reasoning across every possible pair.

------------------------------------------------------------------------

# What NOT to Spend Pitch Time On

Do not make main slides about:

-   Supabase
-   PostgreSQL tables
-   CanonicalTender class definitions
-   cache keys
-   fingerprints
-   OpenRouter
-   LangSmith
-   embeddings
-   XML XPath implementation
-   individual database migrations
-   every one of the eight decision aspects
-   every procurement field
-   detailed system architecture

These are useful for judge Q&A, not for the five-minute narrative.

------------------------------------------------------------------------

# Judge Q&A Ammunition

If judges ask about scalability:

> Candidate retrieval is high-recall and deterministic. We only run full
> matching on plausible company--bid-scope pairs, use rules wherever
> possible, reserve semantic reasoning for fuzzy requirements, and
> persist evaluations until relevant company or tender state changes.

If judges ask why not embeddings/similarity:

> Similarity tells us whether two descriptions look related. Procurement
> screening requires determining whether mandatory conditions are
> actually satisfied. A company can be a 95% semantic match and still be
> legally or operationally unable to bid.

If judges ask about hallucinations:

> Missing evidence becomes UNCERTAIN, not PASS or FAIL. Important
> decisions retain source provenance, and users can correct or upload
> missing company evidence.

If judges ask about explainability:

> We don't rely on an LLM-generated explanation after the decision. The
> decision itself is built from atomic requirement results with
> tender-side and company-side evidence.

If judges ask about amendments:

> Tender state is versioned. Changes invalidate affected persisted
> evaluations, so decisions can be recomputed against the current
> procurement state while retaining the previous reasoning for
> auditability.

If judges ask about lots:

> The matching unit is the actual bid scope. For a lotted procurement,
> we evaluate each lot against applicable global and lot-specific
> requirements rather than treating the entire notice as one
> opportunity.

------------------------------------------------------------------------

# Final Narrative

The entire pitch should feel like one continuous transformation:

``` text
MESSY DATA
     ↓
PROCUREMENT STRUCTURE
     ↓
ACTUAL BID SCOPE / LOT
     ↓
ATOMIC REQUIREMENTS
     ↓
COMPANY EVIDENCE
     ↓
CONSTRAINT-AWARE MATCHING
     ↓
PASS / UNCERTAIN / FAIL
     ↓
EVIDENCE-BACKED DECISION
     ↓
SCALABLE PRIORITIZATION
     ↓
TOP 3
```

## One-Sentence Product Positioning

> **Arctis Compass turns messy procurement packages and fragmented
> company knowledge into a traceable shortlist of the bids worth
> spending estimator capacity on.**

## Closing

> **From 40 opportunities to the right 3 --- with a reason for every
> decision.**
