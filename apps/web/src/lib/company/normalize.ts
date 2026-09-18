// Shared ontology: maps German (and mixed) terms → canonical uppercase constants.
// Used by both the company extraction pipeline and tender requirement matching.

export type CapabilityType =
  | "ROAD_CONSTRUCTION"
  | "CIVIL_ENGINEERING"
  | "EARTHWORKS"
  | "PIPELINE"
  | "SEWER_CONSTRUCTION"
  | "BUILDING_ELECTRICAL"
  | "TURNKEY_BUILDING"
  | "RAILWAY_CONSTRUCTION"
  | "BRIDGE_CONSTRUCTION"
  | "HYDRAULIC_ENGINEERING"
  | "METAL_CONSTRUCTION"
  | "OTHER";

export type QualificationType =
  | "PQ_VOB"
  | "ISO_9001"
  | "ISO_14001"
  | "DB_PREQUALIFICATION"
  | "SPECIALIST_LICENSE"
  | "INSURANCE"
  | "RAIL_SAFETY"
  | "OTHER";

interface OntologyEntry<T extends string> {
  type: T;
  /** Lowercased regex patterns; first match wins */
  patterns: RegExp[];
}

const CAPABILITY_ONTOLOGY: OntologyEntry<CapabilityType>[] = [
  {
    type: "ROAD_CONSTRUCTION",
    patterns: [
      /straßenbau/,
      /straßenb/,
      /road.?constr/,
      /road.?rehabilit/,
      /asphalt/,
      /fahrbahn/,
    ],
  },
  {
    type: "CIVIL_ENGINEERING",
    patterns: [/tiefbau/, /civil.?eng/, /infrastructure/],
  },
  {
    type: "EARTHWORKS",
    patterns: [/erdarbeit/, /erdbau/, /aushub/, /earthwork/, /bodenarbeit/],
  },
  {
    type: "PIPELINE",
    patterns: [
      /rohrleitungsbau/,
      /leitungsbau/,
      /pipeline/,
      /versorgungsleitung/,
    ],
  },
  {
    type: "SEWER_CONSTRUCTION",
    patterns: [/kanalbau/, /abwasser/, /entwässerung/, /kanalisation/, /sewer/],
  },
  {
    type: "BUILDING_ELECTRICAL",
    patterns: [
      /elektroinstallation/,
      /elektrotechnik/,
      /electrical/,
      /e-technik/,
    ],
  },
  {
    type: "TURNKEY_BUILDING",
    patterns: [/schlüsselfertig/, /turnkey/, /generalunternehmer/],
  },
  {
    type: "RAILWAY_CONSTRUCTION",
    patterns: [/gleisbau/, /bahnbau/, /railway/, /eisenbahn/],
  },
  {
    type: "BRIDGE_CONSTRUCTION",
    patterns: [/brückenbau/, /bridge/, /ingenieurbau/],
  },
  {
    type: "HYDRAULIC_ENGINEERING",
    patterns: [/wasserbau/, /hydraulic/, /deichbau/, /uferbau/],
  },
  {
    type: "METAL_CONSTRUCTION",
    patterns: [
      /metallbau/,
      /metal.?constr/,
      /stahlbau/,
      /schlosserei/,
      /fassade/,
      /\bfacade/,
      /brandschutztür/,
      /rauchschutztür/,
      /\btür(en)?\b/,
      /\bfenster\b/,
      /\btor(e)?\b/,
      /rolltor/,
      /industrietor/,
      /\bdoor(s)?\b/,
      /\bwindow(s)?\b/,
      /\bgate(s)?\b/,
      /conservator/,
      /wintergarten/,
      /geländer/,
      /\brailing/,
      /\bstair/,
      /treppe/,
    ],
  },
];

const QUALIFICATION_ONTOLOGY: OntologyEntry<QualificationType>[] = [
  {
    type: "RAIL_SAFETY",
    patterns: [
      /rail.?safety/,
      /safety.?staff/,
      /sicherungs(?:personal|posten)/,
      /certified.?safety/,
    ],
  },
  {
    type: "DB_PREQUALIFICATION",
    patterns: [
      /db.?präqualifik/,
      /deutsche.?bahn.*qualifik/,
      /db.?praequalifik/,
      /db[ _-]?(?:prequalification|qualification)/,
    ],
  },

  {
    type: "PQ_VOB",
    patterns: [
      /pq.?vob/,
      /präqualifik/,
      /praequalifik/,
      /pq.?nummer/,
      /präqual/,
    ],
  },
  {
    type: "ISO_9001",
    patterns: [/iso.?9001/, /din.?9001/],
  },
  {
    type: "ISO_14001",
    patterns: [/iso.?14001/, /din.?14001/],
  },
  {
    type: "SPECIALIST_LICENSE",
    patterns: [/fachkunde/, /specialist.?licen/, /meisterbrief/, /zulassung/],
  },
  {
    type: "INSURANCE",
    patterns: [/versicherung/, /haftpflicht/, /insurance/],
  },
];

function matchOntology<T extends string>(
  text: string,
  ontology: OntologyEntry<T>[],
  fallback: T,
): T {
  const lower = text.toLowerCase();
  for (const entry of ontology) {
    if (entry.patterns.some((p) => p.test(lower))) {
      return entry.type;
    }
  }
  return fallback;
}

/** Map a free-form capability label to a canonical CapabilityType. */
export function normalizeCapabilityType(label: string): CapabilityType {
  return matchOntology(label, CAPABILITY_ONTOLOGY, "OTHER");
}

/** Map a free-form qualification label to a canonical QualificationType. */
export function normalizeQualificationType(label: string): QualificationType {
  return matchOntology(label, QUALIFICATION_ONTOLOGY, "OTHER");
}

/**
 * Compute qualification freshness based on valid_until vs a reference date.
 * Returns CURRENT when valid_until is absent (no expiry known).
 */
export function computeFreshness(
  validUntil: string | null,
  referenceDate = new Date(),
): "CURRENT" | "EXPIRING" | "EXPIRED" {
  if (!validUntil) return "CURRENT";
  const expiry = new Date(validUntil);
  const diff = expiry.getTime() - referenceDate.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return "EXPIRED";
  if (days < 90) return "EXPIRING";
  return "CURRENT";
}

/** Preserve all concepts in compound phrases, e.g. sewers and pipelines. */
export function normalizeCapabilityTypes(label: string): CapabilityType[] {
  const matches = CAPABILITY_ONTOLOGY.filter((e) =>
    e.patterns.some((p) => p.test(label.toLowerCase())),
  ).map((e) => e.type);
  return matches.length ? [...new Set(matches)] : ["OTHER"];
}
