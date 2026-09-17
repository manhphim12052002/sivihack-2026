// ─── DB row shapes (mirror Supabase tables) ───────────────────────────────────

export interface CompanyRow {
  id: string;
  name: string;
  headquarters: string;
  employees: number | null;
  revenue_eur: number | null;
  website: string | null;
  description: string | null;
  status: string;
  home_base: string;
  regions: string[] | null;
  radius_km: number | null;
  trades: string[] | null;
  cpv_prefixes: string[] | null;
  contract_min_eur: number | null;
  contract_max_eur: number | null;
  partner_threshold_eur: number | null;
  references_held: string[] | null;
  hard_exclusions: string[] | null;
  guarantee_capacity_eur: number | null;
  self_perform_share_pct: number | null;
  earliest_start: string | null;
  capacity_per_week: number;
  raw_text: string;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  filename: string | null;
  origin: string;
  sha256: string | null;
  storage_path: string | null;
  status: string;
  created_at: string;
}

export interface ChunkRow {
  id: string;
  source_id: string;
  page: number | null;
  section: string | null;
  paragraph: number | null;
  cell_range: string | null;
  text: string;
  created_at: string;
}

export interface CapabilityRow {
  id: string;
  company_id: string;
  type: string;
  label: string;
  origin: string;
  status: string;
  evidence: string[] | null;
  created_at: string;
}

export interface ReferenceRow {
  id: string;
  company_id: string;
  name: string;
  client: string | null;
  project_types: string[] | null;
  location: string | null;
  contract_value_eur: number | null;
  completed_at: string | null;
  capabilities: string[] | null;
  origin: string;
  status: string;
  evidence: string[] | null;
  created_at: string;
}

export interface QualificationRow {
  id: string;
  company_id: string;
  type: string;
  label: string;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  freshness: string;
  origin: string;
  evidence: string[] | null;
  created_at: string;
}

export interface KnowledgeGapRow {
  id: string;
  company_id: string;
  type: string;
  state: string;
  reason: string | null;
  created_at: string;
}

export interface IngestJobRow {
  id: string;
  company_id: string;
  stage: string;
  pct: number;
  message: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pipeline types ───────────────────────────────────────────────────────────

export type ItemStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type KnowledgeGapState = "KNOWN_PRESENT" | "KNOWN_ABSENT" | "UNKNOWN" | "STALE";
export type Freshness = "CURRENT" | "EXPIRING" | "EXPIRED" | "STALE";

export interface ExtractedCapability {
  type: string;
  label: string;
  chunk_ids: string[];
}

export interface ExtractedReference {
  name: string;
  client: string | null;
  project_types: string[];
  location: string | null;
  contract_value_eur: number | null;
  completed_at: string | null;
  capabilities: string[];
  chunk_ids: string[];
}

export interface ExtractedQualification {
  type: string;
  label: string;
  valid_from: string | null;
  valid_until: string | null;
  chunk_ids: string[];
}

/** Raw output from LLM extraction prompt */
export interface ExtractionResult {
  capabilities: ExtractedCapability[];
  references: ExtractedReference[];
  qualifications: ExtractedQualification[];
}

/** Parsed company profile from LLM normalization of free text */
export interface NormalizedProfile {
  name: string;
  home_base: string;
  headquarters: string;
  regions: string[];
  radius_km: number | null;
  trades: string[];
  cpv_prefixes: string[];
  contract_min_eur: number | null;
  contract_max_eur: number | null;
  guarantee_capacity_eur: number | null;
  self_perform_share_pct: number | null;
  earliest_start: string | null;
  capacity_per_week: number;
  references_held: string[];
  hard_exclusions: string[];
}

/** Assembled canonical company returned to the API consumer */
export interface CanonicalCompany {
  company_id: string;
  identity: {
    name: string;
    headquarters: string;
    employees: number | null;
    revenue_eur: number | null;
    website: string | null;
  };
  capabilities: Array<CapabilityRow & { status: ItemStatus }>;
  references: Array<ReferenceRow & { status: ItemStatus }>;
  qualifications: Array<QualificationRow & { freshness: Freshness }>;
  commercial_profile: {
    contract_min_eur: number | null;
    contract_max_eur: number | null;
    guarantee_capacity_eur: number | null;
    self_perform_share_pct: number | null;
  };
  regions: string[];
  radius_km: number | null;
  sources: SourceRow[];
  knowledge_gaps: KnowledgeGapRow[];
}
