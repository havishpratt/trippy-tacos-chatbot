import type { Document } from "@langchain/core/documents";
import { vectorStore } from "@/lib/vectorstore";

export const VECTOR_STORE_BATCH_SIZE = 20;

export type SyncLogLabel = "Google sync" | "Yelp sync";

function formatErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Persists review chunks in fixed-size batches; on batch failure, retries one document at a time.
 * Returns how many chunks were successfully stored.
 */
export async function storeReviewChunksInBatches(
  docs: Document[],
  label: SyncLogLabel
): Promise<number> {
  let storedCount = 0;
  const n = docs.length;
  for (let i = 0; i < n; i += VECTOR_STORE_BATCH_SIZE) {
    const batch = docs.slice(i, i + VECTOR_STORE_BATCH_SIZE);
    const batchNum = Math.floor(i / VECTOR_STORE_BATCH_SIZE) + 1;
    try {
      await vectorStore.addDocuments(batch);
      storedCount += batch.length;
    } catch (batchErr) {
      console.error(
        `${label}: vector store batch ${batchNum} failed (${batch.length} chunks): ${formatErr(batchErr)}. Retrying one chunk at a time.`
      );
      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        try {
          await vectorStore.addDocuments([doc]);
          storedCount++;
        } catch (docErr) {
          const meta = doc.metadata as Record<string, unknown> | undefined;
          const reviewer =
            meta && typeof meta.reviewer === "string"
              ? meta.reviewer
              : "unknown";
          const preview = doc.pageContent?.slice(0, 80) ?? "";
          const suffix = preview.length >= 80 ? "…" : "";
          console.error(
            `${label}: skipped chunk (batch ${batchNum}, ${j + 1}/${batch.length}, reviewer "${reviewer}"): ${formatErr(docErr)} preview="${preview}${suffix}"`
          );
        }
      }
    }
  }
  return storedCount;
}
