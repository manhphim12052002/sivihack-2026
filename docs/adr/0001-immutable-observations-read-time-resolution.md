---
status: accepted
date: 2026-09-17
---

# Observations are immutable; resolution is a read-time view

Every reading of a Fact or Requirement (one source, one extractor) is stored as its own row and
never updated or deleted. The value the application shows is selected by a view: highest extractor
precedence wins (structured notice field > rule over notice text > model over document > model
over notice text); at equal precedence, agreeing rows merge their evidence and disagreeing rows
make the item `CONFLICTING` with no current value. A structured value still wins over a
disagreeing document value, but the disagreement is flagged rather than hidden.

We chose this over a merge step that writes canonical rows because re-running an extractor at
2am must never destroy a better earlier answer, because the estimator needs to see "notice says
no guarantee, contract says 5%" rather than an averaged value, and because a materialised
canonical table would need its own invalidation when a new document or notice version arrives.

## Consequences

- The primary key of an observation includes the source, so two documents stating the same
  requirement are two rows, not a conflict on insert.
- Observations read from documents attach to the Procedure and Lot without a notice version;
  a corrected notice does not invalidate document reads and does not trigger a second model call
  on the same file.
- Rows from a superseded notice version stay stored and drop out of the view.
- There is no per-field history object; history is the set of rows behind a resolved value.
