---
title: "Track 2 boilerplate: web app"
description: "Bootstrap the Next.js frontend for the tender-screening demo; backend is out of scope for this plan"
status: completed
priority: P1
effort: "3h"
tags: [sivihack, boilerplate, nextjs, frontend]
created: 2026-09-17
---

# Track 2 boilerplate: web app

## Overview

Frontend-only bootstrap of the demo described in `docs/design.md`: a Next.js app with the four
screens (triage, tender briefing, companies, ingest) and a typed API client. The backend
contract and pipeline are decided and built separately; the UI treats the API as an external
service and shows an offline state when it is not there. No mock tenders or verdicts.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Next.js scaffold with TypeScript, Tailwind, App Router, nav, offline banner | P1 |
| 2 | Four screens rendering the shapes the UI needs (see design → Screens) | P1 |
| 3 | Typed fetch client in one file so the backend contract can be swapped in later | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Web scaffold and provisional types](./phase-01-start.md) | Completed |
| 2 | [Phase 3: Web pages and typed client](./phase-03-web-pages-and-typed-client.md) | Completed |

## Success Criteria

- [x] `npm run build` and `npm run lint` clean in `apps/web`
- [x] Four routes render with the API offline (clear banner), no mock data anywhere
- [x] All API shapes imported from one provisional type file, no parallel hand-written shapes
- [x] Root README explains how to run the web app only

## Non-goals

FastAPI service, rules, LLM client, ingest pipeline, data model decisions. Owned by the
backend owner in a separate plan.

<!-- slug: track-2-boilerplate-api-and-web-apps -->
