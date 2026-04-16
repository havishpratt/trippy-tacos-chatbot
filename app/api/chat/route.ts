import { NextRequest } from "next/server";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { Document } from "@langchain/core/documents";
import { retriever } from "@/lib/vectorstore";

type ChatSource = {
  index: number;
  reviewer: string;
  date: string | null;
  source: string;
  rating: number | null;
};

const formatNumberedContext = (docs: Document[]): string =>
  docs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join("\n\n");

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
    return {
      index: i + 1,
      reviewer,
      date,
      source,
      rating,
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

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: unknown }).text === "string"
      )
      .map((part) => part.text)
      .join("");
  }
  return String(content);
}

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing `message`" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const docs = await retriever.invoke(message);
    const sources = buildSourcesFromDocs(docs);
    const context = formatNumberedContext(docs);

    const chatMessages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT.replace("{context}", context)),
    ];

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
    const text = extractAssistantText(response.content);

    const body = JSON.stringify({ text, sources });
    return new Response(body, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error: unknown) {
    const errMsg =
      error instanceof Error ? error.message : "Chat failed";
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
