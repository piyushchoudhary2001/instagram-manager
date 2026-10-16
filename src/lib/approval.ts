import { addHistory, contentHash, savePost, type StoredPost } from "./store";
import type { Post } from "./schema";

/**
 * An approval is a signature over the slides, caption, hashtags, alt text and reel script.
 * If any of them change afterwards — Claude edits the JSON, you tweak a line — the signature
 * no longer matches and the post drops back to review. Nothing goes out that you did not see.
 */

export function approvalStale(post: Post): boolean {
  if (!post.approval) return false;
  if (post.status !== "approved" && post.status !== "scheduled") return false;
  return post.approval.contentHash !== contentHash(post);
}

export async function reconcileApproval(stored: StoredPost): Promise<StoredPost> {
  if (!approvalStale(stored.post)) return stored;
  const reverted: Post = {
    ...addHistory(
      stored.post,
      "system",
      "approval reset",
      "The content changed after it was approved, so it came back for review.",
    ),
    status: "in_review",
    approval: null,
  };
  try {
    return await savePost(reverted, stored.etag);
  } catch {
    // Someone else is mid-write; the next read will reconcile.
    return { ...stored, post: reverted };
  }
}

export async function reconcileAll(list: StoredPost[]): Promise<StoredPost[]> {
  const out: StoredPost[] = [];
  for (const stored of list) out.push(await reconcileApproval(stored));
  return out;
}

export function signApproval(post: Post, by = "you"): Post {
  return {
    ...post,
    approval: { approvedAt: new Date().toISOString(), approvedBy: by, contentHash: contentHash(post) },
  };
}
