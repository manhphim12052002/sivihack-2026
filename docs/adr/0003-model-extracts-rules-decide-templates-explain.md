---
status: accepted
date: 2026-09-17
---

# The model extracts, rules decide, templates write the reasons

The language model's only job in the pipeline is to turn German procurement text into typed
observations with a verbatim quote and a locator. The Bid / No-Bid decision is a pure function
of typed observations and a typed company profile, four-valued (`Blocker | Risk | OK | Unknown`),
and the reason shown to the estimator is a filled template with the untranslated source quote.
The model never ranks, never scores, and never writes a reason.

We chose this over letting the model judge fit or write prose because the output must be a
comparison an estimator can disagree with, must be identical on an unseen company and tender
pair, must be reproducible from stored data, and must keep working when the venue network is
down. Fluent model prose that does not match the rule that fired would fail all four.

## Consequences

- Every decision rule reads one typed condition shape and one company constraint; adding a
  criterion means adding a Requirement kind, a condition shape and a rule together.
- Missing data is `Unknown`, never a pass and never a fail, and is what triggers document reading.
- The model may write one headline sentence per tender for display; nothing downstream reads it.
- Confidence is derived from the extractor route, not asked of the model.
