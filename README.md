# Trippy Tacos — RAG Chatbot Starter

## Architecture

```
Reviews (copy-paste JSON) → chunk → embed (OpenAI) → Supabase pgvector
                                                            ↓
User query → embed → similarity search → top-k results → LLM → response
```

## Setup

### 1. Install dependencies

```bash
npm install @supabase/supabase-js @langchain/core @langchain/openai @langchain/community langchain ai
```

### 2. Environment variables

Create `.env.local` in your Next.js root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
```

### 3. Supabase setup

1. Go to Supabase Dashboard → SQL Editor
2. Run the migration in `supabase/migration.sql`
3. This creates the `reviews` table with pgvector embeddings

### 4. Ingest reviews

POST to `/api/ingest` with your review data (see file for format).
This chunks, embeds, and stores reviews in Supabase.

### 5. Chat

The `<ChatBot />` component hits `/api/chat` which:
1. Embeds the user query
2. Runs similarity search against stored reviews
3. Passes top results + query to the LLM
4. Streams the response back

## File Structure

```
lib/
  supabase.ts          — Supabase client
  vectorstore.ts       — pgvector store setup
app/api/
  ingest/route.ts      — POST endpoint to ingest reviews
  chat/route.ts        — POST endpoint for RAG chat
components/
  ChatBot.tsx          — React chat UI component
supabase/
  migration.sql        — SQL to set up pgvector table
```

## V2 Roadmap
- Chat history persistence (store threads in Supabase `chat_sessions` table)
- Document upload (PDF parsing with LangChain document loaders)
- Yelp Fusion API + Google Places API for automated review ingestion
