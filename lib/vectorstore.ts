import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { supabaseAdmin } from "./supabase";

// Embedding model — Google gemini-embedding-001, 3072 dimensions
export const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "gemini-embedding-001",
  apiKey: process.env.GOOGLE_API_KEY,
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
