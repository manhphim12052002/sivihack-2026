export interface LLMClient {
  extract(systemPrompt: string, userContent: string): Promise<string | null>;
}

class OpenRouterClient implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extract(systemPrompt: string, userContent: string): Promise<string | null> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SiviHack-2026 Three Out of Forty",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0]?.message.content ?? null;
  }
}

/** Returns null when the API key is absent — callers treat missing output as UNKNOWN. */
function buildClient(): LLMClient | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
  return new OpenRouterClient(key, model);
}

export const llmClient: LLMClient | null = buildClient();

export const PROFILE_SYSTEM_PROMPT = `You normalize construction company descriptions into structured profiles.
Return a JSON object. Use null for missing fields. Never invent values.

Fields:
- name (string)
- home_base (string: city/region the company operates from)
- headquarters (string)
- regions (string[]: list of regions/states the company works in)
- radius_km (number|null: maximum operating radius in km)
- trades (string[]: types of construction work)
- cpv_prefixes (string[]: CPV code prefixes like ["45", "45200000"])
- contract_min_eur (number|null)
- contract_max_eur (number|null)
- guarantee_capacity_eur (number|null)
- self_perform_share_pct (number|null: percentage of work done in-house)
- earliest_start (string|null: ISO date YYYY-MM-DD)
- capacity_per_week (number: bids per week, default 3)
- references_held (string[]: types of reference projects held)
- hard_exclusions (string[]: project types the company refuses)`;

export const EXTRACTION_SYSTEM_PROMPT = `Extract structured company intelligence from the following construction company document chunks.
Return a JSON object with this exact shape:
{
  "capabilities": [{ "type": string, "label": string, "chunk_ids": string[] }],
  "references": [{
    "name": string,
    "client": string|null,
    "project_types": string[],
    "location": string|null,
    "contract_value_eur": number|null,
    "completed_at": string|null,
    "capabilities": string[],
    "chunk_ids": string[]
  }],
  "qualifications": [{
    "type": string,
    "label": string,
    "valid_from": string|null,
    "valid_until": string|null,
    "chunk_ids": string[]
  }]
}

Rules:
- Omit any item where chunk_ids would be empty.
- Do not invent data not present in the source text.
- Preserve German terms in the label fields.
- For capabilities.type use English uppercase: ROAD_CONSTRUCTION, CIVIL_ENGINEERING, EARTHWORKS, PIPELINE, SEWER_CONSTRUCTION, BUILDING_ELECTRICAL, OTHER.
- For qualifications.type use: PQ_VOB, ISO_9001, ISO_14001, DB_PREQUALIFICATION, SPECIALIST_LICENSE, INSURANCE, OTHER.`;
