# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

RAG chatbot for Trippy Tacos, a food truck business. Ingests customer reviews, embeds them with Google Gemini, stores in Supabase pgvector, and answers questions about customer feedback via a chat interface.

## Setup & Commands

```bash
npm install
npm run dev          # Next.js dev server on :3000
npm run test         # Playwright e2e tests
npm run lint         # ESLint

# Ingest reviews
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d @yelp-reviews.json
```

Requires `.env.local` with: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.

Database setup: run migrations via `supabase db push` or execute `supabase/migrations/` SQL files in the Supabase SQL Editor.

## Architecture

```
POST /api/ingest → chunk reviews (RecursiveCharacterTextSplitter, 500/50) → embed (Google gemini-embedding-001) → store in Supabase `reviews` table

POST /api/chat → embed user query → similarity search (top-5 via match_reviews RPC) → inject context into system prompt → invoke Gemini 2.5 Flash response
```

- **lib/supabase.ts** — Supabase admin client (service role key, server-side only)
- **lib/vectorstore.ts** — SupabaseVectorStore + GoogleGenerativeAIEmbeddings + retriever (k=5)
- **app/api/chat/route.ts** — Retrieves relevant chunks, injects into system prompt, returns non-streaming Gemini 2.5 Flash response
- **app/api/ingest/route.ts** — Accepts `{ reviews: [...] }`, chunks and embeds into pgvector
- **components/ChatBot.tsx** — Client component, sends message and displays plain text response
- **supabase/migrations/** — Creates `reviews` table (3072-dim vector), `match_reviews` RPC function, and `chat_sessions` table stub for V2

## Key Details

- Embeddings are 3072 dimensions (Google gemini-embedding-001). The pgvector column and RPC function are hardcoded to this.
- Chat uses Gemini 2.5 Flash via direct `ChatPromptTemplate` + `llm.invoke()` (non-streaming to avoid thinking mode duplication).
- Response is returned via non-streaming `invoke`, not streaming.
- Review metadata (source, rating, date, reviewer, location) is stored in a JSONB column and the `match_reviews` RPC supports JSONB `@>` filtering.
