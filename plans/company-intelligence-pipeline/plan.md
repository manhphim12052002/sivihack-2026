# Company Intelligence Pipeline — Implementation Plan

**Status:** planning  
**Owner:** backend builder  
**Created:** 2026-09-17  
**Deadline:** 2026-09-18 15:00 (submission)

---

## 0. What This Plan Covers

Everything needed to ship the Company Intelligence Pipeline end-to-end:

1. Supabase schema (tables, RLS off for demo)
2. OpenRouter LLM client
3. Next.js API routes (backend logic)
4. Supporting lib modules (parser, extractor, normalizer, assembler)
5. Frontend wiring (existing companies page already scaffolded)
6. Unit tests

The pipeline shares Supabase with Tender Intelligence. Company and tender
tables sit in the same project; shared infrastructure (sources, chunks,
evidence) is defined here and referenced by both.

---

## 1. Supabase Schema

Run as a single migration in the Supabase SQL editor.

### 1.1 Shared infrastructure

```sql
-- Every document or manual input registered as a source
CREATE TABLE sources (
  id          TEXT PRIMARY KEY,            -- CSRC-001, SRC-001, etc.
  entity_type TEXT NOT NULL,               -- 'company' | 'tender'
  entity_id   TEXT NOT NULL,
  type        TEXT NOT NULL,               -- PDF | DOCX | XLSX | MANUAL | EFORMS
  filename    TEXT,
  origin      TEXT NOT NULL,               -- CUSTOMER_UPLOAD | MANUAL_INPUT | EFORM_API
  sha256      TEXT,
  status      TEXT NOT NULL DEFAULT 'AVAILABLE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidence-addressable chunks from any parsed document
CREATE TABLE chunks (
  id          TEXT PRIMARY KEY,            -- CCHUNK-001, CHUNK-001
  source_id   TEXT NOT NULL REFERENCES sources(id),
  page        INTEGER,
  section     TEXT,
  paragraph   INTEGER,
  range       TEXT,                        -- XLSX range e.g. "A12:F20"
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2 Companies

```sql
CREATE TABLE companies (
  id                     TEXT PRIMARY KEY,    -- COMP-001
  name                   TEXT NOT NULL,
  headquarters           TEXT NOT NULL DEFAULT '',
  employees              INTEGER,
  revenue_eur            REAL,
  website                TEXT,
  description            TEXT,
  status                 TEXT NOT NULL DEFAULT 'ONBOARDING',
  -- typed screening fields (matches CompanyProfile in api-types)
  home_base              TEXT NOT NULL DEFAULT '',
  regions                JSONB,               -- string[]
  radius_km              REAL,
  trades                 JSONB,               -- string[]
  cpv_prefixes           JSONB,               -- string[]
  contract_min_eur       REAL,
  contract_max_eur       REAL,
  partner_threshold_eur  REAL,
  references_held        JSONB,               -- string[]
  hard_exclusions        JSONB,               -- string[]
  guarantee_capacity_eur REAL,
  self_perform_share_pct REAL,
  earliest_start         TEXT,
  capacity_per_week      INTEGER NOT NULL DEFAULT 3,
  raw_text               TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capabilities extracted from documents
CREATE TABLE company_capabilities (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  type        TEXT NOT NULL,               -- e.g. ROAD_CONSTRUCTION
  label       TEXT NOT NULL,
  origin      TEXT NOT NULL,               -- DOCUMENT_EXTRACTED | CUSTOMER_PROVIDED
  status      TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | CONFIRMED | REJECTED
  evidence    JSONB,                       -- chunk_id[]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reference projects
CREATE TABLE company_references (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id),
  name                TEXT NOT NULL,
  client              TEXT,
  project_types       JSONB,               -- string[]
  location            TEXT,
  contract_value_eur  REAL,
  completed_at        TEXT,                -- ISO date string
  capabilities        JSONB,               -- string[]
  origin              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  evidence            JSONB,               -- chunk_id[]
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Qualifications (PQ-VOB, ISO certs, licences, insurance)
CREATE TABLE company_qualifications (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id),
  type         TEXT NOT NULL,               -- PQ_VOB | ISO_9001 | DB_PREQUALIFICATION | ...
  label        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  valid_from   TEXT,
  valid_until  TEXT,
  freshness    TEXT NOT NULL DEFAULT 'CURRENT',  -- CURRENT | EXPIRING | EXPIRED | STALE
  origin       TEXT NOT NULL,
  evidence     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preferences (soft strategic)
CREATE TABLE company_preferences (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  type        TEXT NOT NULL,
  value       TEXT,
  unit        TEXT,
  origin      TEXT NOT NULL DEFAULT 'CUSTOMER_PROVIDED',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraints (hard/near-hard restrictions)
CREATE TABLE company_constraints (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  type        TEXT NOT NULL,
  value       TEXT,
  unit        TEXT,
  origin      TEXT NOT NULL DEFAULT 'CUSTOMER_PROVIDED',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge gaps
CREATE TABLE company_knowledge_gaps (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  type        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'UNKNOWN',   -- KNOWN_PRESENT | KNOWN_ABSENT | UNKNOWN | STALE
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingestion jobs (reuses pattern from ingest_job in PRD)
CREATE TABLE company_ingest_jobs (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id),
  stage       TEXT NOT NULL DEFAULT 'queued',
  pct         INTEGER NOT NULL DEFAULT 0,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.3 No RLS, no auth

This is a local demo. Disable RLS on all tables (Supabase default for
new tables is RLS off; confirm in the dashboard under each table >
Policies).

---

## 2. OpenRouter LLM Client

**File:** `apps/web/src/lib/llm.ts`

Single async function so it is swappable and mockable in tests:

```ts
// Interface the rest of the app depends on — never call fetch() directly
export interface LLMClient {
  extract(systemPrompt: string, userContent: string): Promise<string>;
}
```

Implementation:

- POST to `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`
- Model: `google/gemini-2.5-flash` (long context, reliable structured output,
  competent German, cheap) — configure via `OPENROUTER_MODEL` env var to allow
  quick swaps
- Request headers: `HTTP-Referer: http://localhost:3000`,
  `X-Title: SiviHack-2026 Three Out of Forty`
- Response: parse `.choices[0].message.content` as JSON
- Fallback: if `OPENROUTER_API_KEY` is absent, return `null` — callers treat
  missing LLM output as `UNKNOWN`, never as a failure

**File:** `apps/web/src/lib/llm.ts` exports a singleton `llmClient` built
from env vars. Tests inject a `MockLLMClient` that returns fixture JSON.

---

## 3. File Structure

```
apps/web/src/
├── lib/
│   ├── supabase.ts          ← already done
│   ├── llm.ts               ← new: OpenRouter client
│   ├── id.ts                ← new: nanoid-based ID generator (COMP-, CSRC-, CCHUNK-, ...)
│   └── api-types.d.ts       ← existing frontend contract (do not break)
├── app/
│   ├── api/
│   │   └── companies/
│   │       ├── route.ts               ← GET (list), POST (create from text/file)
│   │       └── [id]/
│   │           ├── route.ts           ← GET, PUT (update profile)
│   │           ├── sources/route.ts   ← POST (upload document)
│   │           ├── extract/route.ts   ← POST (trigger LLM extraction on uploaded sources)
│   │           └── assemble/route.ts  ← POST (assemble CanonicalCompany from extracted knowledge)
│   └── companies/
│       └── page.tsx          ← already scaffolded
└── lib/
    └── company/
        ├── create.ts         ← Flow 1: create company shell
        ├── ingest-source.ts  ← Flow 2–3: register source, parse to chunks
        ├── extract.ts        ← Flow 4: LLM extraction → CompanyKnowledgeCandidate[]
        ├── preferences.ts    ← Flow 5–6: normalize preferences + capacity from typed input
        ├── normalize.ts      ← Flow 7: map labels → ontology terms
        ├── assemble.ts       ← Flow 13: build CanonicalCompany from DB rows
        └── types.ts          ← shared TypeScript types for company pipeline
```

---

## 4. Implementation Phases

### Phase 0 — Foundation (do first, ~2h)

1. **Create Supabase tables** (section 1 SQL above)
2. **`src/lib/id.ts`** — `genId(prefix: string): string` using `crypto.randomUUID()`
   sliced to 8 chars (no extra dependency)
3. **`src/lib/llm.ts`** — OpenRouter client with mock fallback
4. **`src/lib/company/types.ts`** — TypeScript types:
   - `CompanyShell`, `CanonicalCompany`, `CompanySource`, `CompanyChunk`
   - `CompanyKnowledgeCandidate` (type, value, evidence_chunk_ids, origin)
   - `ExtractionResult` (capabilities[], references[], qualifications[])

### Phase 1 — Company CRUD (P0 items 1, 6, 8, 10) (~1.5h)

**`src/lib/company/create.ts`**
- `createCompany(input: { name, headquarters, ...opts })` → inserts into `companies`, returns shell

**`GET /api/companies`**
- Query `companies` table, return `CompanyProfile[]` matching `api-types.d.ts` shape

**`POST /api/companies`**
- Body: `{ text?: string }` or `multipart/form-data` with a file
- If text-only: normalize immediately with LLM (section 4.3), skip extraction
- If file: register source, enqueue extraction job (return job id), normalize typed
  fields from LLM later
- Returns `CompanyProfile`

**`GET /api/companies/[id]`** → fetch from DB

**`PUT /api/companies/[id]`** → update typed fields (human correction, Flow 10)

This wires directly to the existing `companies/page.tsx` which already calls
`api.companies()`, `api.createCompanyFromText()`, `api.createCompanyFromFile()`,
and `api.updateCompany()`.

### Phase 2 — Document Ingestion & Parsing (P0 items 2–4) (~2h)

**`POST /api/companies/[id]/sources`**
- Accept `multipart/form-data` file upload (PDF, DOCX, XLSX, TXT)
- Compute SHA-256, deduplicate by hash (skip if already stored)
- Store file to Supabase Storage bucket `company-documents`
- Insert row into `sources` table
- Chunk the document:
  - **PDF**: use `pdf-parse` npm package; split on page breaks; each page = one chunk
    with `{ page, text }`
  - **DOCX**: use `mammoth` npm package; split into paragraphs; retain paragraph index
  - **XLSX/CSV**: use `xlsx` npm package; each row range = one chunk
  - **TXT/plain**: split into ~500-character paragraphs
- Insert chunks into `chunks` table
- Returns `{ source_id, chunk_count }`

**Packages to install:**
```
npm install pdf-parse mammoth xlsx --save
npm install @types/pdf-parse --save-dev
```

### Phase 3 — LLM Extraction (P0 items 5, 7) (~2.5h)

**`POST /api/companies/[id]/extract`**
- Fetch all chunks for the company's sources from DB
- Run LLM extraction in batches of 10 chunks (to stay within context)
- Prompt structure (system):
  ```
  You are extracting structured company intelligence from construction company documents.
  Extract: capabilities, reference projects, qualifications, preferences, constraints.
  Return valid JSON matching the ExtractionResult schema. If a field has no evidence,
  omit it. Never invent data not present in the source text.
  Always include chunk_ids for every extracted item.
  ```
- Parse LLM response as `ExtractionResult`
- Insert extracted items into:
  - `company_capabilities` (with `status: 'PENDING'`, `evidence: [chunk_id]`)
  - `company_references` (same)
  - `company_qualifications` (same)
- Normalize labels through `normalize.ts` (map German → ontology enum)
- Update job progress via `company_ingest_jobs`

**`src/lib/company/normalize.ts`**
- Map common German capability terms → ontology constants:
  - `Straßenbau`, `Straßenbauarbeiten` → `ROAD_CONSTRUCTION`
  - `Tiefbau` → `CIVIL_ENGINEERING`
  - `Erdarbeiten`, `Erdbau` → `EARTHWORKS`
  - `Leitungsbau`, `Rohrleitungsbau` → `PIPELINE`
  - `Kanalbau`, `Entwässerung` → `SEWER_CONSTRUCTION`
  - `PQ-VOB`, `Präqualifikation` → `PQ_VOB`
  - `ISO 9001` → `ISO_9001`
- Used by both company and tender pipelines → shared ontology

**LLM prompt for profile normalization (text/file → typed fields):**
Extract a JSON object with fields: `name`, `home_base`, `headquarters`,
`regions` (array), `radius_km`, `trades` (array), `cpv_prefixes` (array),
`contract_min_eur`, `contract_max_eur`, `guarantee_capacity_eur`,
`self_perform_share_pct`, `earliest_start` (ISO date or null),
`capacity_per_week`. Return null for any field not mentioned.

### Phase 4 — Assembly & Persistence (P0 items 9–10) (~1h)

**`src/lib/company/assemble.ts`** — `assembleCanonicalCompany(companyId: string)`
- Fetch company row + all related rows from DB
- Build `CanonicalCompany` object:
  ```ts
  {
    company_id, identity, capabilities, regions, commercial_profile,
    references, qualifications, resources, capacity, constraints,
    preferences, sources, knowledge_gaps
  }
  ```
- Knowledge gaps: for each expected field (capabilities, PQ_VOB,
  references), if no CONFIRMED rows exist → insert `UNKNOWN` gap row

**`POST /api/companies/[id]/assemble`** — trigger assembly, persist gaps,
return `CanonicalCompany`

### Phase 5 — Human Verification UI (P0 item 8, P1 item 1) (~1h)

The existing `company-form.tsx` already handles editing typed fields. Extend
`companies/page.tsx` to:

1. After create-from-file, show a **"Extracted items"** section listing
   pending capabilities, references, qualifications with Confirm / Reject buttons
2. Each item shows its source chunk text (evidence)
3. Confirm → sets `status: 'CONFIRMED'` via `PUT /api/companies/[id]`
4. Reject → sets `status: 'REJECTED'`

This satisfies judging criterion 1.2 (human verification is part of the product).

### Phase 6 — Knowledge Gaps & Freshness (P1 items 2, 4) (~45 min)

- After assembly, display knowledge gaps in the company detail view:
  `Unknown: PQ-VOB — no supporting or rejecting evidence found`
- Qualification rows show `freshness` badge: CURRENT / EXPIRING / EXPIRED
- Compute freshness from `valid_until` vs today

---

## 5. API Routes Summary

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/companies` | List companies (→ triage company selector) |
| POST | `/api/companies` | Create from text or file upload |
| GET | `/api/companies/[id]` | Get full profile |
| PUT | `/api/companies/[id]` | Update typed fields (human correction) |
| POST | `/api/companies/[id]/sources` | Upload + parse a document |
| POST | `/api/companies/[id]/extract` | LLM extraction over registered sources |
| POST | `/api/companies/[id]/assemble` | Assemble CanonicalCompany, detect gaps |

All routes are Next.js App Router `route.ts` files. No separate API server
needed — the web app is the backend for the demo.

---

## 6. Unit Tests

**Runner:** `vitest` (already familiar to the Next.js ecosystem; add as
devDependency). Tests live in `apps/web/src/lib/company/__tests__/`.

**Install:**
```
npm install vitest --save-dev
```

Add to `package.json`:
```json
"scripts": {
  "test": "vitest run"
}
```

### 6.1 `normalize.test.ts`

Tests for `normalize.ts` — pure function, no I/O:

| Test | Input | Expected output |
|---|---|---|
| German term maps to ontology | `"Straßenbau"` | `ROAD_CONSTRUCTION` |
| Case-insensitive match | `"TIEFBAU"` | `CIVIL_ENGINEERING` |
| Unknown term passes through | `"Spezialtiefbau XYZ"` | `OTHER` |
| PQ-VOB normalizes | `"PQ-VOB Präqualifikation"` | `PQ_VOB` |
| Partial match in sentence | `"Referenzen aus Straßenbauarbeiten"` | `ROAD_CONSTRUCTION` |

### 6.2 `assemble.test.ts`

Tests for `assembleCanonicalCompany` logic — mock the Supabase client:

| Test | Setup | Assertion |
|---|---|---|
| Empty capabilities → UNKNOWN gap | company with no capability rows | `knowledge_gaps` contains `{ type: 'CAPABILITIES', state: 'UNKNOWN' }` |
| Confirmed capability → no gap | one CONFIRMED capability row | no gap for that type |
| Pending-only rows → gap still UNKNOWN | one PENDING capability row | gap present (unverified ≠ confirmed) |
| References assembled correctly | two reference rows (one CONFIRMED, one REJECTED) | only CONFIRMED in output |
| Expired qualification flagged | qual row with `valid_until` in the past | `freshness: 'EXPIRED'` |

### 6.3 `extract.test.ts`

Tests for the extraction response parser — mock `llmClient`:

| Test | LLM returns | Assertion |
|---|---|---|
| Valid extraction parsed | valid `ExtractionResult` JSON | capabilities + references inserted |
| Missing evidence rejected | capability with no `chunk_ids` | item dropped (no evidence, no trusted claim) |
| Malformed JSON handled | `"not json"` | throws `ExtractionParseError`, job marked error |
| Empty extraction OK | `{ capabilities: [], references: [], qualifications: [] }` | no rows inserted, no crash |

### 6.4 `create.test.ts`

Tests for `createCompany` — mock Supabase insert:

| Test | Input | Assertion |
|---|---|---|
| Minimal input creates shell | `{ name, headquarters }` | row inserted with `status: 'ONBOARDING'` |
| ID is prefixed correctly | any input | `id` starts with `COMP-` |
| Duplicate name allowed | same name twice | two separate rows (no unique constraint on name) |

---

## 7. LLM Prompts (Reference)

### 7.1 Profile normalization (text → typed fields)

```
System: You normalize construction company descriptions into structured profiles.
Return a JSON object. Use null for missing fields. Never invent values.

Fields: name (string), home_base (string), headquarters (string),
regions (string[]), radius_km (number|null), trades (string[]),
cpv_prefixes (string[] of CPV code prefixes like ["45", "45200000"]),
contract_min_eur (number|null), contract_max_eur (number|null),
guarantee_capacity_eur (number|null), self_perform_share_pct (number|null),
earliest_start (ISO date string|null), capacity_per_week (number default 3).

User: <company description text>
```

### 7.2 Document extraction (chunks → capabilities/references/qualifications)

```
System: Extract structured company intelligence from the following document chunks.
Return a JSON object with this exact shape:
{
  "capabilities": [{ "type": string, "label": string, "chunk_ids": string[] }],
  "references": [{
    "name": string, "client": string|null, "project_types": string[],
    "location": string|null, "contract_value_eur": number|null,
    "completed_at": string|null, "capabilities": string[], "chunk_ids": string[]
  }],
  "qualifications": [{
    "type": string, "label": string,
    "valid_from": string|null, "valid_until": string|null, "chunk_ids": string[]
  }]
}
Omit any item where chunk_ids would be empty. Do not invent data.
Preserve German terms in the label fields.

User:
<chunk_id>: <chunk text>
...
```

---

## 8. Integration With Tender Matching

The company pipeline feeds the screening rules in `src/tender_extract` (Python) 
and the future matching engine. The `CanonicalCompany` output from `assembleCanonicalCompany`
maps to the `company` table shape in the PRD — specifically the typed fields
(`regions`, `radius_km`, `trades`, `cpv_prefixes`, `contract_min_eur`,
`contract_max_eur`, `guarantee_capacity_eur`, `self_perform_share_pct`,
`earliest_start`, `capacity_per_week`, `references_held`, `hard_exclusions`).

The `PUT /api/companies/[id]` route accepts the same `CompanyProfile` type
the frontend already renders in `company-form.tsx` — no schema mismatch.

---

## 9. Demo Walkthrough (to verify before pitch)

1. Open `/companies`
2. Paste "Brenner & Sohn Tiefbau GmbH, Augsburg, 140 employees, road and
   sewer construction, Bavaria and Baden-Württemberg within 150km,
   prequalified PQ-VOB, 3 estimators, max contract 5M EUR" → click
   **Normalize profile** → typed fields appear
3. Review and save
4. Upload a PDF reference list → sources registered, chunks extracted, LLM
   runs, capabilities/references appear as PENDING items
5. Confirm two references, reject one bad extraction → evidence quote shown
6. Knowledge gaps show for any missing qualifications
7. Open `/` with Brenner & Sohn selected → triage list differs from
   Hanseatische Bau → judges can verify live

---

## 10. Build Order (one-person sprint)

| # | Task | Est. | Depends on |
|---|---|---|---|
| 1 | Supabase migration (SQL above) | 20 min | — |
| 2 | `lib/id.ts` + `lib/llm.ts` | 30 min | — |
| 3 | `lib/company/types.ts` | 20 min | — |
| 4 | `lib/company/create.ts` + `GET/POST /api/companies` | 45 min | 1–3 |
| 5 | `GET/PUT /api/companies/[id]` | 20 min | 4 |
| 6 | `lib/company/normalize.ts` | 30 min | 3 |
| 7 | `normalize.test.ts` | 20 min | 6 |
| 8 | `POST /api/companies/[id]/sources` (upload + parse) | 60 min | 4 |
| 9 | `lib/company/extract.ts` + `POST .../extract` | 60 min | 2, 6, 8 |
| 10 | `extract.test.ts` | 25 min | 9 |
| 11 | `lib/company/assemble.ts` + `POST .../assemble` | 45 min | 9 |
| 12 | `assemble.test.ts` + `create.test.ts` | 30 min | 11 |
| 13 | Verification UI in `companies/page.tsx` | 45 min | 5, 9 |
| 14 | Knowledge gaps display | 20 min | 11 |
| **Total** | | **~8h** | |

---

## 11. Out of Scope (Hackathon)

- CRM / ERP / SharePoint integration (P2 per spec)
- Continuous re-evaluation of affected tenders when company updates
- Per-row RLS or multi-tenant isolation
- DOCX parsing (fall back to TXT extraction if mammoth fails)
- Freshness-based auto-invalidation crons
- The `POST /api/companies/[id]/sources` endpoint returning streaming progress
  (job polling is sufficient)
