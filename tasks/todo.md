# Todo

## Completed
<<<<<<< HEAD
- [x] **RAG Quality Fix** — chunk size 2000/200, reviewer attribution tags, retriever k=10 (`rag-quality-fix-plan.md`) — done in `f2ee645`
- [x] **Wikipedia-style citations** — inline `[1]`/`[2]` refs, JSON response with sources, citation footer in ChatBot.tsx — done in `c31487c`
- [x] **Rich review metadata** — LLM extraction at ingest (sentiment, items_mentioned, issues, price_mentions, language) via `lib/extract-metadata.ts`, batched parallel processing — done in `b64031c`

## Pending Plans (saved in tasks/)
- [ ] **Yelp Review Sync** — automated daily sync via Apify scraper + dedup (`yelp-review-sync-plan.md`)

## Backlog
- [ ] **Yelp API integration** — connect to Yelp Fusion API using claimed business account. Fetch business info, reviews (3 max via API), photos, and business details. Requires Yelp API key from developer portal.
- [ ] **Google Maps/Places API integration** — connect to Google Places API using claimed business account. Fetch Google reviews, business info, ratings, and photos. Requires Google Places API key (can use existing GOOGLE_API_KEY or separate one).

## Known Issues
- **Falsy rating bug** — `app/api/ingest/route.ts:71` uses `review.rating || null` which coerces rating `0` to `null`. Should be `review.rating ?? null`.
- **No ingest dedup** — re-ingesting the same reviews creates duplicates. Need either content hashing or a manual `DELETE FROM reviews` before re-ingest.
=======
- [x] **RAG Quality Fix** — chunk size 2000/200, reviewer attribution tag, retriever k=10 (`rag-quality-fix-plan.md`)
- [x] **Wikipedia-style citations** (partial) — inline `[1]`, `[2]` references; API returns `sources`; footer lists reviewer, date, source. **Not done:** links to original Yelp URLs in the footer.
- [x] **Rich review metadata** — `sentiment`, `items_mentioned`, `issues`, `price_mentions`, and `language` via Gemini in ingest; payload fields include `reviewer`, `location`, `rating`, `date`, `source`.
- [x] **Google scraper integration** — `/api/sync/google`, Apify Google Maps actor, dedupe, ingest pipeline, batched vector store writes (`lib/google-scraper.ts`, `lib/store-review-chunks.ts`).
- [x] **Metadata extraction (bulk)** — initial **288** reviews: Claude bulk extraction + direct Supabase JSONB updates (see `CLAUDE.md`). Ongoing ingest uses **Gemini** in `extractReviewMetadata`.

## Blocked / limited
- [ ] **Yelp scraper** — `/api/sync/yelp` and `lib/yelp-scraper.ts` are implemented, but **Yelp blocks or interferes with automated scraping** in practice; Apify runs may fail or return no usable rows until tooling or policy changes.

## Backlog
- [ ] **Yelp API integration** — Yelp Fusion API (limited review count) or future official access if needed.
- [ ] **Google Maps/Places API integration** — optional alternative to Apify for Google reviews if desired.
>>>>>>> 2450031694f4783d4f071a526c47649fb4cdfff6
