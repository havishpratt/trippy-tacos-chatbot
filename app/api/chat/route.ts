import { NextRequest } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "@langchain/core/prompts";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { retriever } from "@/lib/vectorstore";
import { formatDocumentsAsString } from "langchain/util/document";

// System prompt — tune this for Trippy Tacos' voice
const SYSTEM_PROMPT = `You are a helpful assistant for Trippy Tacos, a food truck business. 
You answer questions about customer feedback, reviews, and sentiment based on the context provided.

When answering:
- Reference specific reviews and sentiments when relevant
- If asked about ratings or satisfaction, summarize the overall trend
- Be honest if the context doesn't contain enough info to answer
- Keep responses concise and actionable for a business owner

Context from customer reviews:
{context}`;

// LLM — Gemini 2.5 Flash, very cheap
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-preview-05-20",
  temperature: 0.3,
  streaming: true,
  apiKey: process.env.GOOGLE_API_KEY,
});

// Build the RAG chain
const prompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
  HumanMessagePromptTemplate.fromTemplate("{question}"),
]);

const ragChain = RunnableSequence.from([
  {
    context: retriever.pipe(formatDocumentsAsString),
    question: new RunnablePassthrough(),
  },
  prompt,
  llm,
  new StringOutputParser(),
]);

/**
 * POST /api/chat
 * Body: { message: "What do customers think about our salsa?" }
 * Returns: Streaming text response
 */
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing `message`" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the response
    const stream = await ragChain.stream(message);

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Chat failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
