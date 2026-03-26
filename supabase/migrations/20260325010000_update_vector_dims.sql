-- Update vector dimensions from 768 to 3072 for gemini-embedding-001
DROP FUNCTION IF EXISTS match_reviews;
DROP INDEX IF EXISTS reviews_embedding_idx;
DROP TABLE IF EXISTS reviews;

CREATE TABLE reviews (
  id bigserial primary key,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(3072),
  created_at timestamptz default now()
);

-- No vector index needed for <1000 rows; exact scan is fast enough

CREATE OR REPLACE FUNCTION match_reviews (
  query_embedding vector(3072),
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    reviews.id,
    reviews.content,
    reviews.metadata,
    1 - (reviews.embedding <=> query_embedding) AS similarity
  FROM reviews
  WHERE reviews.metadata @> filter
  ORDER BY reviews.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
