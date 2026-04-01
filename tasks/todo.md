# Todo

## Pending Plans (saved in tasks/)
- [ ] **Yelp Review Sync** — automated daily sync via Apify scraper + dedup (`yelp-review-sync-plan.md`)
- [ ] **RAG Quality Fix** — increase chunk size to 2000, tag reviews with reviewer+date, re-ingest (`rag-quality-fix-plan.md`)

## Backlog
- [ ] **Wikipedia-style citations** — chatbot responses should include inline `[1]`, `[2]` references. Footer shows numbered citations with reviewer name, date, and link to the original Yelp review. Requires: (1) return retrieved doc metadata alongside the response, (2) update system prompt to instruct the LLM to cite sources by number, (3) render citation footnotes in ChatBot.tsx with links
- [ ] **Yelp API integration** — connect to Yelp Fusion API using claimed business account. Fetch business info, reviews (3 max via API), photos, and business details. Requires Yelp API key from developer portal.
- [ ] **Google Maps/Places API integration** — connect to Google Places API using claimed business account. Fetch Google reviews, business info, ratings, and photos. Requires Google Places API key (can use existing GOOGLE_API_KEY or separate one).
- [ ] **Rich review metadata** — upgrade metadata schema stored in Supabase JSONB to include: `reviewer_name`, `location`, `elite_status`, `rating` (stars), `photos` (count), `language`, `order_type`, `items_mentioned` (array of menu items), `sentiment` (positive/mixed/negative), `issues` (array e.g. too_salty, ingredients_not_fresh_enough), `price_mentions` (object mapping item→price), `owner_replied` (bool), `date`. Requires: (1) update ingest pipeline to accept/extract this metadata, (2) update system prompt so LLM can reference structured fields, (3) pre-processing step (LLM or regex) to extract items_mentioned/sentiment/issues/price_mentions from raw review text, (4) re-ingest existing reviews with enriched metadata.
