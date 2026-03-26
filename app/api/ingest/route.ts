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
export async function POST(req: NextRequest) {
  try {
    const { reviews } = await req.json();

    if (!reviews || !Array.isArray(reviews)) {
      return NextResponse.json(
        { error: "Missing `reviews` array in body" },
        { status: 400 }
      );
    }

    // Splitter — reviews are short so use small chunks
    // Most reviews fit in one chunk, but long ones get split
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const docs = [];

    for (const review of reviews) {
      const chunks = await splitter.createDocuments(
        [review.text],
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
