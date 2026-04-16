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

# Ingest reviews (manual JSON)
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d @yelp-reviews.json
```

## Environment variables

Set these in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin (ingest, vector writes) |
| `GOOGLE_API_KEY` | Gemini chat, embeddings (`gemini-embedding-001`), metadata extraction |
| `APIFY_API_TOKEN` | Apify actors for Google Maps and Yelp review scrapers |
| `GOOGLE_MAPS_PLACE_URL` | Google Maps place URL for `/api/sync/google` |
| `YELP_BUSINESS_URL` | Yelp business page URL for `/api/sync/yelp` |
| `CRON_SECRET` | Shared secret; protected routes expect `Authorization: Bearer <CRON_SECRET>` |

Database setup: run migrations via `supabase db push` or execute `supabase/migrations/` SQL files in the Supabase SQL Editor.

## Architecture

```
POST /api/ingest → processAllReviewBatches (batch size 2, 15s pause between batches) → per review: Gemini metadata extraction → chunk (2000/200, attribution tag) → embed → Supabase `reviews`

POST /api/chat → query embedding → match_reviews (k=10) → Gemini 2.5 Flash → JSON { text, sources }

POST /api/sync/google → Apify Google Maps scraper → dedupe → ingest pipeline → batched vector writes (lib/store-review-chunks.ts)

POST /api/sync/yelp → Apify Yelp scraper → dedupe → ingest pipeline → batched vector writes

POST /api/sync → sequentially calls internal /api/sync/google then /api/sync/yelp (same Bearer token); returns { google, yelp }
```

### Sync endpoints (all require `Authorization: Bearer $CRON_SECRET`)

- **`/api/sync/google`** — Scrapes Google Maps reviews for `GOOGLE_MAPS_PLACE_URL`, dedupes by reviewer+date, ingests new rows.
- **`/api/sync/yelp`** — Scrapes Yelp via Apify actor `tri_angle~yelp-review-scraper` for `YELP_BUSINESS_URL`. **Note:** Yelp often blocks or rate-limits automated scraping; the Apify actor may fail or return empty data depending on Yelp’s policies.
- **`/api/sync`** — Runs Google sync then Yelp sync; response combines each child JSON body under `google` and `yelp`.

### Key modules

- **lib/supabase.ts** — Supabase admin client (service role, server-only)
- **lib/vectorstore.ts** — SupabaseVectorStore + embeddings + retriever (k=10)
- **lib/extract-metadata.ts** — `extractReviewMetadata` via Gemini 2.5 Flash (temperature 0)
- **lib/ingest-pipeline.ts** — Attribution prefix, `extractReviewMetadata`, `RecursiveCharacterTextSplitter` (2000/200), batch size **2**, **15s delay** between metadata batches
- **lib/dedup.ts** — `reviewKey`, `getExistingReviewKeys`, `isNewReview`
- **lib/google-scraper.ts** — Apify Google Maps reviews (poll until complete)
- **lib/yelp-scraper.ts** — Apify Yelp reviews (`run-sync-get-dataset-items`)
- **lib/store-review-chunks.ts** — Batched `vectorStore.addDocuments` (20 per batch) with per-chunk retry on failure
- **app/api/chat/route.ts** — RAG + Gemini response as JSON
- **components/ChatBot.tsx** — Markdown + citation footer for `[n]` references

## Metadata schema (JSONB per chunk)

From ingest payload: **source**, **rating**, **date**, **reviewer**, **location**.

From LLM extraction (Gemini): **sentiment** (`positive` | `mixed` | `negative`), **items_mentioned** (string[]), **issues** (string[]), **price_mentions** (object), **language** (e.g. `en`, `es`).

The `match_reviews` RPC supports JSONB `@>` filtering on metadata.

## Historical note

For an initial corpus of **288 reviews**, metadata was bulk-extracted with **Claude** and updated **directly in Supabase** (bypassing the live ingest LLM path). Ongoing ingests use **Gemini** via `extractReviewMetadata` in `lib/ingest-pipeline.ts`.

## Other details

- Embeddings: **3072** dimensions (`gemini-embedding-001`); pgvector column and RPC match this.
- Chat: non-streaming `invoke` to avoid duplicate thinking-mode output.
- Review prefix before chunking: `[Review by {reviewer} on {date} — {rating}★ via {source}]` (with fallbacks for missing fields).
