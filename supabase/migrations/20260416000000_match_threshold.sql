drop function if exists match_reviews(vector(3072), integer, jsonb);

create or replace function match_reviews (
  query_embedding vector(3072),
  match_count int default 5,
  filter jsonb default '{}'::jsonb,
  match_threshold float default 0.0
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language plpgsql as $$
begin
  return query
  select reviews.id, reviews.content, reviews.metadata,
         1 - (reviews.embedding <=> query_embedding) as similarity
  from reviews
  where reviews.metadata @> filter
    and 1 - (reviews.embedding <=> query_embedding) >= match_threshold
  order by reviews.embedding <=> query_embedding
  limit match_count;
end;
$$;
