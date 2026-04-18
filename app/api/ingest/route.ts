import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  processAllReviewBatches,
  type IngestReview,
} from "@/lib/ingest-pipeline";
import { vectorStore } from "@/lib/vectorstore";

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

    const docs = await processAllReviewBatches(
      splitter,
      reviews as IngestReview[]
    );

    // Embed and store all chunks
    await vectorStore.addDocuments(docs);

    return NextResponse.json({
      success: true,
      chunksStored: docs.length,
      reviewsProcessed: reviews.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Ingest failed";
    console.error("Ingest error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
