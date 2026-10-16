import { todayIn } from "../dates";
import type { Post } from "../schema";
import { addHistory, listPosts, readConfig, savePost, writeConfig } from "../store";
import { FEED_METRICS, REEL_METRICS, getAccount, mediaInsights, recentMedia } from "./client";
import { instagramConfig } from "./config";

/**
 * Pulling the numbers back in.
 *
 * The Sunday review is five numbers per post. This writes them into each post's own file,
 * so what a post was and how it did sit in the same place, and a pattern across three weeks
 * is something you can actually read.
 */

export interface PostInsights {
  fetchedAt: string;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  profile_visits?: number;
  follows?: number;
  total_interactions?: number;
  ig_reels_avg_watch_time?: number;
  [metric: string]: number | string | undefined;
}

export interface SyncResult {
  updated: { id: string; metrics: number }[];
  matched: { id: string; mediaId: string }[];
  skipped: { id: string; why: string }[];
  followers?: number;
}

/** Match a permalink to its media id, so posts you published by hand get their numbers too. */
function normalisePermalink(url: string): string {
  return url.replace(/\?.*$/, "").replace(/\/$/, "").toLowerCase();
}

export async function syncInsights(options: { onProgress?: (message: string) => void } = {}): Promise<SyncResult> {
  const say = options.onProgress ?? (() => undefined);
  const config = instagramConfig();
  const result: SyncResult = { updated: [], matched: [], skipped: [] };

  say("Reading the account");
  const account = await getAccount(config);
  if (typeof account.followers_count === "number") {
    result.followers = account.followers_count;
    const appConfig = await readConfig();
    if (appConfig.goal) {
      await writeConfig({
        ...appConfig,
        goal: { ...appConfig.goal, current: account.followers_count, currentAsOf: todayIn(appConfig.timezone) },
      });
    }
  }

  const { posts } = await listPosts();
  const posted = posts.filter(({ post }) => post.status === "posted");
  if (posted.length === 0) return result;

  const needsMatch = posted.filter(({ post }) => !post.published?.mediaId && post.published?.permalink);
  let library: Awaited<ReturnType<typeof recentMedia>> = [];
  if (needsMatch.length > 0) {
    say("Looking up media you posted by hand");
    library = await recentMedia(50, config);
  }

  for (const stored of posted) {
    const post = stored.post;
    let mediaId = post.published?.mediaId;

    if (!mediaId && post.published?.permalink) {
      const wanted = normalisePermalink(post.published.permalink);
      const match = library.find((media) => media.permalink && normalisePermalink(media.permalink) === wanted);
      if (match) {
        mediaId = match.id;
        result.matched.push({ id: post.id, mediaId });
      }
    }

    if (!mediaId) {
      result.skipped.push({ id: post.id, why: "no media id and no permalink to match it by" });
      continue;
    }

    say(`Fetching insights for ${post.id}`);
    const metrics = await mediaInsights(mediaId, post.format === "reel" ? REEL_METRICS : FEED_METRICS, config);
    if (Object.keys(metrics).length === 0) {
      result.skipped.push({ id: post.id, why: "Instagram returned no metrics for it yet" });
      continue;
    }

    const insights: PostInsights = { fetchedAt: new Date().toISOString(), ...metrics };
    const next: Post = {
      ...post,
      published: { ...(post.published ?? { postedAt: new Date().toISOString() }), mediaId, insights },
    };
    await savePost(addHistory(next, "system", "insights updated", summarise(metrics)), stored.etag);
    result.updated.push({ id: post.id, metrics: Object.keys(metrics).length });
  }

  return result;
}

export function summarise(metrics: Record<string, number>): string {
  const parts: string[] = [];
  if (metrics.saved !== undefined) parts.push(`${metrics.saved} saves`);
  if (metrics.shares !== undefined) parts.push(`${metrics.shares} shares`);
  if (metrics.reach !== undefined) parts.push(`reach ${metrics.reach}`);
  if (metrics.follows !== undefined) parts.push(`${metrics.follows} follows`);
  return parts.join(" · ") || `${Object.keys(metrics).length} metrics`;
}
