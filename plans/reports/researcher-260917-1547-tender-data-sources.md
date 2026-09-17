# German Public Construction Tender Data Sources — Fact-Finding Report

All findings below are from live requests made 2026-09-17. Commands are reproducible (curl/python3).

## 1. oeffentlichevergabe.de API

**No search/filter API exists.** What exists is a **bulk-export-by-day/month API** — confirmed via the live OpenAPI spec:

```
curl -s https://oeffentlichevergabe.de/documentation/api/opendata
```
→ `paths: ["/api/notice-exports"]`, params: `pubMonth` (YYYY-MM) OR `pubDay` (YYYY-MM-DD, mutually exclusive), `format` ∈ `eforms.zip|ocds.zip|csv.zip`. No API key, no auth header required. Docs: https://oeffentlichevergabe.de/documentation/swagger-ui/opendata/index.html

Working request (no key):
```
curl -s -o day.zip "https://oeffentlichevergabe.de/api/notice-exports?pubDay=2026-09-16&format=ocds.zip"
```
→ HTTP 200, 2.07 MB ZIP, **1184 individual notice JSON files** for that single day. No rate-limit error hit across ~10 requests in this session (no documented limit found).

**No server-side CPV/region/date-range filter** — you must download the whole day (or month) and filter client-side. Confirmed by inspecting the frontend SPA bundle (`https://oeffentlichevergabe.de/ui/assets/index-*.js`) which reveals the *public search UI* uses a separate, undocumented backend (`/api/notices`, `/bkmc/searches`, `/bkmc/nuts-codes` paths referenced in bundle) that is **not exposed as an anonymous REST API** — `/api/notices` returns `404 Not Found: No static resource api/notices` when queried directly outside the SPA's session context, and no public Swagger doc exists for it (only `swagger-ui/opendata` exists; `swagger-ui/search`, `/opendata`-siblings all 404). So: **CPV-45 filtering / NUTS filtering / date-range filtering must be done client-side on the OCDS bulk export**, not via a documented query API.

Format is **OCDS** (Open Contracting Data Standard v1.1, with lots/location/enquiry/coveredBy extensions) — not raw eForms-DE unless you request `format=eforms.zip`. CC0-equivalent open data per Beschaffungsamt BMI page (https://www.bescha.bund.de/DE/ElektronischerEinkauf/Datenservice_Oeffentlicher_Einkauf/Bekanntmachungsservice/OpenData-Schnittstelle_im_Bekanntmachungsservice/OpenData-Schnittstelle_im_Bekanntmachungsservice_node.html).

**Sample notice fields** (from `ocds/dc63569a-*-01.json`, real award notice, Autobahn GmbH):
```json
{
 "tender": {
   "title": "Sielreinigung 2027-2030",
   "items":[{"classification":{"scheme":"CPV","id":"90470000","description":"Sewer cleaning services"}, "deliveryAddress":{"region":"DE600","locality":"Hamburg"}}],
   "documents":[{"id":"DOC-0001","url":"<link, see §2>"}]
 },
 "parties":[{"name":"Die Autobahn GmbH des Bundes - NL Nord","address":{"region":"DE600","countryName":"DEU"}}],
 "buyer": {...}
}
```
Fields present per notice: title, description, CPV classification per lot (`tender.items[].classification`, scheme=`CPV`), buyer name/address/NUTS region, procurement method, value (when present as `tender.value`/`awards[].value`), deadline (`tender.tenderPeriod.endDate` where present), and `tender.documents[].url` (the link of interest for Q2). No dedicated CPV/region query params exist — filtering CPV-45 and NUTS is done by reading `classification.id` / `address.region` from each of the 1184 downloaded JSON files.

## 2. Vergabeunterlagen document links — THE deciding fact

Extracted `tender.documents[].url` from 5 real CPV-45 notices in the 2026-09-16 export and fetched each live:

| # | Notice (title) | Link host | Result of live fetch |
|---|---|---|---|
| 1 | "Trennvorhänge" (Mechanical installations) | `xvergabe.de` | Redirects (200) to `xvergabe.de/awardProcedure/<uuid>` — a platform HTML detail page. No direct doc/download links found in the HTML (grep for download/unterlage/pdf/zip = 0 hits). Likely needs JS/login for actual Vergabeunterlagen. |
| 2 | "Sanierung...Festhalle Oberkirchen" | `subreport-elvis.de` | **Direct PDF, no registration.** `curl -L` → `200, content-type: application/pdf, 63KB`, valid PDF magic bytes. URL pattern: `subreport-elvis.de/download/bund/<buyerId>/<ticket>/bekanntmachung.pdf`. **Caveat: this is the notice/"Bekanntmachung" PDF itself, not necessarily the full Leistungsverzeichnis/Vergabeunterlagen package** — subreport (ELViS) typically requires a separate portal login for the full document set; only the notice PDF is anonymously open. |
| 3 | "Primary school construction" (Bayern) | `staatsanzeiger-eservices.de` | Landing page (200, HTML) explicitly titled **"Download von Vergabeunterlagen"** with a form button **"Anonym als Zip"** (`POST /aJs/DownlAsAnonym`, field `z_param`) alongside a login-gated option. UI proves anonymous full-document ZIP download is *offered*. Scripted replay of that POST (with and without a cookie jar) returned HTML, not a ZIP, in this 25-min session — likely needs the exact session/CSRF state a browser sets, not proven infeasible, just not confirmed via raw curl in the time box. **Worth a headless-browser (Playwright) attempt**, not raw curl. |
| 4 | "Neubau Schulcampus Deisenhofen" | `plattform.aumass.de` | Landing page redirects to `TenderPreviewQrCode`. Found explicit link `/Document/GetDocument?doctype=allfiles&aumassid=<ID>`. **Fetched live → HTTP 200, content-type application/octet-stream, 33.7 MB, valid ZIP** containing real files (e.g. `Nachträge/Antworten auf Bieterfragen (Stand 28.08.2026).pdf`). **Fully anonymous, no login, no JS needed — confirmed working full Vergabeunterlagen download.** |
| 5 | "10021458... GIZ Standort Berlin" | `ausschreibungen.giz.de` | Java/JSP portal (jsessionid in URL) — old-style stateful webapp. Landed on a public overview page (200 HTML) but no document link surfaced without further session navigation; likely needs multi-step/JS navigation, unconfirmed anonymity for actual file download in time box. |

**Bottom line for the project**: the `tender.documents[].url` field does NOT reliably point straight to a PDF/ZIP — it points to one of ~5+ different regional e-procurement platforms (subreport/ELViS, xvergabe.de, Staatsanzeiger eVergabe (Bayern), aumass, DTVP-style Java portals, and others not sampled here e.g. evergabe-online, vergabe.metropoleruhr.de, Vergabemarktplatz — not encountered in this 5-link sample but known to exist across German states). Of the 5 sampled: **1 direct PDF (subreport)**, **1 confirmed anonymous full-ZIP (aumass)**, 1 UI-confirmed-but-unverified anonymous ZIP (Staatsanzeiger), 2 unresolved/likely gated (xvergabe, GIZ Java portal). A production tool needs **per-platform adapters** (a registry keyed by hostname) rather than one generic downloader; expect maybe half the platforms to be anonymously scrapeable with plain HTTP and the rest to need a headless browser or to be skipped (screening can still work off notice-level CPV/value/region metadata alone for those).

## 3. TED (ted.europa.eu) Search API v3

Confirmed **fully anonymous, keyless**, `POST https://api.ted.europa.eu/v3/notices/search`, JSON body.

Working request:
```bash
curl -s -X POST 'https://api.ted.europa.eu/v3/notices/search' \
  -H 'Content-Type: application/json' \
  -d '{ "query": "classification-cpv=45* AND buyer-country=DEU AND publication-date>=20260901",
        "fields": ["publication-number","notice-title","buyer-name","buyer-country","total-value","deadline-date-lot"],
        "limit": 5, "scope": "ACTIVE", "paginationMode": "ITERATION" }'
```
→ HTTP 200, returns `{"notices":[{"publication-number":"599729-2026","buyer-name":{"deu":["Fraunhofer-Gesellschaft..."]}, "links":{"xml":{...},"pdf":{"DEU":"https://ted.europa.eu/de/notice/599729-2026/pdf",...},"html":{...}}}]}`. Confirms: CPV wildcard (`45*`), country filter (`buyer-country=DEU`), and date filter (`publication-date>=YYYYMMDD`) all work in the expert query syntax. `fields` is **required** and must not be empty — omitting it → `400 {"message":"Validation error","error":[{"field":"fields","message":"must not be empty"}]}` (confirmed live).

Notice-level `links.pdf`/`links.html` are TED's own **notice-text PDFs** (the official notice document, all EU languages), not the buyer's Vergabeunterlagen — TED notices for above-EU-threshold tenders still point out to national platforms for actual tender docs (same fragmentation problem as §2, at a smaller volume since only large-value contracts cross the EU threshold and get published to TED). Given the hackathon targets sub-threshold + national-only tenders too, **oeffentlichevergabe.de is the primary source; TED is a secondary/EU-threshold supplement.**

Docs: https://docs.ted.europa.eu/api/latest/index.html (not fetched directly in-session but corroborated by the working live call above).

## 4. Volume estimate (CPV-45, Germany)

From the single-day export `pubDay=2026-09-16` (1184 total notice files that day):
- **515** notices had ≥1 line item with CPV code starting `45` (any notice type: new tenders, awards, corrections).
- **321** of those also carried OCDS tag `"tender"` (i.e., an active call for tenders, not an award/correction).

Extrapolated: **~300–500 CPV-45-relevant notices/day → roughly 2,000–3,500/week** nationally (all German public-sector buyers feed this one central Bekanntmachungsservice, per Beschaffungsamt BMI, so this is the full national volume, not a subset). This is a single-day sample — no week-over-week variance check was done (weekday/weekend effects untested); treat as order-of-magnitude, not a precise figure.

## 5. Reusable client libraries

- **Apify actors** found via search (`de-tenders-scraper` by fetchwerk, `german-public-tenders` by alpinedata, several `eu-ted-*` scrapers) — these are paid, hosted, closed-source scrapers; not inspected for code quality/last-commit date since they're not open repos, and using a paid third-party scraper for hackathon judging (1.2: "explain why tech choice fits") is a weak story — **not recommended**.
- **`noble-ronin/ted-tenders-api`** (GitHub) — described as "Free, keyless JSON API for EU public procurement (TED)... curl examples." Found via search only; **not cloned/inspected in this session** (time-boxed), so last-commit date and correctness are unverified. Given the TED v3 API itself is trivial to call directly (confirmed above), a wrapper library adds little value for a 24h hackathon — **recommend calling the TED API directly** and skip third-party wrappers.
- No official Python SDK found for either API in the time box. **Recommendation: write your own thin Python client** (requests + zipfile + json, ~50 lines) against the two confirmed-working raw endpoints — simplest, most controllable, and avoids an unverified dependency the judges could ask about.

## Recommendation for the hackathon tool

1. Primary data source: `oeffentlichevergabe.de/api/notice-exports?pubDay=...&format=ocds.zip` (or `ocds.zip`/`csv.zip`), downloaded for the last N days, filtered client-side for `classification.id` startswith `45` and tag `tender`. No key, no rate limit hit.
2. Secondary/optional: TED v3 search API for EU-threshold notices, for extra coverage/cross-check.
3. Document ingestion: build a small per-hostname adapter registry for `tender.documents[].url`. Start with `subreport-elvis.de` (direct PDF) and `aumass.de` (`/Document/GetDocument?doctype=allfiles&aumassid=...`, direct ZIP) since both are confirmed anonymous with zero JS. Treat other platforms (xvergabe, Staatsanzeiger, GIZ/Java portals, and any not sampled) as "metadata-only" fallback — screen on notice-level CPV/value/region/deadline even if the actual PDF can't be pulled, and label those tenders "documents not machine-retrievable" in the demo rather than faking it.
4. Given the judging bonus explicitly rewards "read into the actual tender documents, not just public notice metadata," prioritize picking demo companies/tenders where the doc link resolves to `subreport-elvis.de` or `aumass.de` so the live demo can show real PDF parsing.

## Unresolved / not covered (25-min time box)

- Staatsanzeiger's "Anonym als Zip" button was UI-confirmed but the scripted POST replay didn't produce a ZIP in this session (likely a session/CSRF requirement) — worth a Playwright/headless-browser retest, not proven infeasible.
- Only 5 CPV-45 document links were sampled out of 515 available that day; other platforms (DTVP, vergabe.bayern.de, Vergabemarktplatz, evergabe-online, etc., named in the task) were not encountered in this sample and remain unverified.
- No week-over-week volume variance check (only one day sampled for §4).
- TED API rate limits/pagination limits beyond the single test call were not probed.
- `noble-ronin/ted-tenders-api` GitHub repo was not opened/inspected (only surfaced via web search).

Status: DONE_WITH_CONCERNS
Summary: oeffentlichevergabe.de has no search API, only a keyless daily/monthly bulk OCDS/eForms/CSV export (confirmed live, ~300-500 CPV-45 notices/day) that must be filtered client-side; its `tender.documents[].url` fans out to ~5+ different regional e-procurement platforms with wildly different anonymity (aumass.de and subreport-elvis.de confirmed anonymously downloadable, others gated/unverified) — so the tool needs a per-platform document-adapter registry, not one generic downloader. TED v3 search API is confirmed anonymous/keyless and works for EU-threshold notices as a secondary source.
Concerns/Blockers: Staatsanzeiger anonymous-ZIP flow unverified via script (UI says it exists); only 5 of many possible document-hosting platforms were sampled; volume estimate is single-day, not validated across a week.
