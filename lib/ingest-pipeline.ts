import type { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  DEFAULT_REVIEW_EXTRACTED_METADATA,
  extractReviewMetadata,
} from "@/lib/extract-metadata";

const DELAY_BETWEEN_BATCHES_MS = 15000;

export const INGEST_BATCH_SIZE = 2;

export type IngestReview = {
  text: string;
  source?: string;
  rating?: number | null;
  date?: string | null;
  reviewer?: string | null;
  location?: string | null;
  url?: string | null;
};

export function prependReviewAttribution(review: IngestReview): string {
  if (!review.text || review.text.trim() === "") {
    return "";
  }
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
export async function processReviewBatch(
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
      if (!textWithTag || typeof textWithTag !== "string") {
        console.warn("Ingest: skipping review with invalid text", {
          reviewer: review.reviewer,
          date: review.date,
        });
        return [];
      }
      const metadata = {
        source: review.source || "unknown",
        rating: review.rating ?? null,
        date: review.date || "unknown",
        reviewer: review.reviewer || "anonymous",
        location: review.location || "",
        url: review.url ?? null,
        sentiment: extracted.sentiment,
        items_mentioned: extracted.items_mentioned,
        issues: extracted.issues,
        price_mentions: extracted.price_mentions,
        language: extracted.language,
      };

      return await splitter.createDocuments([textWithTag], [metadata]);
    })
  );

  return chunkGroups.flat();
}

/**
 * Runs all reviews through {@link processReviewBatch} in chunks of {@link INGEST_BATCH_SIZE}.
 * Waits 15 seconds after each batch except the last to stay under metadata extraction rate limits.
 */
export async function processAllReviewBatches(
  splitter: RecursiveCharacterTextSplitter,
  reviews: IngestReview[]
): Promise<Document[]> {
  const all: Document[] = [];
  for (let i = 0; i < reviews.length; i += INGEST_BATCH_SIZE) {
    const batch = reviews.slice(i, i + INGEST_BATCH_SIZE);
    const batchDocs = await processReviewBatch(splitter, batch);
    all.push(...batchDocs);
    if (i + INGEST_BATCH_SIZE < reviews.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  return all;
}
