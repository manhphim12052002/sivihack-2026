# SiviHack 2026 — Sponsor Challenge

## 1. Challenge Title & Sponsor

**Challenge title:** Three Out of Forty — Which Tenders Are Worth Bidding On?
**Sponsor:** Arctis AI

## 2. About Us

Arctis AI builds AI tools for construction procurement. Our product takes a tender package and the bids a construction company received, and produces a structured comparison — what's missing, what deviates, where the risk sits. Work that normally takes a procurement team three to five days per package in Excel.

We're a pre-seed team out of TU München, backed by EWOR, NVIDIA Inception and TUM Venture Labs, working mainly in Germany and Austria. This challenge sits one step before our product: *before* anyone compares bids, someone has to decide which tenders are worth bidding on at all.

## 3. Context & Problem Statement

There's a construction company in Augsburg — 140 people, roads and sewers. Every Monday, forty new public tenders appear that might be relevant. Each comes with a package of documents, often a few hundred pages. They have the capacity to bid on three.

So someone opens them one at a time and skims until something disqualifies the tender, or until Monday is over. Two weeks later the estimating team has done a full calculation on a job the company was never eligible for. The requirement was in the third attachment: *three comparable rail-side projects in the last five years*. They've never worked next to a railway line.

Two ways this goes wrong, both expensive:

- **They chase the wrong one.** Weeks of estimating work on a tender that was never winnable. The reference requirement, the impossible construction window, the penalty clause — all published, all missed.
- **They never see the right one.** The tender that fit perfectly was filed under a category nobody monitors.

**The problem:** the decision is made on the thinnest possible information — a title, a location, a rough value — because reading everything is not physically possible.

**The outcome we care about:** an estimator opens one screen on Monday morning and knows which three tenders go on the desk this week — and can see why each of the others was set aside, in a form they can argue with.

**One thing worth knowing going in:** fit is not similarity. A tender can match a company's trade perfectly and still be a hard no — wrong region, ten times their usual contract size, a guarantee that ties up their credit line, a reference requirement they can't meet. Ranking by how similar a tender looks to a company profile produces something plausible that an estimator would throw straight out.

*How you approach this is completely open. Documents are in German — you don't need to speak it, but the result should be usable by someone who does.*

## 4. Target Users & Stakeholders

**End user:** the estimator or bid manager at a construction company of 50–500 employees. Deep domain knowledge, no analyst support, no time.

**Other stakeholders:** company management, who decide which regions and contract sizes are worth pursuing · the estimating team, whose time is the scarce resource · the public bodies issuing the tenders, who get better outcomes when suitable companies actually see their work.

**Goal:** weekly tender screening goes from hours of skimming to minutes of reviewing, with a reason attached to every recommendation.

## 5. Expected Final Product

Something we can click through, where you can pick a company and see which tenders are worth their time and why.

Beyond that, the shape is yours. Some directions teams might take: a briefing page for one tender that surfaces the things that should give you pause · a weekly triage view · effort estimation · a deadline calendar.

**One thing your demo should show:** change the company and re-run. A road builder in Bavaria and a large general contractor in Hamburg should not get the same shortlist. If they do, the system is matching text rather than making a decision — and that difference is the whole challenge.

**What we're not asking for.** 24 hours is short. Being right about three tenders with reasoning we can look at beats ranking all forty in a way we can't check. No login, no perfect German, no accuracy metric, no polish for its own sake. And no requirement to build "real software" — a no-code tool, a spreadsheet-driven prototype, an automation flow, or something vibe-coded are all fine, as long as we can click it.

## 6. Resources & Tools

**We provide:** API keys (details from the organizers), example company profiles (Appendix A), and pointers to the data (Appendix B). We'll be on site all weekend — questions about German construction procurement are welcome and are not cheating.

**Data is public and free.** You can pull as much or as little as you like. Appendix B has the sources.

**Tools:** entirely up to you. Appendix C lists some things that tend to help, purely to save setup time — ignoring all of it is a perfectly good answer, and picking your own approach scores better than following ours.

## 7. Data & Validation

Not a metric-based challenge — there's no submission file and no leaderboard. The data is public and teams pull what they need.

We'll bring a handful of tender/company pairs to judging that teams won't have seen, so we can check whether a solution generalises or was tuned to specific examples. We'll be looking at the reasoning, not the verdict.

## 8. Judging Criteria — Bonus

**Bonus criterion 1 — Reasons, not ranking.** Does the solution explain *why* a tender was recommended or dismissed, in terms an estimator could disagree with? A similarity score is not a reason.

**Bonus criterion 2 — Depth over surface.** Does it get into the tender documents, or stop at the public notice? The thing that actually kills a bid is almost never in the title.

## 9. Practical Notes

All tender data is published by public bodies and free to use. The company profiles are fictional. Please don't contact any organisation that appears in the data. Nothing in this challenge involves confidential or customer information.

## 10. Technical Contact

**Name:** Trung Nguyen
**Role:** CTO & Co-Founder, Arctis AI

---

## Appendix A — Example Company Profiles

*Three fictional companies. The same tender should be an obvious yes for one and an obvious no for another. Use them as they are, extend them, or write your own — they're a starting point, not a schema.*

### Brenner & Sohn Tiefbau GmbH — the regional civil contractor

Augsburg, Bavaria · ~€31M revenue · 140 employees · family-owned since 1962

- **Does:** road construction, sewers and pipelines, earthworks, municipal civil engineering. Own machinery.
- **Where:** Bavaria, mainly Schwaben and Oberbayern, up to ~150 km from Augsburg — crews go home at night.
- **Contract size:** €400k–€4M. Below that the overhead isn't worth it; above €5M they'd need a partner.
- **Can show:** a €2.9M state road rehabilitation, a district sewer renewal, several housing-estate site developments.
- **Cannot show:** anything rail-side (no DB qualification, no certified safety staff), no bridges, nothing outside Germany.
- **Financial limit:** their bank supports guarantees up to about €1.5M in total at any one time.
- **Free from:** March — two crews are committed until then.
- **In their words:** "We're reliable and we're local. We lose on price to the bigger players about half the time. We want the jobs where the client cares that we turn up."

### Elektro Vogtland GmbH — the small specialist

Plauen, Saxony · ~€8M revenue · 45 employees · founded 1991

- **Does:** electrical installation for buildings — power, lighting, fire alarm systems, building automation. Usually as a subcontractor to a general contractor.
- **Where:** Saxony, Thuringia, eastern Bavaria, up to ~200 km.
- **Contract size:** €80k–€900k.
- **Can show:** school refurbishments, a hospital ward block, office fit-outs, two care homes.
- **Cannot show:** high voltage, explosion-protected installations, or acting as main contractor on a multi-trade job.
- **Financial limit:** guarantees up to about €300k.
- **In their words:** "We're good but we're small. The paperwork is why most of our work comes through general contractors. If a public job is straightforward, we'll bid it directly."

### Hanseatische Bau AG — the large general contractor

Hamburg · ~€310M revenue · 620 employees · founded 1954

- **Does:** building construction and turnkey projects — offices, schools, hospitals, housing, logistics. They coordinate; the trades are subcontracted.
- **Where:** northern Germany.
- **Contract size:** €8M–€90M. Below €5M the overhead is disproportionate.
- **Can show:** a university building, two school campuses, a hospital extension, large residential quarters.
- **Cannot show:** civil engineering as lead contractor (no roads, sewers or bridges), nothing in southern Germany in a decade.
- **Their constraint:** not money — bidding capacity. The estimating department can seriously pursue about three tenders a week.
- **In their words:** "We're a coordination business. What hurts us is a tender demanding a high share of self-performed work — we're not set up for that."

## Appendix B — Where to Get the Data

*Everything below is public, free, and needs no account.*

**oeffentlichevergabe.de — Datenservice Öffentlicher Einkauf**
The German federal notice service, run by the Beschaffungsamt des BMI. The best starting point. Covers EU-wide *and* smaller national tenders from federal, state and municipal buyers. Has an open-data interface (eForms-DE, CSV, OCDS formats) published under a CC0 licence. Swagger documentation is linked from their open-data policy page.

**ted.europa.eu — Tenders Electronic Daily**
The EU-wide portal. Free search API with anonymous access for published notices, plus bulk XML download. Larger contracts only (above the EU threshold), so it misses a lot of mid-size work — useful as a second source.

**service.bund.de**
Federal notices. Largely covered by the first source, but occasionally worth a look.

**A note on the documents themselves.** The public notice is only a page of metadata — the interesting material is in the attached tender documents, and German law requires those to be downloadable free, in full, and without registration (§ 41 VgV, § 11 VOB/A). In practice some platforms handle this better than others. If a document turns out to be behind a wall, move on to the next tender rather than fighting it.

**Filtering tip:** tenders are classified with CPV codes. Anything starting with **45** is construction work. That single filter removes most of the noise.

## Appendix C — Tools That Might Help

*Not a recommendation, just setup-time savings. Any approach is valid — including approaches with no code in them at all.*

**Getting the documents readable:** PyMuPDF or pdfplumber for PDF text · or feed pages straight to a model that reads images · Docling if you want document structure.

**Models on a free tier:** Google AI Studio (Gemini) · Groq · OpenRouter · Ollama with a local model if the venue wifi gives out.

**Working with German text without API calls:** multilingual embedding models like `bge-m3` or `jina-embeddings-v3` run locally, free, with no rate limits. Worth knowing if your team is on free plans and the documents are long.

**Building the thing:** Streamlit or Gradio for something clickable in an hour · Next.js if you want polish · Lovable, v0, Bolt or Replit if you'd rather describe it than write it · n8n or Make for an automation-flow approach · Airtable or a spreadsheet as the backend is completely legitimate.

**Keeping it organised:** any database is overkill for 24 hours. A JSON file is fine.

## Appendix D — German Terms You'll Meet

*About all you need. No construction knowledge required.*

| Term | Meaning |
|---|---|
| Ausschreibung | the tender / call for bids |
| Vergabeunterlagen | the full document package — where the important things hide |
| Leistungsverzeichnis (LV) | bill of quantities: every item of work with quantities and units |
| Lose | lots — a tender split into separately awardable parts. A €14M tender may contain one €700k lot that fits perfectly |
| Eignungskriterien | qualification criteria a bidder must meet to bid at all |
| Referenzen | required proof of comparable past projects — the most common disqualifier |
| Präqualifikation / PQ-VOB | a pre-issued certificate proving general suitability |
| Ausführungsfrist / Bauzeit | the construction window — watch for windows too short for the work |
| Vertragsstrafe | penalty for late completion, usually % per day with a cap |
| Bürgschaft / Sicherheitsleistung | guarantees the contractor must post, often held for years |
| Eigenleistung | share of work the winner must perform themselves rather than subcontract |
| Nebenangebote | alternative bids proposing a different solution — sometimes not permitted |
| Bietergemeinschaft / ARGE | a consortium bidding jointly, so a smaller company can still qualify |
| Angebotsfrist | the submission deadline |
| Vergabestelle | the public body issuing the tender |
