import { NextRequest } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { retriever } from "@/lib/vectorstore";
import type { Document } from "@langchain/core/documents";

type ChatSource = {
  index: number;
  reviewer: string;
  date: string | null;
  source: string;
  rating: number | null;
  url: string | null;
};

const YELP_BIZ_URL = "https://www.yelp.com/biz/trippy-tacos-silver-spring-7";

const formatNumberedContext = (docs: Document[]): string =>
  docs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join("\n\n");

function buildYelpFallbackUrl(doc: Document): string {
  const m = (doc.metadata || {}) as Record<string, unknown>;
  const items = Array.isArray(m.items_mentioned) ? m.items_mentioned : [];
  const keywords = items
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .slice(0, 3);

  if (keywords.length === 0) return YELP_BIZ_URL;
  const q = encodeURIComponent(keywords.join(" "));
  return `${YELP_BIZ_URL}?q=${q}`;
}

function buildSourcesFromDocs(docs: Document[]): ChatSource[] {
  return docs.map((doc, i) => {
    const m = (doc.metadata || {}) as Record<string, unknown>;
    const reviewerRaw = m.reviewer;
    const reviewer =
      typeof reviewerRaw === "string" && reviewerRaw.trim() !== ""
        ? reviewerRaw.trim()
        : "Anonymous";
    const dateRaw = m.date;
    const date =
      dateRaw != null && String(dateRaw).trim() !== ""
        ? String(dateRaw)
        : null;
    const sourceRaw = m.source;
    const source =
      typeof sourceRaw === "string" && sourceRaw.trim() !== ""
        ? sourceRaw.trim()
        : "unknown";
    const rating =
      typeof m.rating === "number" && !Number.isNaN(m.rating)
        ? m.rating
        : null;
    const urlRaw = m.url;
    const url =
      typeof urlRaw === "string" && urlRaw.trim() !== ""
        ? urlRaw.trim()
        : buildYelpFallbackUrl(doc);
    return {
      index: i + 1,
      reviewer,
      date,
      source,
      rating,
      url,
    };
  });
}

const SYSTEM_PROMPT = `You are a smart business assistant for Trippy Tacos, a food truck and restaurant in Wheaton, MD. Your audience is the restaurant's owners and employees — not customers.

Your job is to analyze customer reviews and provide clear, actionable insights. Don't just quote reviews back. Instead:

- Synthesize patterns across reviews. "4 out of 5 reviewers praised the birria" is better than listing each one.
- Be actionable: what's working, what needs fixing, what to prioritize.
- Quantify when possible: numbers and proportions over vague summaries.
- Flag recurring complaints as risks.
- Be direct and concise. Owners are busy.
- If the reviews don't contain enough info, say so. Never make up data.

If the user sends a casual message (greeting, small talk, off-topic), respond briefly and naturally — don't force an analysis. Only analyze reviews when the user asks a question about their business, feedback, or menu.

When referencing specific reviews, cite them using [1], [2], etc. corresponding to the numbered reviews in the context. Only cite reviews you actually reference.

Context from customer reviews:
{context}`;

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.3,
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing `message`" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Retrieve relevant reviews
    const docs = await retriever.invoke(message);
    const sources = buildSourcesFromDocs(docs);
    const context = formatNumberedContext(docs);

    if (process.env.NODE_ENV === "development") {
      console.log("\n=== RAG DEBUG ===");
      console.log("User message:", message);
      console.log("Retrieved", docs.length, "chunks:");
      docs.forEach((doc, i) =>
        console.log(`  [${i}] ${doc.pageContent.slice(0, 100)}...`)
      );
      console.log("=== END DEBUG ===\n");
    }

    // Build messages array with conversation history
    const chatMessages = [
      new SystemMessage(SYSTEM_PROMPT.replace("{context}", context)),
    ];

    // Add recent history (last 20 messages = ~10 exchanges)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      if (msg.role === "user") {
        chatMessages.push(new HumanMessage(msg.content));
      } else {
        chatMessages.push(new AIMessage(msg.content));
      }
    }

    chatMessages.push(new HumanMessage(message));

    const response = await llm.invoke(chatMessages);

    // Extract text content, filtering out any thinking blocks
    let text: string;
    if (typeof response.content === "string") {
      text = response.content;
    } else if (Array.isArray(response.content)) {
      text = response.content
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("");
    } else {
      text = String(response.content);
    }

    const body = JSON.stringify({ text, sources });
    return new Response(body, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
