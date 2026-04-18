# Todo

## Completed
- [x] **RAG Quality Fix** — chunk size 2000/200, reviewer attribution tags, retriever k=10 (`rag-quality-fix-plan.md`)
- [x] **Wikipedia-style citations** — inline `[1]`/`[2]` refs, JSON response with sources, citation footer in ChatBot.tsx
- [x] **Rich review metadata** — LLM extraction at ingest (sentiment, items_mentioned, issues, price_mentions, language) via `lib/extract-metadata.ts`, batched parallel processing
- [x] **Google scraper integration** — `/api/sync/google`, Apify Google Maps actor, dedupe, ingest pipeline, batched vector store writes (`lib/google-scraper.ts`, `lib/store-review-chunks.ts`)
- [x] **Metadata extraction (bulk)** — initial **288** reviews: Claude bulk extraction + direct Supabase JSONB updates. Ongoing ingest uses **Gemini** in `extractReviewMetadata`.

## Blocked / Limited
- [ ] **Yelp scraper** — `/api/sync/yelp` and `lib/yelp-scraper.ts` are implemented, but **Yelp blocks or interferes with automated scraping** in practice; Apify runs may fail or return no usable rows until tooling or policy changes.

## Known Issues
- **Falsy rating bug** — `app/api/ingest/route.ts:71` uses `review.rating || null` which coerces rating `0` to `null`. Should be `review.rating ?? null`.
- **No ingest dedup** — re-ingesting the same reviews creates duplicates. Need either content hashing or a manual `DELETE FROM reviews` before re-ingest.

## Planned (ready to implement)
- [ ] **Citation quality fix** — similarity threshold in `match_reviews` RPC + LLM-driven `[n]` citations + filter footer to cited sources only. Plan: `~/.claude/plans/smooth-wobbling-riddle.md`

## Backlog
- [ ] **Deploy to Vercel** — deploy app, set all env vars (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `APIFY_API_TOKEN`, `CRON_SECRET`, `GOOGLE_MAPS_PLACE_URL`, `YELP_BUSINESS_URL`), confirm `/api/chat` and `/api/sync` work in prod.
- [ ] **Scheduled cloud scraper** — once deployed, wire up Supabase `pg_cron` + `pg_net` to POST to `/api/sync` on a schedule (e.g. daily). Requires prod URL and `CRON_SECRET` set in Supabase secrets.
- [ ] **Incremental sync (fetch from latest)** — instead of scraping all 500 reviews and deduping, query Supabase for the most recent review date per source, pass as `reviewsStartDate` to Apify. Dedup becomes a safety net only. Faster syncs, less Gemini cost.
- [ ] **Yelp API integration** — Yelp Fusion API (limited review count) or future official access if needed.
- [ ] **Google Maps/Places API integration** — optional alternative to Apify for Google reviews if desired.
