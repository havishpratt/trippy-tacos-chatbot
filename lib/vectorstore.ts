import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { supabaseAdmin } from "./supabase";

// Embedding model — text-embedding-3-small is cheap and effective
// ~$0.02 per 1M tokens, 1536 dimensions
export const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Vector store backed by Supabase pgvector
export const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabaseAdmin,
  tableName: "reviews",
  queryName: "match_reviews", // The RPC function from migration.sql
});

// Retriever — pulls top 5 most similar review chunks
export const retriever = vectorStore.asRetriever({
  k: 5,
  searchType: "similarity",
});
