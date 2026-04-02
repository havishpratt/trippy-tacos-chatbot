import { NextRequest, NextResponse } from "next/server";
import type { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  DEFAULT_REVIEW_EXTRACTED_METADATA,
  extractReviewMetadata,
} from "@/lib/extract-metadata";
import { vectorStore } from "@/lib/vectorstore";

const INGEST_BATCH_SIZE = 5;

type IngestReview = {
  text: string;
  source?: string;
  rating?: number | null;
  date?: string | null;
  reviewer?: string | null;
  location?: string | null;
  url?: string | null;
};

/**
 * POST /api/ingest
 *
 * Body: {
 *   reviews: [
 *     {
 *       text: "Great tacos, amazing salsa verde...",
 *       source: "google" | "yelp",
 *       rating: 5,
 *       date: "2024-12-15",
 *       reviewer: "John D.",
 *       location: "Silver Spring"
 *     }
 *   ]
 * }
 *
 * For V1: copy-paste reviews into this format and POST.
 */

function prependReviewAttribution(review: IngestReview): string {
  const reviewer = review.reviewer?.trim() || "anonymous";
  const date = review.date || "unknown date";
  const ratingLabel =
    review.rating == null ? "unrated" : String(review.rating);
  const source = review.source || "unknown";
  return `[Review by ${reviewer} on ${date} — ${ratingLabel}★ via ${source}]\n\n${review.text}`;
}

/**
 * Runs extractReviewMetadata + chunking for each review in parallel; returns all docs for the batch.
 */
async function processReviewBatch(
  splitter: RecursiveCharacterTextSplitter,
  batch: IngestReview[]
): Promise<Document[]> {
  const chunkGroups = await Promise.all(
    batch.map(async (review) => {
      let extracted = DEFAULT_REVIEW_EXTRACTED_METADATA;
      try {
        extracted = await extractReviewMetadata(review.text);
      } catch (err) {
        console.warn(
          "Ingest: extractReviewMetadata failed for a review; using default extraction fields.",
          err
        );
      }

      const textWithTag = prependReviewAttribution(review);
      const metadata = {
        source: review.source || "unknown",
        rating: review.rating || null,
        date: review.date || null,
        reviewer: review.reviewer || "anonymous",
        location: review.location || null,
        url: review.url || null,
        sentiment: extracted.sentiment,
        items_mentioned: extracted.items_mentioned,
        issues: extracted.issues,
        price_mentions: extracted.price_mentions,
        language: extracted.language,
      };

      return splitter.createDocuments([textWithTag], [metadata]);
    })
  );

  return chunkGroups.flat();
}

export async function POST(req: NextRequest) {
  try {
    const { reviews } = await req.json();

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json(
        { error: "Missing `reviews` array in body" },
        { status: 400 }
      );
    }

    // Larger chunks keep most reviews whole; attribution prefix makes splits self-contained
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });

    const docs: Document[] = [];

    for (let i = 0; i < reviews.length; i += INGEST_BATCH_SIZE) {
      const batch = reviews.slice(i, i + INGEST_BATCH_SIZE) as IngestReview[];
      const batchDocs = await processReviewBatch(splitter, batch);
      docs.push(...batchDocs);
    }

    // Embed and store all chunks
    await vectorStore.addDocuments(docs);

    return NextResponse.json({
      success: true,
      chunksStored: docs.length,
      reviewsProcessed: reviews.length,
    });
  } catch (error: any) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { error: error.message || "Ingest failed" },
      { status: 500 }
    );
  }
}
