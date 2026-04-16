import { supabaseAdmin } from "@/lib/supabase";

const PAGE_SIZE = 1000;

/**
 * Stable key for deduplication: `reviewer::date` (empty string for null date).
 */
export function reviewKey(reviewer: string, date: string | null): string {
  const r = (reviewer || "").trim() || "anonymous";
  const d = date == null ? "" : String(date).trim();
  return `${r}::${d}`;
}

/**
 * Loads distinct logical-review keys from all chunk rows by scanning `metadata.reviewer` and `metadata.date`.
 */
export async function getExistingReviewKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("reviews")
      .select("metadata")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const m = row.metadata as Record<string, unknown> | null | undefined;
      if (!m || typeof m !== "object") continue;
      const reviewerRaw = m.reviewer;
      const reviewer =
        typeof reviewerRaw === "string" && reviewerRaw.trim() !== ""
          ? reviewerRaw.trim()
          : "anonymous";
      const dateVal = m.date;
      const dateStr: string | null =
        dateVal == null ? null : String(dateVal).trim() || null;
      keys.add(reviewKey(reviewer, dateStr));
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return keys;
}

export function isNewReview(
  reviewer: string,
  date: string | null,
  existingKeys: Set<string>
): boolean {
  return !existingKeys.has(reviewKey(reviewer, date));
}
