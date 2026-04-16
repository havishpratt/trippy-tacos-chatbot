import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  getExistingReviewKeys,
  isNewReview,
  reviewKey,
} from "@/lib/dedup";
import {
  filterValidGoogleReviews,
  mapGoogleReviewToIngestFormat,
  scrapeGoogleReviews,
} from "@/lib/google-scraper";
import {
  processAllReviewBatches,
  type IngestReview,
} from "@/lib/ingest-pipeline";
import { storeReviewChunksInBatches } from "@/lib/store-review-chunks";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === "") return false;
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length).trim();
  return token === secret;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorizeCron(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const placeUrl = process.env.GOOGLE_MAPS_PLACE_URL;
    if (!placeUrl || placeUrl.trim() === "") {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_PLACE_URL is not set" },
        { status: 500 }
      );
    }

    console.log("Google sync: starting");

    const rawItems = await scrapeGoogleReviews(placeUrl.trim());
    const totalScraped = rawItems.length;

    const validItems = filterValidGoogleReviews(rawItems);
    const validReviews = validItems.length;

    const mapped: IngestReview[] = [];
    for (const item of validItems) {
      const row = mapGoogleReviewToIngestFormat(item);
      if (row != null) {
        mapped.push(row);
      }
    }

    const existingKeys = await getExistingReviewKeys();
    let duplicatesSkipped = 0;
    const newReviewsList: IngestReview[] = [];

    for (const r of mapped) {
      if (!isNewReview(r.reviewer ?? "anonymous", r.date ?? null, existingKeys)) {
        duplicatesSkipped++;
        continue;
      }
      existingKeys.add(reviewKey(r.reviewer ?? "anonymous", r.date ?? null));
      newReviewsList.push(r);
    }

    const newReviews = newReviewsList.length;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });

    const docs = await processAllReviewBatches(splitter, newReviewsList);

    let chunksStored = 0;
    if (docs.length > 0) {
      chunksStored = await storeReviewChunksInBatches(docs, "Google sync");
    }

    const summary = {
      totalScraped,
      validReviews,
      newReviews,
      duplicatesSkipped,
      chunksStored,
    };
    console.log("Google sync: complete", summary);

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Google sync failed";
    console.error("Google sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
