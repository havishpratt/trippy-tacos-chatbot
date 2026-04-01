# Plan: Automated Yelp Review Sync

## Context
The Trippy Tacos RAG chatbot currently has 132 chunks from 89 reviews, manually ingested from a CSV export. The user wants all new Yelp reviews automatically synced into Supabase daily at 2am. The Yelp Fusion API only returns 3 reviews (useless), so we need a scraping approach. The ingest pipeline has no deduplication — re-ingesting duplicates creates duplicate embeddings.

## Approach: Apify Yelp Scraper + Dedup + Cron Route

**Why Apify:** Free tier gives $5/mo credit. A single scrape of ~100 reviews costs ~$0.02. Daily runs for a month = ~$0.60. Well within budget and returns ALL reviews.

## Steps

### 1. Extract shared ingest logic → `lib/ingest.ts`
- Move chunking + embedding logic out of `app/api/ingest/route.ts` into a reusable function
- `ingestReviews(reviews: Review[]): Promise<{ chunksStored, reviewsProcessed }>`
- The existing `/api/ingest` route becomes a thin HTTP wrapper calling this function

### 2. Add deduplication → `lib/dedup.ts`
- `getExistingReviewKeys()` — queries Supabase for distinct `(metadata->>'reviewer', metadata->>'date')` pairs, returns a `Set<string>`
- `filterNewReviews(reviews, existingKeys)` — filters out already-ingested reviews
- Fallback: SHA-256 hash of first 200 chars for anonymous/null-date reviews, stored in metadata as `content_hash`

### 3. Build Apify integration → `lib/yelp-scraper.ts`
- `scrapeYelpReviews(businessUrl)` — plain `fetch()` calls to Apify REST API (no npm dep needed)
- Flow: start actor run → poll status → fetch dataset items → map to `{ text, source, rating, date, reviewer, location }`
- Uses env vars: `APIFY_API_TOKEN`, `YELP_BUSINESS_URL`

### 4. Create cron endpoint → `app/api/cron/sync-reviews/route.ts`
- `GET` handler protected by `Authorization: Bearer $CRON_SECRET`
- Scrapes all reviews via Apify → deduplicates → ingests new ones via `lib/ingest.ts`
- Returns JSON: `{ totalScraped, newReviews, chunksStored, duplicatesSkipped }`

### 5. Wire dedup into existing ingest route
- Update `app/api/ingest/route.ts` to call dedup before ingesting
- Add `content_hash` to metadata for all new reviews
- Response now includes `duplicatesSkipped` count

### 6. Add Supabase migration → `supabase/migrations/20260326000000_add_review_dedup_index.sql`
- GIN index on `metadata` column for faster dedup queries

### 7. Cron trigger setup
- `vercel.json` with cron config (for Vercel deploy): `0 2 * * *`
- `scripts/sync-reviews.sh` for local/Docker cron (curl with bearer token)
- Add cron service to `docker-compose.yml` (optional)

### 8. Environment variables
Add to `.env.local` (user does manually):
```
APIFY_API_TOKEN=apify_api_...
YELP_BUSINESS_URL=https://www.yelp.com/biz/trippy-tacos-...
CRON_SECRET=<random-string>
```

## Files to Create
| File | Purpose |
|------|---------|
| `lib/ingest.ts` | Shared chunk + embed logic |
| `lib/dedup.ts` | Deduplication utilities |
| `lib/yelp-scraper.ts` | Apify Yelp scraper client |
| `app/api/cron/sync-reviews/route.ts` | Daily sync cron endpoint |
| `supabase/migrations/20260326000000_add_review_dedup_index.sql` | GIN index |
| `vercel.json` | Vercel cron config |
| `scripts/sync-reviews.sh` | Local cron trigger script |

## Files to Modify
| File | Change |
|------|--------|
| `app/api/ingest/route.ts` | Use shared `ingestReviews()`, add dedup |

## Reuse
- `lib/supabase.ts` — existing `supabaseAdmin` client
- `lib/vectorstore.ts` — existing `vectorStore` and `embeddings`
- `RecursiveCharacterTextSplitter` from `@langchain/textsplitters` (already installed)

## Verification
1. **Dedup test:** Re-ingest the existing 89 reviews → should report 0 new, 89 skipped, DB unchanged at 132 chunks
2. **Apify test:** Run scraper manually → verify review format mapping is correct
3. **Cron e2e:** Call `/api/cron/sync-reviews` → verify only net-new reviews are ingested
4. **Auth test:** Call cron without/wrong token → verify 401
5. **Idempotency:** Run cron twice → second run reports 0 new reviews

## Risk: Vercel Free Tier Timeout
Apify runs take 1-5 minutes. Vercel free tier has 10s function limit. **Mitigation:** Use Apify webhooks — the cron route triggers the Apify run, and Apify calls back to a webhook endpoint when done. For local/Docker, no issue.
