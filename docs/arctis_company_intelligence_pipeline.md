# Arctis Company Intelligence Pipeline Specification

## 1. Goal

Given a **new construction company** and whatever information it can
provide, automatically construct and continuously maintain a
**canonical, evidence-backed Company Intelligence profile** that the
tender-matching engine can consume.

> **Give us what you already have → AI builds your company profile →
> review/correct it → tender matching starts.**

The Company Intelligence Pipeline is separate from Tender Intelligence,
while reusing document ingestion, chunking, evidence, normalization, and
provenance infrastructure.

## 2. Inputs

``` text
Company Onboarding
├── Basic Information
│   ├── Name / HQ / Employees / Revenue
├── Company Documents
│   ├── PDF / DOCX / XLSX / CSV
│   ├── Certificates / reference lists
│   ├── Employee qualifications
│   └── Previous bid/project documents
├── Customer-Provided Information
│   ├── Preferred regions / contract size
│   ├── Constraints / risk preferences
│   └── Current capacity
└── Future Integrations
    ├── CRM / ERP
    ├── SharePoint / Google Drive
    └── Other company systems
```

## 3. Output

``` text
CANONICAL COMPANY
├── Identity
├── Capabilities[]
├── Regions[]
├── Commercial Profile
├── References[]
├── Qualifications[]
├── Resources[]
├── Capacity[]
├── Constraints[]
├── Preferences[]
├── Sources[]
├── Evidence[]
└── Knowledge Gaps[]
```

## 4. General Workflow

``` text
NEW ARCTIS CLIENT
       ↓
BASIC ONBOARDING
       ↓
Documents ─── Manual Input ─── Future Integrations
       ↓             ↓                 ↓
       └──────── SOURCE REGISTRY ──────┘
                       ↓
             DOCUMENT PROCESSING
                       ↓
                  Parse + Chunk
                       ↓
                 LLM Extraction
                       ↓
              SEMANTIC NORMALIZATION
                       ↓
                 DEDUPE / MERGE
                       ↓
              EVIDENCE VALIDATION
                       ↓
                 COMPANY REVIEW
                ↙       ↓       ↘
             Accept    Edit    Complete
                ↘       ↓       ↙
                 CANONICAL COMPANY
                       ↓
                       DB
                       ↓
                 MATCHING ENGINE
```

## 5. Company Intelligence Requirements

  -------------------------------------------------------------------------
  ID                      Requirement               Acceptance Criterion
  ----------------------- ------------------------- -----------------------
  **CIP1**                Create company            Create a new company
                                                    using minimal basic
                                                    information

  **CIP2**                Accept heterogeneous      Ingest PDF, DOCX,
                          company sources           XLSX/CSV, and manual
                                                    customer input

  **CIP3**                Maintain source registry  Every uploaded/imported
                                                    source receives an ID,
                                                    metadata, and origin

  **CIP4**                Parse company documents   Produce
                                                    evidence-addressable
                                                    chunks retaining
                                                    page/section/row
                                                    locations

  **CIP5**                Extract company           Extract capabilities,
                          intelligence              references,
                                                    qualifications,
                                                    resources, and
                                                    arbitrary company facts

  **CIP6**                Capture strategic         Explicitly collect
                          preferences               target regions, project
                                                    size, unwanted work,
                                                    and other preferences

  **CIP7**                Capture operational       Represent available
                          capacity                  crews, estimator
                                                    capacity, guarantee
                                                    capacity, etc.

  **CIP8**                Normalize company         Map heterogeneous
                          intelligence              terminology into the
                                                    shared tender/company
                                                    ontology

  **CIP9**                Preserve provenance       Evidence-backed company
                                                    facts point to their
                                                    exact source

  **CIP10**               Track information origin  Distinguish
                                                    document-extracted,
                                                    customer-provided,
                                                    Arctis-verified,
                                                    inferred, and
                                                    integration-synced
                                                    information

  **CIP11**               Merge                     Combine equivalent
                          duplicate/corroborating   knowledge without
                          knowledge                 losing evidence

  **CIP12**               Human verification        Customer/Arctis can
                                                    accept, edit, reject,
                                                    or complete extracted
                                                    information

  **CIP13**               Represent knowledge gaps  Distinguish absence
                                                    from lack of
                                                    information

  **CIP14**               Track validity/freshness  Certificates,
                                                    qualifications,
                                                    capacity, etc. can
                                                    expire or become stale

  **CIP15**               Support incremental       New
                          updates                   documents/corrections
                                                    update the profile
                                                    without rebuilding it

  **CIP16**               Support tender-triggered  Tender matching can
                          enrichment                identify missing
                                                    company information and
                                                    request it

  **CIP17**               Persist Canonical Company Store normalized
                                                    company intelligence
                                                    for reuse across
                                                    tenders

  **CIP18**               Be integration-ready      Future ERP/CRM/document
                                                    connectors feed the
                                                    same canonical model
  -------------------------------------------------------------------------

## 6. Core Company Model

``` text
Company
├── Identity
├── Capabilities
├── Geography / Regions
├── Commercial Profile
├── References[]
├── Qualifications[]
├── Resources[]
├── Current Capacity[]
├── Constraints[]
└── Preferences[]
```

**Identity:** name, headquarters, employees, revenue, website,
description.

**Capabilities:** road construction, sewer construction, pipelines,
earthworks, building electrical, turnkey building, etc.

**Geography:** preferred regions, maximum radius, countries, geographic
exclusions.

**Commercial Profile:** preferred/min/max project size, guarantee
capacity, contractor-role preferences.

**References** are first-class objects:

``` json
{
  "id": "REF-012",
  "name": "B17 State Road Rehabilitation",
  "client": "State of Bavaria",
  "project_type": ["ROAD_CONSTRUCTION", "ROAD_REHABILITATION"],
  "location": "Bavaria",
  "contract_value_eur": 2800000,
  "completed_at": "2024-06-12",
  "capabilities": ["EARTHWORKS", "ASPHALT", "DRAINAGE"],
  "evidence": []
}
```

**Qualifications:** PQ-VOB, DB prequalifications, ISO certificates,
registrations, specialist licenses, insurance evidence.

**Resources:** machinery, crews, specialist personnel, equipment.

**Capacity:** currently available crews, estimator capacity, remaining
guarantee capacity, personnel/equipment availability.

**Constraints:** hard or near-hard restrictions such as no rail-side
projects or maximum project size.

**Preferences:** softer strategic preferences such as preferred region,
client, project size, role, and risk profile.

# 7. Individual Flows

## Flow 1 --- Company Creation

**Purpose:** create a minimal company shell.

**Input:** name, HQ, optional website/employees/revenue.

``` text
New Customer → Basic Information → Create Company ID → COMPANY SHELL
```

**Output:**

``` json
{
  "company_id": "COMP-001",
  "name": "Brenner & Sohn Tiefbau GmbH",
  "headquarters": "Augsburg",
  "status": "ONBOARDING"
}
```

## Flow 2 --- Company Source Ingestion

**Purpose:** let customers upload information they already maintain.

**Input:** company profiles, references, certificates, equipment files,
qualification documents, etc.

``` text
Upload → Detect Format → Register Source → Store Original
```

``` json
{
  "source_id": "CSRC-003",
  "company_id": "COMP-001",
  "type": "PDF",
  "filename": "PQ-VOB.pdf",
  "origin": "CUSTOMER_UPLOAD",
  "hash": "...",
  "status": "AVAILABLE"
}
```

**Output:** `CompanySource[]`

## Flow 3 --- Document Parsing & Chunking

**Purpose:** convert heterogeneous documents into evidence-addressable
content using shared Tender Intelligence infrastructure.

``` text
Company Source
      ↓
Format Parser
  ↙   ↓   ↘
PDF DOCX XLSX
  ↘   ↓   ↙
Evidence-Addressable Chunks
```

``` json
{
  "chunk_id": "CCHUNK-129",
  "source_id": "CSRC-003",
  "location": {"page": 1, "section": "Präqualifikation"},
  "text": "..."
}
```

**Output:** `CompanyDocumentChunk[]`

## Flow 4 --- Company Intelligence Extraction

**Purpose:** turn company documents into atomic knowledge.

``` text
Company Chunks + Extraction Schema
              ↓
             LLM
      ↙        ↓        ↘
Capabilities References Qualifications / Resources
```

``` json
{
  "type": "REFERENCE_PROJECT",
  "value": {
    "name": "B17 State Road Rehabilitation",
    "project_type": ["ROAD_REHABILITATION"],
    "contract_value_eur": 2800000,
    "completed_year": 2024,
    "capabilities": ["EARTHWORKS", "ASPHALT", "DRAINAGE"]
  },
  "evidence_chunk_ids": ["CCHUNK-129"]
}
```

**Rule:** `No evidence → no trusted document-derived claim.`

**Output:** `CompanyKnowledgeCandidate[]`

## Flow 5 --- Explicit Business Preference Collection

**Purpose:** collect strategic information that should not be inferred.

Questions can cover operating region, preferred/max contract size,
unwanted work, travel radius, contractor role, and risk conditions.

``` text
Onboarding Questions → Customer Answers → Normalize → Preferences / Constraints
```

``` json
{
  "type": "OPERATING_RADIUS",
  "value": 150,
  "unit": "KM",
  "origin": "CUSTOMER_PROVIDED"
}
```

**Output:** `CompanyPreference[] + CompanyConstraint[]`

## Flow 6 --- Operational Capacity Collection

**Purpose:** separate dynamic state from long-term capability.

**Input:** available crews, current projects, estimator capacity,
guarantee capacity, equipment/personnel availability.

``` json
{
  "type": "ESTIMATOR_CAPACITY",
  "value": 3,
  "unit": "BIDS_PER_WEEK",
  "valid_as_of": "2026-09-17",
  "origin": "CUSTOMER_PROVIDED"
}
```

``` text
Capability: "We own two road-construction crews."
Operational state: "Both crews are committed until March."
```

**Output:** `CompanyCapacity[]`

## Flow 7 --- Semantic Normalization

**Purpose:** map tender and company terminology into shared concepts.

``` text
COMPANY                         TENDER
"Straßenbau"             "Straßenbauarbeiten"
     └───────→ ROAD_CONSTRUCTION ←───────┘
```

The same applies to qualifications, capabilities, project types,
geography, etc.

**Output:** normalized company knowledge.

## Flow 8 --- Deduplication & Merging

**Purpose:** combine observations describing the same company knowledge
while retaining evidence.

``` text
Company Profile ─┐
PQ-VOB.pdf ──────┼→ CANONICAL QUALIFICATION
Previous Bid ────┘
```

``` json
{
  "qualification_id": "QUAL-021",
  "type": "PQ_VOB",
  "status": "VALID",
  "evidence": ["CCHUNK-129", "CCHUNK-481"]
}
```

**Output:** canonical company facts.

## Flow 9 --- Provenance & Origin Tracking

**Purpose:** distinguish where evidence is from and how Arctis learned
something.

Suggested origins:

``` text
DOCUMENT_EXTRACTED
CUSTOMER_PROVIDED
ARCTIS_VERIFIED
SYSTEM_INFERRED
INTEGRATION_SYNCED
```

Document-derived:

``` json
{
  "type": "PQ_VOB",
  "status": "VALID",
  "origin": "DOCUMENT_EXTRACTED",
  "evidence": [{"source_id": "CSRC-003", "page": 1}]
}
```

Customer-provided:

``` json
{
  "type": "MAX_OPERATING_RADIUS",
  "value": 150,
  "unit": "KM",
  "origin": "CUSTOMER_PROVIDED"
}
```

**Output:** traceable company intelligence.

## Flow 10 --- Human Verification

**Purpose:** turn automatic extraction into trusted company
intelligence.

``` text
Extracted Company Profile
          ↓
       REVIEW UI
   ↙      ↓      ↘
Confirm  Edit   Reject / Add
   ↘      ↓      ↙
     VERIFIED PROFILE
```

Example:

``` text
QUALIFICATIONS

✓ PQ-VOB
  Source: PQ-VOB.pdf · p.1
  [Confirm] [Edit]

? DB railway qualification
  No evidence found
  [Add qualification]
```

**Output:** verified/edited company intelligence.

## Flow 11 --- Knowledge-Gap Detection

**Purpose:** prevent missing information from being interpreted as
evidence of absence.

``` text
NOT IN DATABASE ≠ COMPANY DOES NOT HAVE IT
```

States:

``` text
KNOWN_PRESENT
KNOWN_ABSENT
UNKNOWN
STALE
```

``` json
{
  "type": "DB_RAILWAY_QUALIFICATION",
  "state": "UNKNOWN",
  "reason": "No supporting or rejecting information found"
}
```

**Output:** `CompanyKnowledgeGap[]`

## Flow 12 --- Freshness & Validity Management

**Purpose:** handle different rates of change.

``` text
Stable:         Completed reference projects
Expiring:       Certificates / insurance / qualifications
Highly dynamic: Crews / estimator capacity / guarantee capacity
```

Metadata:

``` text
valid_from
valid_until
updated_at
freshness_type
```

States:

``` text
CURRENT
EXPIRING
EXPIRED
STALE
```

**Output:** freshness-aware company intelligence.

## Flow 13 --- Canonical Company Assembly

**Purpose:** construct the stable company-side contract.

``` text
                 CANONICAL COMPANY
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
    Identity        Capabilities        Regions
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    References     Qualifications      Resources
        └────────────────┼────────────────┘
                         ▼
                 Commercial Profile
                  ↙      ↓       ↘
             Capacity Constraints Preferences
                         ↓
               Sources + Evidence
                         ↓
                  Knowledge Gaps
```

``` json
{
  "company_id": "COMP-001",
  "identity": {},
  "capabilities": [],
  "regions": [],
  "commercial_profile": {},
  "references": [],
  "qualifications": [],
  "resources": [],
  "capacity": [],
  "constraints": [],
  "preferences": [],
  "sources": [],
  "knowledge_gaps": []
}
```

**Output:** `CanonicalCompany`

## Flow 14 --- Persist Company Intelligence

**Purpose:** make company intelligence reusable across all tender
evaluations.

``` text
CanonicalCompany
       ↓
   PostgreSQL
       ├── companies
       ├── company_capabilities
       ├── company_regions
       ├── company_references
       ├── company_qualifications
       ├── company_resources
       ├── company_capacity
       ├── company_constraints
       ├── company_preferences
       └── company_knowledge_gaps
```

Original files stay in object storage.

**Output:** persisted company intelligence.

## Flow 15 --- Tender-Triggered Company Enrichment

**Purpose:** progressively improve company intelligence when real
tenders expose missing information.

``` text
Tender Requirement
       ↓
Matching Engine
       ↓
Company Knowledge Missing
       ↓
KNOWLEDGE GAP
       ↓
Ask Customer
"Do you have qualifying references?"
    ↙     ↓      ↘
  Yes     No    Unsure
   ↓
Upload / Add Evidence
   ↓
Company Intelligence Pipeline
   ↓
Update CanonicalCompany
   ↓
Re-run Matching
```

**Output:** enriched company profile + updated evaluation.

## Flow 16 --- Continuous Updates

**Purpose:** maintain the profile after onboarding.

``` text
             NEW INFORMATION
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
 New Document   User Edit    Integration
       └────────────┼────────────┘
                    ▼
        Company Intelligence Pipeline
                    ↓
          Update CanonicalCompany
                    ↓
          Identify Changed Facts
                    ↓
       Re-evaluate Affected Tenders
```

Future sources can include ERP, CRM, SharePoint, Google Drive, and
company document systems.

**Output:** continuously maintained Company Intelligence.

# 8. Database Direction

Use the same PostgreSQL/Supabase environment as Tender Intelligence.

Suggested company-side tables:

``` text
companies
company_capabilities
company_regions
company_commercial_profiles
company_references
company_qualifications
company_resources
company_capacity
company_constraints
company_preferences
company_knowledge_gaps
```

Shared infrastructure:

``` text
sources
chunks
evidence
```

Original tender/company files belong in object storage.

# 9. Full System Relationship

``` text
                   ARCTIS INTELLIGENCE PLATFORM

           TENDER SIDE                    COMPANY SIDE
               │                              │
     eForms / CSV / OCDS              Customer onboarding
               │                              │
       Vergabeunterlagen               Company documents
               │                       Manual preferences
               │                       Future integrations
               ▼                              ▼
       Source Registry                  Source Registry
               ↓                              ↓
         Parse / Chunk                    Parse / Chunk
               ↓                              ↓
          Extraction                       Extraction
               ↓                              ↓
         Normalization                    Normalization
               ↓                              ↓
        Merge / Resolve                 Merge / Verify
               ↓                              ↓
      CANONICAL TENDER                CANONICAL COMPANY
               └──────────────┬───────────────┘
                              ↓
                       MATCHING ENGINE
                              ↓
                    Requirement-by-Requirement
                    ↙          ↓          ↘
                  PASS        FAIL      UNCERTAIN
                    └──────────┼──────────┘
                              ↓
                     8 DECISION ASPECTS
                              ↓
                  Tender / Lot Evaluation
                              ↓
                  PURSUE / REVIEW / SKIP
                              ↓
                         TOP 3 BIDS
```

# 10. Hackathon Implementation Priority

## P0 --- Must Work

1.  Create company.
2.  Upload company documents.
3.  Register sources.
4.  Parse PDF / structured files.
5.  Extract capabilities, references, and qualifications.
6.  Collect basic preferences/constraints manually.
7.  Normalize extracted knowledge.
8.  Review/edit extracted profile.
9.  Assemble `CanonicalCompany`.
10. Persist `CanonicalCompany`.

## P1 --- Strong Demo Features

1.  Evidence/provenance links.
2.  Knowledge-gap representation.
3.  Capacity information.
4.  Freshness/validity.
5.  Tender-triggered enrichment.

## P2 --- Architecture / Future

1.  Continuous synchronization.
2.  CRM integration.
3.  ERP integration.
4.  SharePoint / Google Drive integration.
5.  Automatic re-evaluation of affected tenders.

# 11. Engineering Principles

1.  **Minimize onboarding effort.** Customers provide existing material
    rather than populate the database manually.
2.  **Reuse the document pipeline.** Tender and company documents share
    parsing, chunking, evidence, and provenance infrastructure.
3.  **Evidence before trust.** Document-derived company knowledge must
    be traceable to its source.
4.  **Ask rather than infer strategic intent.** Preferences and
    constraints should normally come directly from the company.
5.  **Capability is not capacity.** Long-term abilities and current
    availability remain separate.
6.  **Missing is not absent.** Lack of recorded evidence must not
    automatically become a hard failure.
7.  **Use a shared ontology.** Tender requirements and company
    capabilities/qualifications normalize into compatible concepts.
8.  **Human verification is part of the product.** AI accelerates
    onboarding rather than silently creating an unquestionable profile.
9.  **Track freshness.** Certificates expire and operational capacity
    changes.
10. **Onboarding can be progressive.** A company does not need a perfect
    profile before screening starts.
11. **Use tenders to expose knowledge gaps.** Real requirements
    progressively improve Company Intelligence.
12. **CanonicalCompany is the contract.** Downstream systems depend on
    canonical data rather than raw documents.
13. **Design for client #101.** A new Arctis customer should mostly
    upload/import existing information, review the generated profile,
    and start matching---not require custom engineering.
