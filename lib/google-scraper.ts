const APIFY_BASE = "https://api.apify.com/v2";
const GOOGLE_REVIEWS_ACTOR = "compass~google-maps-reviews-scraper";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** Fields read from Apify Google Maps review dataset rows */
export interface GoogleMapsReviewItem {
  text?: string;
  textTranslated?: string;
  publishedAtDate?: string;
  stars?: unknown;
  name?: string;
  city?: string;
}

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error("APIFY_API_TOKEN is not set");
  }
  return token.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats an ISO datetime (e.g. 2026-04-12T00:50:07.222Z) to "MMM DD, YYYY" in UTC.
 */
function formatIsoToMmmDdYyyy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Starts the Apify Google Maps Reviews Scraper, polls until completion, returns dataset items.
 */
export async function scrapeGoogleReviews(
  placeUrl: string
): Promise<GoogleMapsReviewItem[]> {
  const token = getApifyToken();

  const startRes = await fetch(
    `${APIFY_BASE}/acts/${GOOGLE_REVIEWS_ACTOR}/runs?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: placeUrl }],
        maxReviews: 500,
        reviewsSort: "newest",
      }),
    }
  );

  if (!startRes.ok) {
    const body = await startRes.text();
    throw new Error(`Apify run start failed: ${startRes.status} ${body}`);
  }

  const startJson = (await startRes.json()) as {
    data?: { id?: string };
  };
  const runId = startJson?.data?.id;
  if (!runId) {
    throw new Error("Apify run response missing data.id");
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = "";

  while (Date.now() < deadline) {
    const runRes = await fetch(
      `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`
    );

    if (!runRes.ok) {
      const body = await runRes.text();
      throw new Error(`Apify run poll failed: ${runRes.status} ${body}`);
    }

    const runJson = (await runRes.json()) as {
      data?: {
        status?: string;
        defaultDatasetId?: string;
        statusMessage?: string;
      };
    };

    const status = runJson?.data?.status ?? "";
    lastStatus = status;

    if (status === "SUCCEEDED") {
      const datasetId = runJson?.data?.defaultDatasetId;
      if (!datasetId) {
        throw new Error("Apify run succeeded but defaultDatasetId is missing");
      }

      const itemsRes = await fetch(
        `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}`
      );

      if (!itemsRes.ok) {
        const body = await itemsRes.text();
        throw new Error(`Apify dataset fetch failed: ${itemsRes.status} ${body}`);
      }

      return (await itemsRes.json()) as GoogleMapsReviewItem[];
    }

    if (status === "FAILED") {
      const msg = runJson?.data?.statusMessage ?? "unknown";
      throw new Error(`Apify actor run FAILED: ${msg}`);
    }

    if (status === "ABORTED" || status === "TIMED-OUT") {
      const msg = runJson?.data?.statusMessage ?? status;
      throw new Error(`Apify actor run ended with ${status}: ${msg}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Apify run did not finish within ${POLL_TIMEOUT_MS / 1000}s (last status: ${lastStatus || "unknown"})`
  );
}

export type GoogleReviewIngest = {
  text: string;
  source: "google";
  rating: number | null;
  date: string | null;
  reviewer: string;
  location: string | null;
};

function normalizeStars(stars: unknown): number | null {
  if (typeof stars === "number" && !Number.isNaN(stars)) {
    const r = Math.round(stars);
    if (r >= 1 && r <= 5) return r;
    return null;
  }
  if (stars == null) return null;
  const n = Number(stars);
  if (Number.isNaN(n)) return null;
  const r = Math.round(n);
  if (r >= 1 && r <= 5) return r;
  return null;
}

/**
 * Maps an Apify Google Maps review item to the ingest payload shape.
 * Returns null when there is no text (neither text nor textTranslated).
 */
export function mapGoogleReviewToIngestFormat(
  item: GoogleMapsReviewItem
): GoogleReviewIngest | null {
  const raw =
    typeof item.text === "string" && item.text.trim() !== ""
      ? item.text.trim()
      : typeof item.textTranslated === "string" &&
          item.textTranslated.trim() !== ""
        ? item.textTranslated.trim()
        : null;

  if (raw == null) {
    return null;
  }

  let date: string | null = null;
  if (
    typeof item.publishedAtDate === "string" &&
    item.publishedAtDate.trim() !== ""
  ) {
    date = formatIsoToMmmDdYyyy(item.publishedAtDate.trim());
  }

  return {
    text: raw,
    source: "google",
    rating: normalizeStars(item.stars),
    date,
    reviewer:
      typeof item.name === "string" && item.name.trim() !== ""
        ? item.name.trim()
        : "anonymous",
    location:
      typeof item.city === "string" && item.city.trim() !== ""
        ? item.city.trim()
        : null,
  };
}

/**
 * Drops reviews with no usable text (rating-only / empty), using Apify field names.
 */
export function filterValidGoogleReviews(
  items: GoogleMapsReviewItem[]
): GoogleMapsReviewItem[] {
  return items.filter((item) => {
    const t = item.text ?? item.textTranslated;
    return typeof t === "string" && t.trim() !== "";
  });
}
