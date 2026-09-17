# Research Report: BidFix.ai — Solution Analysis

**Conducted:** 2026-09-17 16:43 CET
**Relevance:** BidFix is a direct commercial incumbent of SiviHack Track 2 ("Three Out of Forty"). Their "Qualification Agent" *is* our challenge.

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Methodology](#methodology)
3. [What BidFix Actually Sells](#what-bidfix-actually-sells)
4. [The Four Modules](#the-four-modules)
5. [Data Model & Sources](#data-model--sources)
6. [Trust / Compliance Posture](#trust--compliance-posture)
7. [Gap Analysis vs. Track 2](#gap-analysis-vs-track-2)
8. [Recommendations for Our Build](#recommendations-for-our-build)
9. [Competitive Landscape](#competitive-landscape)
10. [Unresolved Questions](#unresolved-questions)

## Executive Summary

BidFix (legal entity **Fix Solutions GmbH**, Germany) sells a German/EU **"KI-Betriebssystem für die öffentliche Vergabe"** — an end-to-end SaaS covering the full public-procurement bid lifecycle: find opportunity → decide bid/no-bid → generate the submission folder. Claims 2,000+ companies, named customers (JobRad, Scompler, amexus, Remove.tech). Free tier + demo-led sales; pricing not public.

Their pipeline is **Signal → Search → Qualification → Submission**. Track 2 asks us to build *exactly* their Qualification stage, plus a slice of Search. So: our challenge is a validated, commercially funded problem — good for judging criterion 1.5 (real-world value). But it also means judges may have seen similar demos, so criterion 1.6 (differentiation) is where we must win.

**Two things BidFix does that we should copy outright:** (1) qualification is a **weighted evaluation matrix** ("Wertungsschema"), not a similarity score — requirements are checked *gegen Referenzen und Zertifikate*, then surfaced with an explicit **"Empfehlung: Bieten"** + per-criterion status like *"Eignung erfüllt"*; (2) the company profile is a structured **Wissensdatenbank** (references, certificates w/ validity dates, concept blocks, portfolio + region + budget band €100k–5M), not a free-text blob. That structure is precisely what makes a second company profile produce a genuinely different shortlist — the Track 2 acceptance test.

**Where they leave room for us:** BidFix's differentiator is *breadth* (100+ platforms, council-protocol pre-signals, 90% document auto-fill) and their Qualification Agent runs in "hours"/"4 minutes" on hundreds of pages — meaning it's LLM-extraction-led. Their marketing shows *status* per criterion but nothing suggests an **estimator-contestable reason with document citation and quantified margin** ("you fail this — reference required is €2.5M single project, your largest is €1.8M, see Eignungskriterien §4.2 p.17"). Track 2's bonus points ask for exactly that. **Auditable, citation-anchored, disagreeable reasoning is our wedge — not coverage.**

## Methodology

- Sources consulted: 5 fetches/searches (2 returned 404 — docs site not publicly reachable)
- Primary: bidfix.ai homepage, bidfix.ai/produkt; search across bidfix.ai subpages, produktneutral.de, tenderautomation.de, openpr.de
- Date range: 2025 comparison posts → 2026 site copy (current)
- Search terms: "BidFix AI tender bid management Ausschreibung Vergabe"
- **Limitation:** all product detail is vendor marketing copy. No hands-on trial, no docs access, no independent benchmark. Treat all metrics below as claims.

## What BidFix Actually Sells

| Attribute | Detail |
|---|---|
| Entity | Fix Solutions GmbH (DE) |
| Positioning | "Das KI-Betriebssystem für die öffentliche Vergabe" |
| Thesis (verbatim) | Manual effort "too often decides over award, not offer quality" |
| Target | German/EU companies bidding on public contracts (IT, consulting, services — not construction-specific) |
| Delivery | Cloud SaaS, free tier, demo-led, German UI |
| Scope | Vertically integrated end-to-end, EU-optimized (processes, languages, compliance) |
| Traction claim | 2,000+ companies |

**Claimed outcomes** (vendor-stated, unverified): 90% less search time (amexus) · win-rate 20→30% (Service Health) · +50% relevant tenders (Scompler) · 80% time saved on questionnaires (Remove.tech) · "+82% win-rate" platform-wide.

Honest read: the metrics are mutually inconsistent in framing (percentage-point vs relative) and uncited. Marketing, not evidence.

## The Four Modules

### 1. Pre-Tender Intelligence — *the genuinely clever one*
Monitors **council/committee documents (Ratsdokumente) from 10,000+ German municipalities** to surface procurement intent **months before** the official notice.
- In: user topics + regions. Out: daily alerts w/ original source, budget references, comparable past procurements, contact persons, next steps.
- Verbatim: *"Früher haben wir Vergaben erst bei der Veröffentlichung gesehen. Heute kennen wir Vorhaben Monate vorher."*
- **This is their real moat** — a data-acquisition play, not an AI play. Not replicable in a hackathon; don't try.

### 2. Search Agents
Daily autonomous scan of DE + EU, claimed "100% coverage", results "hours-to-days earlier than aggregators".
- In: service portfolio, target regions, contract-size band, **user like/dislike feedback**. Out: matched tenders; search profile self-refines → "bis zu 95 % genauere Treffer".
- Note the feedback loop — cheap relevance learning without model training.

### 3. Qualification Agents — **our challenge, already productized**
Bid/no-bid analysis over hundreds of pages, claimed in **4 minutes** (homepage) / "hours instead of days" (product page).
- **In:** full tender documentation + company knowledge base (references, certificates) + an internal **evaluation matrix**.
- **Out:** extracted *Eignungskriterien* (eligibility) and *Zuschlagskriterien* (award criteria); automated compliance check; visualization of the weighted scoring logic; filled evaluation matrix + recommendation.
- Verbatim logic: *"Gewichtung von Preis und Leistung, Lose und Wertungsschema auf einen Blick"*; requirements checked *"gegen Referenzen und Zertifikate"*.
- Verbatim output: **"Empfehlung: Bieten"** with criterion status **"Eignung erfüllt"**.

**Key structural insight:** they explicitly model *Lose* (lots) and the *Wertungsschema* (price/quality weighting). A tender split into lots changes eligibility per lot — any Track 2 solution that treats a tender as one atomic object will look naive to a judge who knows German procurement.

### 4. Bid Agents
Generates the *Vergabeunterlagen* response — "up to 90%" pre-filled.
- Concepts written from the knowledge base *"im Ton Ihrer gewonnenen Angebote"* (in the voice of your won bids); Excel *Leistungsverzeichnisse* and forms completed ("80% faster than by hand"); references/certificates assembled; phase plan with milestones, assignments, approval gates.
- Human approval required before submission; team tasks/reviews tracked.

## Data Model & Sources

**Ingestion:** TED (EU) · bund.de · DTVP · Vergabe24 · cosinex · "all further procurement platforms" (aggregate claim: 100+, daily refresh) · council documents of 10,000+ municipalities.

**Company knowledge base (the profile schema — steal this):**
- **References** (example UI: "6 verified") — verification status is a first-class field
- **Certificates** — with *validity dates* (an expired ISO cert = hard fail; a date-aware check is a cheap credibility win)
- **Concept building blocks** (example: 42 templates)
- **Portfolio**: services offered · contract types (e.g. *Rahmenverträge*) · geographies · budget band (€100k–€5M)

**Integrations:** SharePoint, Google Drive, Confluence, OneNote, Teams, Salesforce — "real-time currency without duplicate data entry". I.e. the knowledge base is synced from where the company already keeps its references, not hand-entered. Sensible; irrelevant for a 24h demo.

```
Ratsdokumente (10k municipalities) ─┐
TED / bund.de / DTVP / Vergabe24 ───┼─→ [Search Agent] ──→ matched tenders
cosinex / 100+ platforms ───────────┘        ↑ like/dislike feedback
                                             ↓
                        tender docs (100s pp) + Wissensdatenbank
                                             ↓
                              [Qualification Agent]
                    Eignungskriterien · Zuschlagskriterien · Lose · Wertungsschema
                                             ↓
                        Wertungsmatrix + "Empfehlung: Bieten"
                                             ↓
                              [Bid Agent] → 90% pre-filled folder → human approval
```

## Trust / Compliance Posture

DSGVO-compliant · **ISO 27001 certified** · hosted in Germany · AES-256 · public Trust Center (Vanta). Worth one slide-line in our pitch as a *growth-path* item (criterion 1.5): German public-sector buyers and Mittelstand construction firms will ask about data residency before features.

## Gap Analysis vs. Track 2

| Track 2 requirement | BidFix | Our opening |
|---|---|---|
| Screen 40 tenders/week down to ~3 | Yes — core product | Parity expected; table stakes |
| Re-run for a different company → different shortlist | Yes — structured profile drives it | **Must match this or we fail the acceptance test** |
| Explain *why*, in terms an estimator could **disagree with** | Shows per-criterion status + weighted matrix; no evidence of quantified, citation-anchored rationale | **Primary wedge: cite the clause, quantify the margin, name the disqualifier** |
| Read into the actual tender documents, not just notice metadata | Yes — parses hundreds of pages | Parity needed. Notice-metadata-only = judged as shallow |
| Construction-specific (CPV 45): *Bauzeit*, *Vertragsstrafen*, *Bürgschaftsrahmen*, *Referenzen* | Generic/IT-services framing observed; no construction specialization visible | **Domain depth wedge: bonding capacity, construction window vs. crew availability, penalty-clause risk** |
| Financial-guarantee limits & contract-size fit | Budget band only (€100k–5M) | Model *Bürgschaftsrahmen* headroom as a hard constraint, not a range filter |
| Region / travel feasibility | Target regions field | Distance-to-site, not region enum |
| Generalize to unseen company/tender pairs (judges bring their own) | Production system, assume yes | Deterministic rule engine + LLM extraction generalizes; prompt-tuned-to-examples does not |

**Brutal takeaways:**
1. We cannot beat BidFix on coverage, pre-signals, or document generation. Don't compete there; one slide acknowledging the market (shows we did homework) is enough.
2. Track 2's two bonus criteria are precisely BidFix's least-demonstrated area. Aim the whole demo there.
3. BidFix's existence is an *asset* for criterion 1.5: the problem is funded and validated. Say so on stage.
4. Their construction blind spot is real. A CPV-45-native tool reasoning about *Bauzeit*, *Vertragsstrafen* and *Bürgschaft* is a defensible differentiator (criterion 1.6).

## Recommendations for Our Build

1. **Structured company profile, hard-constraint-first.** Copy their schema and extend for construction: services/CPV codes · operating radius (km, not enum) · annual revenue · **Bürgschaftsrahmen** (total + currently committed → headroom) · references (project value, scope, client type, year, verified y/n) · certificates (type + **valid-until**) · crew/equipment capacity · booked construction windows.
2. **Two-stage decision, separated cleanly.** Stage A: deterministic **hard knock-outs** (region, contract value vs. guarantee headroom, missing mandatory cert, expired cert, reference threshold not met, construction window collision) → binary, auditable, generalizes to unseen profiles. Stage B: **weighted soft fit** (award-criteria favorability, competition intensity, margin outlook) → ranks survivors. Never let an LLM produce the knock-out verdict; use it to *extract* the criterion, then evaluate in code.
3. **Every reason is a quantified claim + a citation.** Template: `FAIL | Referenzanforderung | required: ≥1 project ≥ €2.5M, Hochbau, last 5y | you: max €1.8M (Stadthalle, 2023) | shortfall €0.7M | source: Eignungskriterien §4.2, p.17`. An estimator can disagree with that. They cannot disagree with "78% match".
4. **Model lots (*Lose*).** Qualify per lot; a company can be eligible for Lot 2 and not Lot 1. This is cheap to add and reads as real domain knowledge in Q&A.
5. **Date-aware certificate/reference checks.** Expired ISO cert, reference outside the "last 5 years" window. Two lines of code, high credibility payoff.
6. **Nail the profile-swap demo.** One click switches company → shortlist visibly reshuffles → and the *reasons change too*, showing the same tender passing for A and failing for B on a named constraint. That's the moment that proves it isn't text matching. Rehearse it.
7. **Anti-overfit hedge** (judges bring unseen pairs): drive everything off the profile schema and extracted criteria — no company names, no hardcoded tender IDs, no example-tuned prompts. Test with a third, hand-made profile before submission.

## Competitive Landscape

BidFix is classed as an **aggregator-plus-AI** tool in German comparison roundups. Other names to be ready for in Q&A: DTVP, Vergabe24, cosinex (platforms/aggregators — BidFix consumes them), plus tenderautomation.de and produktneutral.de tool comparisons listing ~7–8 Ausschreibungssoftware products. **Expect the Q&A question "how is this different from BidFix?"** — answer: auditable per-criterion reasoning with document citations, construction-domain constraints (Bürgschaft, Bauzeit, Vertragsstrafen), lot-level qualification. Not coverage.

## Unresolved Questions

1. **Pricing / packaging** — not public. Blocks any ROI-vs-incumbent argument on stage.
2. **docs.bidfix.ai returned 404** on both `/` and `/einfuehrung` (search-indexed but not fetchable) — no access to real architecture, data model fields, or API surface. All product detail here is marketing copy.
3. **Does BidFix cite source clauses?** Cannot confirm from marketing whether the Qualification Agent links each criterion back to a page/clause in the tender documents. If it does, our wedge narrows to construction-domain depth. Worth 10 minutes on their free tier before the pitch.
4. **Construction coverage** — customer logos and examples are IT/services. Is CPV 45 an unserved segment or just unmarketed? Unknown.
5. **"4 minutes" vs "hours"** — homepage and product page disagree on Qualification Agent runtime. Unresolved; suggests the 4-min figure is a best case.
6. **Company facts** — founders, funding, headcount, founding year not published on the site (openpr.de press release unread; may contain them).
7. **"100% coverage" / "+82% win-rate"** — no methodology. Unverifiable.
