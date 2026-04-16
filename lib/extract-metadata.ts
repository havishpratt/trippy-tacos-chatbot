import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export type ReviewSentiment = "positive" | "mixed" | "negative";

export type ReviewExtractedMetadata = {
  sentiment: ReviewSentiment;
  items_mentioned: string[];
  issues: string[];
  price_mentions: Record<string, string>;
  language: string;
};

export const DEFAULT_REVIEW_EXTRACTED_METADATA: ReviewExtractedMetadata = {
  sentiment: "mixed",
  items_mentioned: [],
  issues: [],
  price_mentions: {},
  language: "en",
};

const SENTIMENTS = new Set<ReviewSentiment>(["positive", "mixed", "negative"]);

const SYSTEM_PROMPT = `You extract structured metadata from a single restaurant customer review for Trippy Tacos (Tex-Mex / tacos).

Return ONLY a valid JSON object with exactly these keys (no markdown, no code fences, no explanation):
- sentiment: one of "positive", "mixed", "negative"
- items_mentioned: array of strings — menu items or dishes named or clearly implied (e.g. "birria tacos", "nachos", "horchata"). Use lowercase phrasing where natural. Empty array if none.
- issues: array of strings — specific complaint tags in snake_case when possible (e.g. "too_salty", "long_wait", "bland_meat", "dry_tortilla", "cold_food", "rude_service"). Empty array if none or review is praise-only.
- price_mentions: object mapping item or category strings to price strings as written (e.g. {"taco": "$3.50", "empanadas": "$11"}). Empty object {} if none.
- language: ISO-style short code for the review's primary language (e.g. "en", "es").

Be conservative: do not invent items, prices, or issues not supported by the review text.`;

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  apiKey: process.env.GOOGLE_API_KEY,
});

function extractTextFromLlmContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      )
      .map((part) => part.text)
      .join("");
  }
  return String(content);
}

function stripJsonFromResponse(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

function parseJsonObject(text: string): unknown {
  const stripped = stripJsonFromResponse(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("Invalid JSON");
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

function toPriceMentions(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || k.trim() === "") continue;
    if (typeof v === "string") {
      out[k.trim()] = v.trim();
    } else if (typeof v === "number" && !Number.isNaN(v)) {
      out[k.trim()] = String(v);
    }
  }
  return out;
}

function normalizeMetadata(raw: unknown): ReviewExtractedMetadata {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_REVIEW_EXTRACTED_METADATA };
  }
  const o = raw as Record<string, unknown>;

  const sentimentRaw = o.sentiment;
  const sentiment =
    typeof sentimentRaw === "string" && SENTIMENTS.has(sentimentRaw as ReviewSentiment)
      ? (sentimentRaw as ReviewSentiment)
      : DEFAULT_REVIEW_EXTRACTED_METADATA.sentiment;

  const languageRaw = o.language;
  const language =
    typeof languageRaw === "string" && languageRaw.trim() !== ""
      ? languageRaw.trim()
      : DEFAULT_REVIEW_EXTRACTED_METADATA.language;

  return {
    sentiment,
    items_mentioned: toStringArray(o.items_mentioned),
    issues: toStringArray(o.issues),
    price_mentions: toPriceMentions(o.price_mentions),
    language,
  };
}

/**
 * Calls Gemini to extract structured metadata from a single review body.
 * Empty/whitespace input returns defaults without calling the API.
 * API or JSON parse failures throw — callers can catch and apply defaults.
 */
export async function extractReviewMetadata(
  reviewText: string
): Promise<ReviewExtractedMetadata> {
  const trimmed = reviewText.trim();
  if (!trimmed) {
    return { ...DEFAULT_REVIEW_EXTRACTED_METADATA };
  }

  const response = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(trimmed),
  ]);
  const text = extractTextFromLlmContent(response.content);
  const parsed = parseJsonObject(text);
  return normalizeMetadata(parsed);
}
