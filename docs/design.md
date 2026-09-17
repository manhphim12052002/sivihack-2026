# Three Out of Forty — Frontend Design (SiviHack 2026, Track 2, Arctis AI)

Status: brainstorm 17.09.2026; re-scoped to the web app on 17.09 20:15. Backend architecture,
data pipeline, rules and API are decided separately by the backend owner and are not covered
here. Deadline 18.09 15:00. Pitch slot 18.09 16:00–20:00.

## Outcome

An estimator picks a company and sees which tenders of this week's batch go on the desk
and why every other one was set aside — each reason pointing at a fact in the tender
documents and the company fact it was compared against. Switching company produces a
different shortlist.

## Constraints

- ~22 hours, 2 builders + 1 curator/pitcher.
- Demo runs locally on the tech-checked laptop; no hosting. Real screenshots go into the
  slides; judges click through the app themselves in Q&A, so the UI must be self-explanatory.
- Judges bring unseen tender/company pairs → an ingest screen for a new tender and a paste
  screen for a new company are mandatory.
- Documents are German; UI is English, German quotes and terms shown verbatim.
- No mock data in the UI. When the API is not running, show an offline state.

## Non-goals

- Login, hosting, perfect German, accuracy metrics, any client-side scoring or ranking.
- Effort estimation, deadline calendar (mention as extensions only).

## Acceptance criteria (what a judge sees)

1. Pick Brenner & Sohn → a shortlist appears; open a rejected tender → a Blocker line with a
   German quote, document name and page.
2. Switch to Hanseatische Bau → a different shortlist without reload.
3. Upload an unseen tender and paste an unseen company → progress is visible, the result opens
   on the same briefing page as the batch tenders.
4. Every verdict line = status + reason + evidence quote + page + company fact. No score.
5. Facts not found in the documents show as `Unknown`, never guessed.
6. Code matches what the slides say (codebase is reviewed by TAs + AI).

## Screens (Next.js App Router, `apps/web`)

| route | purpose | shows |
|---|---|---|
| `/` | weekly triage | company selector; groups: On the desk (top *capacity* Bids), other Bids, Consider, No-go. Row: title, buyer, place, value, overall badge, counts of Blocker / Risk / Unknown |
| `/tenders/[id]?company=` | tender briefing | header facts; checklist table (criterion, status, reason, tender evidence quote_de + doc/page, company fact, numeric/semantic tag); fact sheet with confidence per field; documents list with retrieved flag. Without `?company=`: fact sheet + prompt to pick a company |
| `/companies` | company profiles | paste text or drop PDF/DOCX → normalized profile shown as an editable form → save; list of existing companies |
| `/ingest` | unseen tender | drop PDF(s)/ZIP or paste a notice URL → job progress stepper → link to the briefing when done |

Design rules: English labels, German term in parentheses on first use (Referenzen, Bauzeit,
Bürgschaft, Vertragsstrafe, Eigenleistung, Angebotsfrist, Vergabeunterlagen). Base font ≥ 16px,
readable at 1280px projector width. Status colours defined once: Blocker red, Risk amber,
OK green, Unknown grey; overall Bid green, Consider amber, NoGo red.

## Data the screens render (provisional)

Field names below are what the UI currently expects and live in one file,
`apps/web/src/lib/api-types.d.ts`. They are provisional until the backend owner publishes the
real contract; then that file is regenerated and the components adjust.

- **Tender summary / detail**: id, title, buyer, place, cpv, estimated value, submission
  deadline, lot count, docs_retrieved, lots[], documents[], fact_sheet.
- **Fact sheet**: 15 fields (trade scope, place, value, lots, references required, eligibility
  proofs, construction window, guarantees, penalty, self-performance minimum, side offers,
  consortium allowed, submission deadline, special qualifications, contractor role); each field
  carries value, confidence (high / medium / low / not_found) and evidence[] {doc, page, quote_de}.
- **Company profile**: name, home base, regions, radius, trades, contract band, references held,
  hard exclusions, guarantee capacity, self-perform share, earliest start, capacity per week, raw text.
- **Verdict**: overall (Bid / Consider / NoGo), ordered rank, counts, criteria[] {criterion,
  status, kind, reason_en, tender_evidence[], company_fact}.
- **Ingest job**: id, stage (queued → downloading → extracting_text → extracting_facts → done | error), pct, message, tender_id.

## Client

`apps/web/src/lib/api.ts` is the only place that knows URLs and fetch details. Base URL from
`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`. Health check drives the offline banner.
Endpoints the UI calls, to be confirmed against the backend contract: list tenders, get tender,
list/create/get/update companies, screen a company, start ingest, poll job.

## Repo layout

```
apps/web/             Next.js app (this document)
src/tender_extract/   backend owner's pipeline (not covered here)
data/                 tenders.jsonl and future backend data (not covered here)
docs/                 design.md (this), tender-data-extraction.md, proposals/, specifications/
plans/                implementation plans and research reports
```

## Work split

- **Web**: the four screens, client, offline state, screenshots for slides.
- **Backend**: separate plan and design, owned by the backend builder.
- **Curation + pitch**: company profiles, README, slides, Q&A role split.

## Timeline for the web track (Europe/Berlin)

| when | web |
|---|---|
| 17.09 19:30–20:30 | scaffold, provisional types, client, offline banner |
| 20:30–23:00 | triage + briefing pages |
| 23:00–01:00 | companies + ingest pages |
| 18.09 08:00–11:00 | wire to the real backend contract, polish, screenshots |
| 11:00–13:00 | freeze; tech check |
| 13:00–14:30 | rehearsal; submit by 14:30 |

## Open items

- Backend contract: field names and endpoints to confirm; regenerate `api-types.d.ts` from it.
- Ask Arctis on site how and when the unseen tender/company pairs are handed over.
