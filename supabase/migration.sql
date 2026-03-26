-- Enable the pgvector extension (run once)
create extension if not exists vector with schema extensions;

-- Reviews table with vector embeddings
create table if not exists reviews (
  id bigserial primary key,
  content text not null,                    -- The review text chunk
  metadata jsonb default '{}'::jsonb,       -- Source, rating, date, reviewer, etc.
  embedding vector(1536),                   -- OpenAI text-embedding-3-small dimension
  created_at timestamptz default now()
);

-- Index for fast similarity search
create index on reviews using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC function: match reviews by cosine similarity
create or replace function match_reviews (
  query_embedding vector(1536),
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    reviews.id,
    reviews.content,
    reviews.metadata,
    1 - (reviews.embedding <=> query_embedding) as similarity
  from reviews
  where reviews.metadata @> filter
  order by reviews.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Optional: chat history table for V2
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
