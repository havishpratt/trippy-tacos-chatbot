# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

RAG chatbot for Trippy Tacos, a food truck business. Ingests customer reviews, embeds them with OpenAI, stores in Supabase pgvector, and answers questions about customer feedback via a streaming chat interface.

## Setup & Commands

```bash
# Install deps (no package.json yet — install manually)
npm install @supabase/supabase-js @langchain/core @langchain/openai @langchain/community langchain ai

# Run dev server
npx next dev

# Ingest sample reviews
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d @sample-reviews.json
```

Requires `.env.local` with: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.

The Supabase pgvector table must be created first by running `supabase/migration.sql` in the Supabase SQL Editor.

## Architecture

```
POST /api/ingest → chunk reviews (RecursiveCharacterTextSplitter, 500/50) → embed (Google text-embedding-004) → store in Supabase `reviews` table

POST /api/chat → embed user query → similarity search (top-5 via match_reviews RPC) → inject context into system prompt → stream Gemini 2.5 Flash response
```

- **lib/supabase.ts** — Supabase admin client (service role key, server-side only)
- **lib/vectorstore.ts** — SupabaseVectorStore + OpenAIEmbeddings + retriever (k=5)
- **app/api/chat/route.ts** — RAG chain built with LangChain RunnableSequence, streams response as plain text chunks
- **app/api/ingest/route.ts** — Accepts `{ reviews: [...] }`, chunks and embeds into pgvector
- **components/ChatBot.tsx** — Client component, reads streaming response via ReadableStream
- **supabase/migration.sql** — Creates `reviews` table (1536-dim vector), IVFFlat index, `match_reviews` RPC function, and a `chat_sessions` table stub for V2

## Key Details

- Embeddings are 768 dimensions (Google text-embedding-004). The pgvector column and RPC function are hardcoded to this.
- Chat uses Gemini 2.5 Flash via LangChain's `RunnableSequence` pattern: `{ context: retriever.pipe(format), question: passthrough } → prompt → llm → parser`.
- Streaming is raw text chunks over a ReadableStream, not SSE — the client reads with `reader.read()` loop.
- Review metadata (source, rating, date, reviewer, location) is stored in a JSONB column and the `match_reviews` RPC supports JSONB `@>` filtering.
