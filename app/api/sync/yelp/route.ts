import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  getExistingReviewKeys,
  isNewReview,
  reviewKey,
} from "@/lib/dedup";
import {
  processAllReviewBatches,
  type IngestReview,
} from "@/lib/ingest-pipeline";
import { storeReviewChunksInBatches } from "@/lib/store-review-chunks";
import {
  filterValidYelpReviews,
  mapYelpReviewToIngestFormat,
  scrapeYelpReviews,
} from "@/lib/yelp-scraper";

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

    const businessUrl = process.env.YELP_BUSINESS_URL;
    if (!businessUrl || businessUrl.trim() === "") {
      return NextResponse.json(
        { error: "YELP_BUSINESS_URL is not set" },
        { status: 500 }
      );
    }

    console.log("Yelp sync: starting");

    const rawItems = await scrapeYelpReviews(businessUrl.trim());
    const totalScraped = rawItems.length;

    const validItems = filterValidYelpReviews(rawItems);
    const validReviews = validItems.length;

    const mapped: IngestReview[] = [];
    for (const item of validItems) {
      const row = mapYelpReviewToIngestFormat(item);
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
      chunksStored = await storeReviewChunksInBatches(docs, "Yelp sync");
    }

    const summary = {
      totalScraped,
      validReviews,
      newReviews,
      duplicatesSkipped,
      chunksStored,
    };
    console.log("Yelp sync: complete", summary);

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Yelp sync failed";
    console.error("Yelp sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
