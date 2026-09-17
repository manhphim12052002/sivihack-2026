# SiviHack 2026 — Rules & Winning Strategy

Extracted from sections 4, 5, 6 of `Cam-nang-SiviHack-SiviCamp-2026.md`. Use as context when helping the team ideate, code, prep the demo, and present for SiviHack 2026 (17–19.09.2026, Frankfurt am Main).

## 1. Must-know competition timeline (Section 4)

- **17.09 13:00** – Opening ceremony, challenges announced, pick a challenge via Google Form (Priority 1 & 2).
  - **Submit the form as early as possible**: allocation rule is "first submitted, first served" — each challenge takes at most 7 teams under Priority 1; late submissions can get bumped to Priority 2.
- **17.09 15:00** – START HACKING (official time-tracking mark).
- **18.09 15:00** – **SUBMISSION DEADLINE** (slides + source code/repo + prototype/demo + short README). After the deadline **no edits allowed** to the product/slides/code unless the organizers request it.
- **18.09 morning** – Technical check (1–2 min/team: laptop, projector, audio). **Don't change machine config after this step** to avoid issues during the presentation.
- **18.09 16:00–20:00** – Final pitch on your assigned slot — be on time.

### What to do the moment challenges drop (the first golden hour)
1. Read the 5 parts of the challenge description carefully: context, target users/needs, core requirements, constraints/conditions, sponsor-specific technical requirements.
2. Decide internally fast + submit the challenge-priority Google Form right away — don't stall, it affects your odds of landing the track you want.
3. Draft the README skeleton immediately (what the product is, setup/demo steps, tech stack, datasets/APIs/libraries used, requirements.txt, current limitations) — have it ready, don't leave it to the last minute.

## 2. The 14-minute presentation structure (Section 5)

| Part | Duration | Notes |
|---|---|---|
| Setup | 2 min | Not counted toward presentation time — have everything ready beforehand, minimize on-stage technical fiddling |
| Presentation & Demo | 5 min | Cut off hard when time's up even if unfinished — rehearse to hit the timing |
| Q&A | 7 min | Judges ask about technical aspects, business/user value, feasibility, innovation, and decisions made during the build |

**Winning points here:**
- The 5-minute demo must go straight through: Challenge/Problem → Idea & Solution → How it works → Demo/Prototype → Value/impact. No rambling intro.
- Assign in advance who answers which Q&A topic (technical, business, AI, design decisions) for fast, clear, confident answers — this is its own scoring criterion (1.1).
- Rehearse the demo until it's stable — don't touch the setup after the technical check on day 2 morning.

## 3. Judging criteria — optimize each one (Section 6)

Each criterion scored 1–5 × its weight, max total 5.0 points. 6 criteria:

| # | Criterion | Strategy to score high |
|---|---|---|
| 1.1 | Understanding the problem & presentation/rebuttal skills | Nail the core problem-user-goal; answer Q&A clearly, admit limitations straight up instead of dodging |
| 1.2 | Design, fit & solution quality | Clear, consistent architecture/flow; every tech choice must have a reason tied to the actual challenge, not chosen "to look impressive" |
| 1.3 | Demo & Prototype quality | Prioritize a **stable, smooth-running demo** over cramming in fragile features; make user experience and output clearly visible |
| 1.4 | Effectiveness of AI usage | AI must solve the right problem and create real value — avoid bolting on AI just for show |
| 1.5 | Real-world value & growth potential | Emphasize concrete impact for the user/context, and the path to extend beyond the competition |
| 1.6 | Creativity, innovation & differentiation | Find your own angle, avoid copying existing solutions — make the differentiator clear in the presentation |

**Important implicit notes:**
- The codebase will be **reviewed by Technical Assistants + AI** to support the judges (criteria 1.2/1.3) — code must be **clean and consistent with what's shown on stage** (no "fake demo" that diverges from the real code).
- Final score = weighted sum of all 6 criteria, meaning **no criterion can be left weak** — a technically strong solution with a laggy demo or unexplained business value still loses points on 1.3/1.5.
- Organizers **do not help with** architecture design, tech choices, writing code, prompt optimization, or pre-assessing your odds of winning — the team must decide and own every technical choice.

## Open questions / to follow up
- The exact weight (%) of each criterion 1.1–1.6 isn't published in this handbook — watch the official competition rules or the opening-ceremony announcement.

## Track 2 Challenge — Arctis AI: "Three Out of Forty"

Full spec: `Track-2.md` (appendices A–D: company profiles, data sources, tools, German glossary)

- **Problem:** construction company gets 40 new public tenders/week, capacity to bid on 3. Need to auto-screen which are worth bidding on for a given company — not by text similarity, but by real eligibility (region, contract size, financial guarantee limits, reference-project requirements, construction window, penalty clauses).
- **Deliverable:** clickable demo — pick a company, see recommended tenders + reasons. Must re-run correctly for a different company profile (different shortlist) — proves it's a real decision, not text matching.
- **Not required:** login, perfect German, accuracy metrics, "real software" — no-code/spreadsheet/automation-flow prototypes are fine.
- **Judging bonus:** (1) explain *why* a tender fits/doesn't, in terms an estimator could disagree with — a similarity score is not a reason; (2) read into the actual tender documents, not just the public notice metadata.
- **Data:** public & free — oeffentlichevergabe.de (best source, open API/CC0), ted.europa.eu (EU-wide, larger tenders only). Filter by CPV code starting with `45` = construction.
- **Docs are in German** — team doesn't need to speak it, but output must be usable by someone who does. Key terms (Referenzen, Eignungskriterien, Bauzeit, …) are in `Track-2.md` Appendix D.
- **Judges bring unseen tender/company pairs** at judging to check the solution generalizes rather than being tuned to the example profiles.

## Git conventions

- Commit messages use Conventional Commits: `type(scope): imperative summary`, body as short
  bullets. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scopes in use: `web`,
  `api`, `pipeline`, `docs`, `plans`.
- No AI attribution trailers in commit messages or PR descriptions.
- One focused commit per change; do not stage another session's in-flight files unless asked.
- Never commit `.env`, `data/cache/`, `node_modules`, `.next`, or the eForms spec HTML dump.
