/**
 * Generate a short prefixed ID for entity rows.
 * Uses crypto.randomUUID() — available in Node 18+ and all modern browsers.
 * Format: PREFIX-XXXXXXXX (8 hex chars, 32-bit collision space per prefix)
 */
export function genId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}-${uuid.slice(0, 8).toUpperCase()}`;
}
