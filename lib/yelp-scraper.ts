import type { IngestReview } from "@/lib/ingest-pipeline";

const APIFY_BASE = "https://api.apify.com/v2";
const YELP_REVIEWS_ACTOR = "tri_angle~yelp-review-scraper";

/** Fields read from Apify Yelp review dataset rows */
export interface YelpReviewItem {
  text?: string;
  created_date?: string;
  rating?: unknown;
  author_name?: string;
  author_location?: string;
  reviewUrl?: string;
  url?: string;
}

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error("APIFY_API_TOKEN is not set");
  }
  return token.trim();
}

/**
 * Formats an ISO datetime to "MMM D, YYYY" (e.g. Apr 8, 2025) via local Date parsing.
 */
function formatYelpCreatedDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeRating(rating: unknown): number | null {
  if (typeof rating === "number" && !Number.isNaN(rating)) {
    const r = Math.round(rating);
    if (r >= 1 && r <= 5) return r;
    return null;
  }
  if (rating == null) return null;
  const n = Number(rating);
  if (Number.isNaN(n)) return null;
  const r = Math.round(n);
  if (r >= 1 && r <= 5) return r;
  return null;
}

/**
 * Runs the Yelp review scraper via Apify run-sync-get-dataset-items and returns dataset rows.
 */
export async function scrapeYelpReviews(
  businessUrl: string
): Promise<YelpReviewItem[]> {
  const token = getApifyToken();

  const res = await fetch(
    `${APIFY_BASE}/acts/${YELP_REVIEWS_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: businessUrl }],
        maxReviewsPerUrl: 500,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Apify run-sync-get-dataset-items failed: ${res.status} ${body}`
    );
  }

  const data = (await res.json()) as unknown;

  const items: YelpReviewItem[] = Array.isArray(data)
    ? (data as YelpReviewItem[])
    : data !== null &&
        typeof data === "object" &&
        Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: YelpReviewItem[] }).data
      : (() => {
          throw new Error(
            "Apify run-sync-get-dataset-items returned an unexpected JSON shape"
          );
        })();

  console.log("Yelp scrape: raw Apify response", {
    status: res.status,
    itemCount: items.length,
    firstItemKeys: items[0] ? Object.keys(items[0]) : null,
    firstItemSample: items[0] ?? null,
  });

  return items;
}

export function filterValidYelpReviews(items: YelpReviewItem[]): YelpReviewItem[] {
  return items.filter(
    (item) => typeof item.text === "string" && item.text.trim() !== ""
  );
}

/**
 * Maps an Apify Yelp review item to the ingest payload shape.
 * Returns null when text is missing or not a non-empty string.
 */
export function mapYelpReviewToIngestFormat(item: YelpReviewItem): IngestReview | null {
  const raw =
    typeof item.text === "string" && item.text.trim() !== ""
      ? item.text.trim()
      : null;

  if (raw == null) {
    return null;
  }

  let date: string | null = null;
  if (
    typeof item.created_date === "string" &&
    item.created_date.trim() !== ""
  ) {
    date = formatYelpCreatedDate(item.created_date.trim());
  }

  const rawUrl = item.reviewUrl ?? item.url;
  return {
    text: raw,
    source: "yelp",
    rating: normalizeRating(item.rating),
    date,
    reviewer:
      typeof item.author_name === "string" && item.author_name.trim() !== ""
        ? item.author_name.trim()
        : "anonymous",
    location:
      typeof item.author_location === "string"
        ? item.author_location.trim()
        : "",
    url:
      typeof rawUrl === "string" && rawUrl.trim() !== ""
        ? rawUrl.trim()
        : null,
  };
}
