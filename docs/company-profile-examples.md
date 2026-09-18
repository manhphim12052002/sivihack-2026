# Company profile ingestion — schema and demo examples

Reference for the "Build a company profile" form at `/companies` (paste text or upload a
document). Paste any example below into the **Company information** textarea and submit —
each one is drawn from `apps/web/src/lib/mock/companies.ts`, the demo seed data, so it is
already proven against the live extraction pipeline (`lib/company/extract.ts`).

## What the model extracts

`EXTRACTION_SYSTEM_PROMPT` (`apps/web/src/lib/llm.ts`) turns pasted prose into these arrays.
Every item must cite the source text it came from; nothing is invented — a missing number or
date stays `null`/absent rather than guessed.

| Group | Fields | Notes |
|---|---|---|
| `facts` | `identity.name/headquarters/employees/revenue_eur/website`, `geography.regions/countries/radius_km`, `commercial_profile.contract_min_eur/contract_max_eur/partner_threshold_eur/guarantee_capacity_eur/self_perform_share_pct` | Monetary values as EUR numbers (€2.9M → 2900000) |
| `capabilities` | `label`, evidence | Compound phrases split ("sewers and pipelines" → two entries). Maps to a canonical type in `lib/company/normalize.ts` (`ROAD_CONSTRUCTION`, `CIVIL_ENGINEERING`, `EARTHWORKS`, `PIPELINE`, `SEWER_CONSTRUCTION`, `BUILDING_ELECTRICAL`, `TURNKEY_BUILDING`, `RAILWAY_CONSTRUCTION`, `BRIDGE_CONSTRUCTION`, `HYDRAULIC_ENGINEERING`, else `OTHER`) |
| `references` | `name`, `client`, `project_types`, `location`, `contract_value_eur`, `completed_at`, `capabilities` | One real project per reference. Generic "state"/"district"/"municipal" never becomes a named client/location |
| `qualifications` | `label`, `knowledge_state: KNOWN_PRESENT \| KNOWN_ABSENT`, `valid_from/until` | An explicit *absence* ("no DB qualification") is captured as `KNOWN_ABSENT`; silence yields no item. Ontology: `PQ_VOB`, `ISO_9001`, `ISO_14001`, `DB_PREQUALIFICATION`, `SPECIALIST_LICENSE`, `INSURANCE`, `RAIL_SAFETY` |
| `resources` / `capacity` | `type`, `value`, `unit`, `state` | `capacity` types: `ESTIMATOR_CAPACITY` (bids/week — only if explicitly stated, never defaulted), `AVAILABLE_CREWS`, `CREW_AVAILABILITY`, `GUARANTEE_AVAILABLE`. Vague dates ("free from March", no year) stay `state: AMBIGUOUS`, `available_from: null`, with the raw phrase preserved |
| `constraints` / `preferences` | `type/operator/value/severity` | Constraints are hard limits, e.g. `WORK_TYPE/EXCLUDE/BRIDGE_CONSTRUCTION/HARD`, `COUNTRY/OUTSIDE/GERMANY/HARD`. Preferences are explicit soft wishes only, never inferred strategy |

File upload accepts PDF (selectable text, not scanned), DOCX, XLSX/CSV, TXT — same extraction
runs over the parsed text either way.

## Ready-to-paste examples

### 1. Brenner & Sohn Tiefbau GmbH — civil engineering, broad trade mix

```
Brenner & Sohn Tiefbau GmbH, Augsburg, Bavaria. ~€31M revenue, 140 employees, family-owned since 1962.
Does: road construction, sewers and pipelines, earthworks, municipal civil engineering. Own machinery.
Where: Bavaria, mainly Schwaben and Oberbayern, up to ~150 km from Augsburg — crews go home at night.
Contract size: €400k–€4M. Below that the overhead isn't worth it; above €5M they'd need a partner.
References: a €2.9M state road rehabilitation, a district sewer renewal, several housing-estate site developments.
Cannot show: anything rail-side (no DB qualification, no certified safety staff), no bridges, nothing outside Germany.
Financial limit: their bank supports guarantees up to about €1.5M in total at any one time.
Free from: March — two crews are committed until then.
```

### 2. Elektro Vogtland GmbH — small electrical subcontractor

```
Elektro Vogtland GmbH, Plauen, Saxony. ~€8M revenue, 45 employees, founded 1991.
Does: electrical installation for buildings — power, lighting, fire alarm systems, building automation.
Usually as a subcontractor to a general contractor.
Where: Saxony, Thuringia, eastern Bavaria, up to ~200 km.
Contract size: €80k–€900k.
References: school refurbishments, a hospital ward block, office fit-outs, two care homes.
Cannot show: high voltage, explosion-protected installations, or acting as main contractor on a multi-trade job.
Financial limit: guarantees up to about €300k.
```

### 3. Hanseatische Bau AG — large turnkey general contractor, capacity-constrained

```
Hanseatische Bau AG, Hamburg. ~€310M revenue, 620 employees, founded 1954.
Does: building construction and turnkey projects — offices, schools, hospitals, housing, logistics. They coordinate; the trades are subcontracted.
Where: northern Germany.
Contract size: €8M–€90M. Below €5M the overhead is disproportionate.
References: a university building, two school campuses, a hospital extension, large residential quarters.
Cannot show: civil engineering as lead contractor (no roads, sewers or bridges), nothing in southern Germany in a decade.
Constraint: not money — bidding capacity. The estimating department can seriously pursue about three tenders a week.
```

### 4. Schlosserei Hellweg e.K. — small specialist, near contract ceiling

```
Schlosserei Hellweg e.K., Soest, North Rhine-Westphalia. ~€1.8M revenue, 9 employees, founded 2004.
Does: metal construction, aluminium doors, fire-protection doors as system partner of an approved manufacturer, railings and stairs; powder coating through a partner certified Qualicoat Class 2 and GSB International Premiumbeschichter (Masterqualität); cooperates with the client-appointed SiGeKo per Baustellenverordnung on every site.
Where: Kreis Soest and neighbouring districts, up to ~60 km.
Contract size: €10k–€80k. Above about €60k they team up with a larger partner.
Can show: aluminium entrance and fire doors for a kindergarten in Soest (2025, €48k); T30 fire doors for a community hall in Bad Sassendorf (2024, €35k); railings and doors for the town hall annex in Werl (2023, €62k).
Cannot show: facades, anything outside Germany.
Financial limit: guarantees up to about €60k.
Free from: November 2026.
In their words: We are small and quick. A €90k door package is at the edge of what we carry alone.
```

Pick #1 or #3 for a broad, visually rich profile (many capabilities/references). Pick #2 or #4
to show a narrow specialist getting clean hard-gate rejections against most tenders — good for
demonstrating the "not a similarity match" positioning.

## Writing a new one live

```
<Company name>, <city, state>. ~€<revenue>M revenue, <n> employees[, founded <year>].
Does: <capability 1>, <capability 2>, <capability 3>. [Own machinery / subcontracts X.]
Where: <region(s)>, up to ~<n> km from <base>.
Contract size: €<min>–€<max>. [Above €<n> they'd need a partner.]
References: <a €<value> <project type> (<location>)>, <another reference>...
Cannot show: <exclusion 1>, <exclusion 2>. / No <qualification> qualification.
Financial limit: guarantees up to about €<n> in total at any one time.
Free from: <month> — <n> crews committed until then. [or: <n> estimators can prepare bids per week.]
```

Keep every clause literal and concrete — no year, number or date the model would have to
invent. German trade terms (`Tiefbau`, `Kanalbau`, `Straßenbau`, `Gleisbau`, `Präqualifikation`,
`Sicherungspersonal`) hit the capability/qualification ontology directly; English equivalents
also match, just less precisely.
