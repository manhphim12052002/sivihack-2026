---
phase: 1
title: "Web scaffold and provisional types"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Contract and repo skeleton

## Overview
Done. `apps/web` scaffolded with create-next-app (TypeScript, Tailwind, App Router, src dir),
dependencies installed. `src/lib/api-types.d.ts` holds provisional TypeScript types for the
shapes the screens render; it will be replaced by types generated from the backend's contract
once that exists. The FastAPI scaffold created in the same step was removed on 17.09 20:15 when
backend work was taken out of this plan's scope.

## Success Criteria
- [x] `apps/web` builds
- [x] Provisional types present for TenderSummary, TenderDetail, CompanyProfile, Verdict, IngestJob
