---
status: accepted
date: 2026-09-17
---

# Acquire notices from the lot search index, parse eForms only, keep bulk export as backfill

ÖffentlicheVergabe documents one acquisition path, a bulk day/month export that is published
T+1. Its own web client uses an undocumented, keyless, lot-grained search endpoint that returns a
notice minutes after publication and supports CPV, date and NUTS filters server-side. We poll
that endpoint with a publication-date watermark, fetch full notices one by one, and keep the
documented bulk export as a `backfill` command for history and as the fallback if the search
index changes shape.

We parse the eForms rendering only. It is the publisher's original submission; CSV and OCDS are
lossy conversions of it and neither carries the submission deadline or the eligibility prose
(measured in `docs/tender-data-extraction.md`). A `source_format` column keeps a second format
additive if a concrete gap appears; OCDS release history for amendments is the only candidate.

## Consequences

- We depend on an undocumented endpoint. The bulk export path must stay working as the fallback.
- Hard ceiling of 10,000 results per query; history is windowed by date.
- Namespace prefixes vary across the feed; all XPaths resolve by namespace URI.
- Polling is a stateless command against a DB watermark, so any scheduler can drive it.
