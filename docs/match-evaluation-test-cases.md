# Match evaluation — known PURSUE test cases

Reference for demoing/testing the eligibility engine (`POST /api/match`, rendered by
`MatchEvaluationPanel` on `/tenders/[id]?company=<id>`). Most tender/company pairs correctly
land on `REVIEW` or `BLOCKED` — a clean `VIABLE` ("Pursue") needs every HARD check to resolve,
which is rare by design. This page records the pairs that were swept and verified live against
the running app, so a demo or test run doesn't have to re-discover them.

## How these were found

`data/json-db/lots_latest.json` + `observations_resolved.json` give every lot's resolved
`trade_scope` CPV. `data/json-db/companies.json` gives each company's `cpv_prefixes`. Cross the
two, keep only lots whose CPV is a real 8-digit code within a company's prefix list (a 2-digit
code like `"45"` can never resolve past the ontology hard-gate — see "Known limitation" below),
prefer lots with no `documents.status == RETRIEVED` (skips the LLM-driven `SEMANTIC` task
entirely, so the result can't flip on model variance), then confirm region overlap and re-run
live via `POST /api/match`.

## Verified PURSUE (`VIABLE`, 0 blockers / 0 unknowns / 0 concerns)

### 1. `COMP-brenner` × "Strassenbauarbeiten"

```json
{
  "tender_id": "oeffentlichevergabe.de|25811770|1|LOT-0000",
  "company_id": "COMP-brenner"
}
```

- Notice: Strassenbauarbeiten, 87527 Sonthofen, Bayern (`DE2`), CPV `45233120` (road works),
  deadline 2026-09-22. https://oeffentlichevergabe.de/ui/de/notice/25811770
- Company: Brenner & Sohn Tiefbau GmbH — road/civil/earthworks, Bavaria/Schwaben/Oberbayern,
  `cpv_prefixes: ["45233","45232","45111","45112"]`.
- All 9 checks PASS:
  - CPV `45233120` matches trade prefix `45233`.
  - Place of performance `DE2` (Bayern) is in the company's stated regions.
  - Submission deadline is in the future.
  - 6 company hard-exclusion constraints (rail-adjacent, rail-side, DB qualification, bridge,
    outside Germany, "brücke") — none triggered by this trade scope.

### 2. `COMP-brenner` × "S22 Streckenbauarbeiten"

```json
{
  "tender_id": "oeffentlichevergabe.de|25801956|1|LOT-0000",
  "company_id": "COMP-brenner"
}
```

- Notice: S22 Streckenbauarbeiten, 87616 Marktoberdorf (B 16), Bayern (`DE2`), CPV `45233120`,
  deadline 2026-09-22. https://oeffentlichevergabe.de/ui/de/notice/25801956
- Same company, same 9-check breakdown as case 1 (identical CPV/region/deadline shape).

Both notices carry no retrieved documents, so the fact sheet only has `trade_scope`,
`place_of_performance` and `submission_deadline` — no `references_required` or
`eligibility_proofs` task is generated, and no LLM call happens. Re-run twice each on
2026-09-18; both stable at `VIABLE`.

## A near-miss worth keeping (correct REVIEW, not a bug)

```json
{
  "tender_id": "oeffentlichevergabe.de|63a3db61-8dae-437d-b9a1-4f1bf3b9c069|01|LOT-0001",
  "company_id": "COMP-metallbau-westfalen"
}
```

"Erw. Gesamtschule Verl; Deckensystem Baffeln" — CPV `45421140`, NRW (`DEA42`). Every HARD
check passes (CPV prefix `45421`, region, deadline, all exclusions) except
`REFERENCE`: *"Only 0 verified reference(s) found; 3 required."* Metallbau Westfalen's three
references are all door/facade jobs (T30 fire doors, aluminium doors, automatic-door drives) —
none comparable to a ceiling-baffle install. Good to demo the reference-comparability gate
actually discriminating rather than rubber-stamping a CPV-prefix match.

## Known limitation (not fixed by this doc)

~42% of ingested lots (84 of 201 in the current dataset) have `trade_scope` resolved to a bare,
non-8-digit CPV division code (typically `"45"`, evidenced by the buyer's own notice XML, e.g.
`oeffentlichevergabe.de|25801420|1|LOT-0000`). The router only takes the deterministic
CPV-prefix path when the value starts with 8 digits (`router.ts:161`); anything shorter falls to
the ontology label matcher, which cannot classify a bare number and always resolves to `OTHER` —
and `OTHER` is never counted as a match (`ontology-matcher.ts:45-46`). That caps every company
at `REVIEW` for those lots regardless of fit. `COMP-metallbau-westfalen`'s capability rows were
also fixed from `OTHER` → `METAL_CONSTRUCTION` (`normalize.ts`, 2026-09-18) — that's a real,
separate fix (helps on any lot with a proper CPV/descriptive trade scope) but does not unblock
the coarse-CPV lots themselves. Not addressed here; flagged for a future fix (e.g. fall back to
lot title text when the CPV is coarser than 8 digits).
