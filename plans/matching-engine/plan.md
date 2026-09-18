# Matching Engine — Implementation Plan

Based on `docs/arctis_matching_engine.md`. Spec reference: flows 1–17, features ME1–ME24.

---

## 1. What we're building

Given a `TenderDetail` (from the FastAPI tender pipeline, via `api-types.d.ts`) and a
`CanonicalCompany` (from our Supabase company intelligence pipeline), produce a requirement-level
`MatchEvaluation` with:

- Per-requirement `PASS / FAIL / UNCERTAIN` results
- Hard-vs-soft classification
- Explicit blockers and knowledge gaps
- Overall `VIABLE / REVIEW / BLOCKED` verdict
- Two-sided evidence (tender chunk + company item) for every result

The matching engine does **not** decide which 3 tenders to bid on — that is the Portfolio Engine.

---

## 2. Environment setup

### OpenRouter (already in `.env.local`)

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Semantic matcher calls `google/gemini-2.5-flash` via the existing `llmClient` singleton in
`src/lib/llm.ts`. No new key needed. Add one new prompt constant `SEMANTIC_MATCH_PROMPT` there.

### Supabase (already in `.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Run the new migration (section 3 below) in the Supabase SQL editor.

---

## 3. Supabase migration

New tables to add to `apps/web/supabase/migration.sql`:

```sql
-- ─── Matching Engine ──────────────────────────────────────────────────────────

create table if not exists match_evaluations (
  id           text primary key,
  tender_id    text not null,
  company_id   text not null references companies(id) on delete cascade,
  scope_type   text not null default 'WHOLE_TENDER',  -- WHOLE_TENDER | LOT
  scope_id     text,                                   -- lot id when type=LOT
  status       text not null default 'VIABLE',         -- VIABLE | REVIEW | BLOCKED
  hard_blockers integer not null default 0,
  hard_unknowns integer not null default 0,
  soft_concerns integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists matching_tasks (
  id             text primary key,
  evaluation_id  text not null references match_evaluations(id) on delete cascade,
  requirement_id text not null,              -- e.g. "trade_scope", "estimated_value"
  label          text not null,              -- human-readable requirement name
  matcher_type   text not null,              -- RULE | ONTOLOGY | SEMANTIC | REFERENCE
  severity       text not null default 'HARD',  -- HARD | SOFT
  tender_value   jsonb,                      -- extracted fact value from tender
  company_value  jsonb,                      -- relevant company field(s)
  created_at     timestamptz not null default now()
);

create table if not exists match_results (
  id             text primary key,
  evaluation_id  text not null references match_evaluations(id) on delete cascade,
  task_id        text not null references matching_tasks(id) on delete cascade,
  status         text not null,              -- PASS | FAIL | UNCERTAIN
  severity       text not null,              -- HARD | SOFT
  method         text not null,              -- DETERMINISTIC | ONTOLOGY | SEMANTIC | REFERENCE
  reason         text not null,
  tender_evidence jsonb,                     -- chunk_id[] from tender
  company_evidence jsonb,                    -- company item ids checked
  aspect         text,                       -- one of 8 decision aspects
  override_status text,                      -- PASS | FAIL | UNCERTAIN (human override)
  override_reason text,
  override_at    timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists match_knowledge_gaps (
  id             text primary key,
  evaluation_id  text not null references match_evaluations(id) on delete cascade,
  task_id        text,
  concept        text not null,              -- e.g. "DB_RAILWAY_QUALIFICATION"
  importance     text not null default 'HARD_REQUIREMENT',
  triggered_by   text,                       -- requirement_id
  created_at     timestamptz not null default now()
);
```

No RLS (demo).

---

## 4. File structure

```
apps/web/src/lib/match/
├── types.ts              ← all TS types for the matching engine
├── tasks.ts              ← Flow 3: task generation from TenderFactSheet
├── router.ts             ← Flow 4: pick RULE | ONTOLOGY | SEMANTIC | REFERENCE
├── rule-matcher.ts       ← Flow 5: deterministic numeric/date/distance checks
├── ontology-matcher.ts   ← Flow 6: exact normalized concept comparison
├── semantic-matcher.ts   ← Flow 7: LLM-based meaning matching
├── reference-matcher.ts  ← Flow 8: reference project evaluation
├── assemble.ts           ← Flows 12–14: matrix, aspects, viability, persist
└── __tests__/
    ├── tasks.test.ts
    ├── rule-matcher.test.ts
    ├── ontology-matcher.test.ts
    └── assemble.test.ts

apps/web/src/app/api/match/
├── route.ts              ← POST /api/match  (trigger evaluation)
└── [id]/
    ├── route.ts          ← GET /api/match/[id]  (fetch evaluation)
    └── override/
        └── route.ts      ← POST /api/match/[id]/override  (human correction)
```

---

## 5. Types (`lib/match/types.ts`)

```ts
// Re-use from api-types.d.ts (teammate's OpenAPI types)
import type { components } from "@/lib/api-types";
export type TenderDetail   = components["schemas"]["TenderDetail"];
export type TenderFactSheet = components["schemas"]["TenderFactSheet"];
export type Fact           = components["schemas"]["Fact"];
export type Evidence       = components["schemas"]["Evidence"];

// Re-use from our company pipeline
import type { CanonicalCompany } from "@/lib/company/types";
export type { CanonicalCompany };

// Matcher internals
export type MatchStatus   = "PASS" | "FAIL" | "UNCERTAIN";
export type Severity      = "HARD" | "SOFT";
export type MatcherType   = "RULE" | "ONTOLOGY" | "SEMANTIC" | "REFERENCE";
export type ViabilityStatus = "VIABLE" | "REVIEW" | "BLOCKED";

export type DecisionAspect =
  | "SCOPE_CAPABILITY"
  | "GEOGRAPHY"
  | "CONTRACT_SIZE"
  | "REFERENCES"
  | "QUALIFICATIONS"
  | "TIMING_CAPACITY"
  | "FINANCIAL_GUARANTEES"
  | "CONTRACTUAL_RISK";

export interface MatchingTask {
  id: string;
  requirement_id: string;       // e.g. "trade_scope"
  label: string;
  matcher_type: MatcherType;
  severity: Severity;
  tender_value: unknown;        // raw fact value from TenderFactSheet
  company_value: unknown;       // relevant company field(s)
  tender_evidence: string[];    // evidence chunk ids from tender Fact
  aspect: DecisionAspect;
}

export interface MatchResult {
  id: string;
  task_id: string;
  status: MatchStatus;
  severity: Severity;
  method: MatcherType | "DETERMINISTIC";
  reason: string;
  tender_evidence: string[];
  company_evidence: string[];   // company item ids checked (CAP-xxx, QUAL-xxx, REF-xxx)
  aspect: DecisionAspect;
}

export interface EvaluationMatrix {
  evaluation_id: string;
  results: MatchResult[];
  hard_blockers: MatchResult[];
  soft_concerns: MatchResult[];
  knowledge_gaps: Array<{
    concept: string;
    importance: Severity;
    triggered_by: string;
  }>;
}

export interface ViabilityResult {
  status: ViabilityStatus;
  hard_blockers: number;
  hard_unknowns: number;
  soft_concerns: number;
}

export interface MatchEvaluation {
  id: string;
  tender_id: string;
  company_id: string;
  scope_type: "WHOLE_TENDER" | "LOT";
  scope_id: string | null;
  matrix: EvaluationMatrix;
  viability: ViabilityResult;
  created_at: string;
}

// DB row shapes
export interface MatchEvaluationRow {
  id: string;
  tender_id: string;
  company_id: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  hard_blockers: number;
  hard_unknowns: number;
  soft_concerns: number;
  created_at: string;
  updated_at: string;
}

export interface MatchResultRow {
  id: string;
  evaluation_id: string;
  task_id: string;
  status: string;
  severity: string;
  method: string;
  reason: string;
  tender_evidence: string[] | null;
  company_evidence: string[] | null;
  aspect: string | null;
  override_status: string | null;
  override_reason: string | null;
  override_at: string | null;
  created_at: string;
}
```

---

## 6. LLM setup for semantic matching

### New prompt in `lib/llm.ts`

```ts
export const SEMANTIC_MATCH_PROMPT = `You evaluate whether a company item satisfies a tender requirement.
Return a JSON object with this exact shape:
{
  "status": "PASS" | "FAIL" | "UNCERTAIN",
  "conditions": [{ "condition": string, "status": "PASS" | "FAIL" | "UNCERTAIN" }],
  "reason": string
}

Rules:
- Evaluate condition-by-condition when multiple sub-conditions exist.
- If ANY material condition cannot be established from the evidence, return UNCERTAIN — not FAIL.
- Never invent company capabilities or project details not present in the evidence.
- Keep the reason to 1–2 sentences, in English, readable by a construction estimator.
- Reference specific evidence (document names, chunk ids) when available.`;
```

### Semantic matcher call pattern

The semantic matcher receives a **small, focused context** — not the entire tender or company.
It sends only the specific requirement text and the relevant company items/chunks to the LLM.
Prompt size target: < 2000 tokens per call.

---

## 7. Task generation (`lib/match/tasks.ts`)

Maps each of the 15 `TenderFactSheet` fields to a `MatchingTask`.

### Requirement → Matcher routing table

| Requirement field         | Matcher  | Severity | Aspect                   |
|--------------------------|----------|----------|--------------------------|
| `trade_scope`            | ONTOLOGY | HARD     | SCOPE_CAPABILITY         |
| `place_of_performance`   | RULE     | HARD     | GEOGRAPHY                |
| `estimated_value`        | RULE     | SOFT     | CONTRACT_SIZE            |
| `lots`                   | RULE     | SOFT     | SCOPE_CAPABILITY         |
| `references_required`    | REFERENCE| HARD     | REFERENCES               |
| `eligibility_proofs`     | ONTOLOGY | HARD     | QUALIFICATIONS           |
| `construction_window`    | RULE     | HARD     | TIMING_CAPACITY          |
| `guarantees`             | RULE     | HARD     | FINANCIAL_GUARANTEES     |
| `penalty`                | SEMANTIC | SOFT     | CONTRACTUAL_RISK         |
| `self_performance_min_pct`| RULE    | HARD     | SCOPE_CAPABILITY         |
| `side_offers_allowed`    | RULE     | SOFT     | CONTRACTUAL_RISK         |
| `consortium_allowed`     | RULE     | SOFT     | CONTRACTUAL_RISK         |
| `submission_deadline`    | RULE     | HARD     | TIMING_CAPACITY          |
| `special_qualifications` | SEMANTIC | HARD     | QUALIFICATIONS           |
| `contractor_role`        | SEMANTIC | SOFT     | SCOPE_CAPABILITY         |

Skip tasks for fields where `fact.confidence === "not_found"` and `fact.value` is null/absent —
these become knowledge gaps if the field is HARD severity.

---

## 8. Rule matcher (`lib/match/rule-matcher.ts`)

Deterministic checks only — no LLM. Returns `MatchResult` with `method: "DETERMINISTIC"`.

### Checks to implement

```
place_of_performance:
  - company.regions includes tender place_nuts prefix  → PASS
  - OR haversine(company.home_base_geo, tender place coords) ≤ company.radius_km → PASS
  - neither determinable → UNCERTAIN

estimated_value:
  - tender value within [company.contract_min_eur, company.contract_max_eur] → PASS
  - outside range → FAIL (soft)
  - company limits null → UNCERTAIN

construction_window:
  - tender start date ≥ company.earliest_start → PASS
  - tender start < earliest_start → FAIL
  - either null → UNCERTAIN

guarantees:
  - tender guarantee_amount ≤ company.guarantee_capacity_eur → PASS
  - exceeds → FAIL
  - company capacity null → UNCERTAIN

self_performance_min_pct:
  - tender min_pct ≤ company.self_perform_share_pct → PASS
  - exceeds → FAIL (hard)
  - company value null → UNCERTAIN

submission_deadline:
  - deadline > now() → PASS  (still open)
  - deadline ≤ now() → FAIL  (already closed)
  - null → UNCERTAIN

estimated_value (contract size — soft):
  - also check against company.partner_threshold_eur (requires subcontractor) → CONCERN
```

### Reason template

Every result includes a 1-sentence reason referencing actual values, e.g.:
`"Tender guarantee of €500k is within company capacity of €1.5M."`

---

## 9. Ontology matcher (`lib/match/ontology-matcher.ts`)

Exact comparison of normalized concepts. Re-uses normalization from `lib/company/normalize.ts`.

### Checks

```
trade_scope:
  - extract capability types from fact.value (string or string[])
  - normalizeCapabilityType() each
  - find intersection with company CONFIRMED capabilities → PASS if non-empty
  - no overlap → FAIL
  - company has no CONFIRMED capabilities → UNCERTAIN

eligibility_proofs:
  - extract qualification types from fact.value
  - normalizeQualificationType() each
  - match against company CONFIRMED, CURRENT qualifications → PASS / FAIL / UNCERTAIN
  - EXPIRING qualification → PASS with concern noted in reason
```

---

## 10. Semantic matcher (`lib/match/semantic-matcher.ts`)

LLM call for requirements where meaning rather than equality determines satisfaction.

### Input structure sent to LLM

```json
{
  "requirement": {
    "field": "special_qualifications",
    "description": "<tender fact value>",
    "evidence_quotes": ["<German quote from tender doc>"]
  },
  "company_evidence": [
    { "id": "QUAL-001", "label": "DB Netz qualification", "status": "CONFIRMED", "chunk": "<text>" },
    { "id": "CAP-002",  "label": "Gleisbau",              "status": "CONFIRMED", "chunk": "<text>" }
  ]
}
```

### Null-client fallback

If `llmClient` is null (no API key), return `{ status: "UNCERTAIN", reason: "Semantic matching unavailable — LLM not configured." }`.

---

## 11. Reference matcher (`lib/match/reference-matcher.ts`)

Specialized flow for `references_required` (Flow 8 of spec).

### Steps

1. Parse `references_required` fact value: extract `minimum_count`, `project_type`, `lookback_years`.
2. Filter company references by:
   - `status === "CONFIRMED"`
   - `completed_at` within lookback window (deterministic)
   - `contract_value_eur` meets minimum if specified (deterministic)
3. For remaining candidates: semantic LLM call per reference to check project type match.
4. Count `PASS` results vs threshold.
5. Result:
   - verified ≥ required → `PASS`
   - verified + UNCERTAIN ≥ required → `UNCERTAIN`
   - impossible to reach threshold → `FAIL`

---

## 12. Assembly + persistence (`lib/match/assemble.ts`)

### `runMatchEvaluation(tenderId, companyId)` — main entry point

```
1. Fetch TenderDetail from FastAPI  GET {NEXT_PUBLIC_API_URL}/tenders/{tenderId}
2. Fetch CanonicalCompany          assembleCanonicalCompany(companyId)  [our Supabase]
3. Generate matching tasks          generateTasks(tender.fact_sheet, company)
4. Route + run each task            routeAndRun(task, tender, company)
5. Collect MatchResult[]
6. Detect knowledge gaps            any HARD task that stays UNCERTAIN → gap
7. Compute viability                BLOCKED | REVIEW | VIABLE
8. Persist to Supabase              match_evaluations + matching_tasks + match_results + match_knowledge_gaps
9. Return MatchEvaluation
```

### Viability rule (transparent, from spec Flow 14)

```
any result.status === "FAIL" && result.severity === "HARD"  → BLOCKED
else any result.status === "UNCERTAIN" && result.severity === "HARD"  → REVIEW
else → VIABLE
```

### 8-aspect grouping

Map each `MatchResult` to its `aspect` field (set during task generation). Group for UI.
Aspects are labels only — they do not affect PASS/FAIL/viability.

---

## 13. API routes

### `POST /api/match`

```
Body: { tender_id: string; company_id: string; scope_id?: string }
→ runs runMatchEvaluation(), persists, returns MatchEvaluation
```

### `GET /api/match/[id]`

```
→ fetches match_evaluations + match_results + match_knowledge_gaps from Supabase
→ returns MatchEvaluation
```

### `POST /api/match/[id]/override`

```
Body: { result_id: string; status: "PASS"|"FAIL"|"UNCERTAIN"; reason: string }
→ UPDATE match_results SET override_status, override_reason, override_at
→ re-derives viability from effective statuses (override takes precedence)
→ returns updated MatchEvaluation
```

### Existing stub to replace

`apps/web/src/app/api/screen/route.ts` currently returns `501`. Leave it as-is — it belongs
to the FastAPI flow. Our matching engine uses its own `/api/match` namespace.

---

## 14. Unit test strategy

All tests in `apps/web/src/lib/match/__tests__/`. Supabase and `llmClient` mocked with `vi.mock`.

| File | Tests | What to cover |
|---|---|---|
| `tasks.test.ts` | 8 | generates correct matcher type per fact field; skips `not_found` HARD fields as gaps; maps aspects correctly |
| `rule-matcher.test.ts` | 12 | each rule check with PASS/FAIL/UNCERTAIN cases; null company field → UNCERTAIN; reason string contains actual values |
| `ontology-matcher.test.ts` | 6 | capability overlap → PASS; no overlap → FAIL; no confirmed caps → UNCERTAIN; expiring qual noted in reason |
| `assemble.test.ts` | 8 | any HARD FAIL → BLOCKED; all PASS → VIABLE; HARD UNCERTAIN → REVIEW; knowledge gap inserted for UNCERTAIN HARD; override changes effective viability |

Run with `npm test` in `apps/web/`.

---

## 15. LLM prompts summary

### `SEMANTIC_MATCH_PROMPT` (in `lib/llm.ts`)

- System role: evaluate whether company evidence satisfies a tender requirement condition-by-condition
- JSON output: `{ status, conditions[], reason }`
- Key rule: UNCERTAIN if any material condition unverifiable — never invent

### Usage in semantic-matcher and reference-matcher

- Input capped at ~2000 tokens
- Only send relevant company items + their evidence chunks (not the whole profile)
- Each condition listed separately so the LLM's reasoning is inspectable

---

## 16. Demo walkthrough (P0 checklist from spec)

For the judges' demo with an unseen tender × company pair:

1. Select a company (already normalized + assembled in company intelligence)
2. Select a tender from the triage list (fetched from FastAPI)
3. Click **"Run matching"** → calls `POST /api/match`
4. Show the **Evaluation Matrix** table:
   - Each row: requirement | PASS/FAIL/UNCERTAIN badge | severity | reason
5. Show **Hard blockers** section (red)
6. Show **Knowledge gaps** section (amber) with "does your company hold X?" prompts
7. Show **Overall: VIABLE / REVIEW / BLOCKED** badge at the top
8. Click any row to see two-sided evidence (tender quote + company item)
9. Override one result with a reason → matrix updates
10. Switch to a different company → entirely different result set proves it's not hardcoded

---

## 17. Build order (estimated ~6h)

| Step | What | Est. |
|------|------|------|
| 1 | Supabase migration (4 new tables) | 15 min |
| 2 | `lib/match/types.ts` | 20 min |
| 3 | `lib/match/tasks.ts` + `tasks.test.ts` | 45 min |
| 4 | `lib/match/rule-matcher.ts` + `rule-matcher.test.ts` | 60 min |
| 5 | `lib/match/ontology-matcher.ts` + `ontology-matcher.test.ts` | 30 min |
| 6 | `SEMANTIC_MATCH_PROMPT` + `lib/match/semantic-matcher.ts` | 30 min |
| 7 | `lib/match/reference-matcher.ts` | 45 min |
| 8 | `lib/match/assemble.ts` + `assemble.test.ts` | 60 min |
| 9 | `POST /api/match` + `GET /api/match/[id]` + `POST /api/match/[id]/override` | 30 min |
| 10 | Evaluation matrix UI on tenders/[id] page | 60 min |
| **Total** | | **~6h** |

Build steps 1–9 before touching UI. Tests must pass at each step before moving on.
