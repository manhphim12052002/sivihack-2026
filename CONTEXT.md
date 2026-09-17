# Tender Screening

Screens German public construction procurements for a contractor: a document pipeline turns
notices and their attachments into evidence-backed facts and requirements; a decision pipeline
compares those against a company profile.

## Language

### Procurement structure

**Procedure**:
One public procurement as published by the buyer; it has one or more notice versions and one or
more lots. The top level of scope.
_Avoid_: Tender (collides with the German *Angebot*, the bidder's offer), contract, project

**Lot**:
The biddable unit inside a Procedure; the grain of screening. A Procedure with no explicit lots
has exactly one Lot.
_Avoid_: Row, record, item

**Notice**:
One published version of a Procedure's announcement (eForms XML). A later version can amend an
earlier one.
_Avoid_: Tender, announcement, Bekanntmachung (keep German only in UI copy)

**Scope**:
The level a Fact or Requirement applies to: a Procedure or a single Lot.
_Avoid_: Level, target, TENDER, ALL_LOTS

### Extracted knowledge

**Fact**:
A descriptive statement about the Procedure or Lot (place, CPV, estimated value, deadline, award
weights). The decision pipeline may compare a Fact against a Company constraint.
_Avoid_: Attribute, field, claim

**Requirement**:
A condition the buyer imposes on the bidder or the bid (a *muss* sentence in the source). Six
kinds: performance guarantee, comparable references, construction window, self-performance
minimum, penalty clause, contractor role. Each kind has its own typed condition shape.
_Avoid_: Criterion (reserved for the decision pipeline's comparison), eligibility, rule, condition

**Unmatched Requirement**:
A condition stated in the sources that no decision rule evaluates; kept and shown to the
estimator as "stated, not checked."
_Avoid_: Other, misc, dropped

**Company constraint**:
A typed limit in a company profile that one Requirement kind is compared against.
_Avoid_: Company fact, capability, profile field

### Evidence and resolution

**Source**:
A thing text was read from: a Notice version or a fetched document (PDF, DOCX, XLSX). Identified
by its URL and content hash.
_Avoid_: File, attachment, Vergabeunterlagen (UI copy only)

**Chunk**:
A page-sized piece of a Source's text, addressed by Source and page number.
_Avoid_: Passage, segment, paragraph

**Evidence**:
A verbatim German quote plus the Chunk (or notice field) it was read from. Never translated.
_Avoid_: Citation, reference (collides with Referenzen), proof

**Observation**:
One reading of one Fact or Requirement from one Source by one extractor, with its Evidence.
Observations are never deleted or overwritten.
_Avoid_: Claim, candidate, extraction, raw fact

**Resolved value**:
The Observation the read-time view selects for a Fact or Requirement after applying extractor
precedence and agreement checks. Not a stored object.
_Avoid_: Canonical item, final value, merged value, truth

**Extractor**:
The route an Observation arrived by: structured notice field, rule over notice text, model over a
document, model over notice text. Determines precedence and base Confidence.
_Avoid_: Method, source type, pipeline stage

**State**:
What is known about a Fact or Requirement: known, not found, referred to documents, or
conflicting. Independent of Confidence. Unknown is never a pass and never a fail.
_Avoid_: Status (reserved for document fetch and decision outcomes), confidence

**Confidence**:
How much to trust a Resolved value: high, medium or low, derived from its Extractor and evidence.
Not a probability.
_Avoid_: Score, probability, certainty
