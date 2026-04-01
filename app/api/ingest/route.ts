import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
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

function prependReviewAttribution(review: {
  text: string;
  source?: string;
  rating?: number | null;
  date?: string | null;
  reviewer?: string | null;
}): string {
  const reviewer = review.reviewer?.trim() || "anonymous";
  const date = review.date || "unknown date";
  const ratingLabel =
    review.rating == null ? "unrated" : String(review.rating);
  const source = review.source || "unknown";
  return `[Review by ${reviewer} on ${date} — ${ratingLabel}★ via ${source}]\n\n${review.text}`;
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

    const docs = [];

    for (const review of reviews) {
      const textWithTag = prependReviewAttribution(review);
      const chunks = await splitter.createDocuments(
        [textWithTag],
        [
          {
            source: review.source || "unknown",
            rating: review.rating || null,
            date: review.date || null,
            reviewer: review.reviewer || "anonymous",
            location: review.location || null,
          },
        ]
      );
      docs.push(...chunks);
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
