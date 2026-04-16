# Todo

## Completed
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
