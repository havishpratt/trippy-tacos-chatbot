# Plan: Fix RAG Chunk Quality for Better Citations

## Context
Reviews are chunked at 500 chars — most get split, losing reviewer attribution and full context. The chatbot can't cite specific reviews because chunks are fragments. Analysis shows: max review is 1925 chars, 87/89 are under 1500, avg is 452. A 2000 chunk size keeps every review intact.

## Changes

### 1. Increase chunk size in `app/api/ingest/route.ts`
- Change `chunkSize: 500` → `chunkSize: 2000`
- Change `chunkOverlap: 50` → `chunkOverlap: 200`
- Prepend `[Review by {reviewer} on {date}]` to each review text before chunking so every chunk is self-contained and citable

### 2. Increase retriever k in `lib/vectorstore.ts`
- Change `k: 5` → `k: 10`
- More reviews in context = better synthesis and ability to cite

### 3. Clear and re-ingest reviews in Supabase
- Delete all existing rows from `reviews` table (the 132 old chunks)
- Re-ingest from `yelp-reviews.json` with new chunk settings
- Expected result: ~89 chunks (most reviews stay whole) instead of 132 fragments

### 4. Update CLAUDE.md
- Update chunk size reference from 500/50 to 2000/200
- Update retriever k from 5 to 10

## Files to Modify
| File | Change |
|------|--------|
| `app/api/ingest/route.ts` | Chunk size 2000/200, prepend reviewer tag |
| `lib/vectorstore.ts` | `k: 5` → `k: 10` |
| `CLAUDE.md` | Update chunk size and k references |

## Verification
1. Clear `reviews` table: `DELETE FROM reviews;`
2. Re-ingest: `curl -X POST http://localhost:3000/api/ingest -H "Content-Type: application/json" -d @yelp-reviews.json`
3. Verify ~89 chunks stored (not 132)
4. Ask "what do customers think about the birria tacos" — debug log should show full reviews with reviewer names
5. Ask chatbot to cite specific reviews — should now be able to reference "Review by X on Y"
