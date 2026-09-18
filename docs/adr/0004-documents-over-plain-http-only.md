---
status: accepted
date: 2026-09-17
---

# Fetch procurement documents over plain HTTP only; no browser, no registration walls

Tender documents sit on roughly ninety e-procurement platforms. Measured on 3,176 document-bearing
lots (`plans/reports/researcher-260917-1854-document-portal-access.md`): about 23% are downloadable
with plain HTTP, 33% require a company registration or order form, 10% are JavaScript shells with
unverified gating, and the rest were unsampled. We implement one fetch interface with per-platform
adapters for the plain-HTTP hosts and record every other document as `gated` or `unreachable`
with the platform named.

We do not run a headless browser and do not submit registration forms. A browser helps at most
the 10% JavaScript bucket and is unproven even there; the registration wall is not a tooling
problem but a legal and ethical one, since passing it means submitting company data on someone's
behalf. The challenge brief says to move on rather than fight it. Per seeded company the readable
lots already exceed the three-bid capacity.

## Consequences

- A Requirement the notice defers to the documents stays `REFERRED_TO_DOCUMENTS` on gated
  platforms, and the estimator is told which platform to open.
- A filename router decides which files are read; drawings and bills of quantities are skipped.
- `pdftotext` is the only reader; scanned PDFs are marked and not read. No OCR, no embeddings.
- Adding a platform is one adapter; adding a browser would be a new decision.

## Note (2026-09-18)

Three host classes from the probe reports were wrong and are corrected in `adapters`: the Healy
Hudson portal `bieterportal.noncd.db.de` (listed as a JavaScript shell; Hamburg's tenant was never
classified) serves the whole package from a plain API call; the cosinex
`/VMPSatellite/notice/<id>/documents` page links an anonymous archive ZIP, its registration wall
guards participation, not the download; and the vergabe24 Direkt-Kiosk reaches a "Download ohne
Registrierung" step once the package variant is chosen. That last step is a form POST carrying
only the variant id, no company or contact data, so it stays within this decision's reason (we do
not hand over company data on someone's behalf). Still no browser, no registration.
