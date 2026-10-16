import { instagramConfig, redact, type InstagramConfig } from "./config";

/**
 * A small typed client for the bits of the Instagram API this app uses: create a media
 * container, wait for it to finish, publish it, and read insights back.
 *
 * Every response goes through `redact` before it can reach an error message.
 */

export class InstagramApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  type?: string;
  constructor(message: string, status: number, details: { code?: number; subcode?: number; type?: string } = {}) {
    super(redact(message));
    this.name = "InstagramApiError";
    this.status = status;
    this.code = details.code;
    this.subcode = details.subcode;
    this.type = details.type;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

async function call<T>(config: InstagramConfig, method: "GET" | "POST", path: string, params: Params): Promise<T> {
  const url = new URL(`https://${config.host}/${config.version}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (method === "GET") url.searchParams.set(key, String(value));
    else body.set(key, String(value));
  }
  if (method === "GET") url.searchParams.set("access_token", config.token);
  else body.set("access_token", config.token);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      body: method === "POST" ? body : undefined,
      headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throw new InstagramApiError(`Could not reach ${config.host}: ${error instanceof Error ? error.message : "network error"}`, 0);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InstagramApiError(`Unexpected reply from ${config.host}: ${text.slice(0, 200)}`, response.status);
  }

  const error = (data as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } }).error;
  if (error) {
    throw new InstagramApiError(error.message ?? "The API refused that", response.status, {
      code: error.code,
      subcode: error.error_subcode,
      type: error.type,
    });
  }
  if (!response.ok) throw new InstagramApiError(`${response.status} from ${config.host}`, response.status);
  return data as T;
}

export interface Account {
  id: string;
  username?: string;
  followers_count?: number;
  media_count?: number;
  profile_picture_url?: string;
}

export async function getAccount(config = instagramConfig()): Promise<Account> {
  return call<Account>(config, "GET", config.accountId, {
    fields: "id,username,followers_count,media_count,profile_picture_url",
  });
}

export interface PublishingLimit {
  quota_usage: number;
  config?: { quota_total?: number; quota_duration?: number };
}

/** How many of the day's API posts are already spent. */
export async function getPublishingLimit(config = instagramConfig()): Promise<PublishingLimit | null> {
  try {
    const data = await call<{ data?: PublishingLimit[] }>(config, "GET", `${config.accountId}/content_publishing_limit`, {
      fields: "config,quota_usage",
    });
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function createImageContainer(
  options: { imageUrl: string; caption?: string; isCarouselItem?: boolean; altText?: string },
  config = instagramConfig(),
): Promise<string> {
  const data = await call<{ id: string }>(config, "POST", `${config.accountId}/media`, {
    image_url: options.imageUrl,
    caption: options.caption,
    is_carousel_item: options.isCarouselItem ? true : undefined,
    alt_text: options.altText,
  });
  return data.id;
}

export async function createCarouselContainer(
  options: { children: string[]; caption?: string },
  config = instagramConfig(),
): Promise<string> {
  const data = await call<{ id: string }>(config, "POST", `${config.accountId}/media`, {
    media_type: "CAROUSEL",
    children: options.children.join(","),
    caption: options.caption,
  });
  return data.id;
}

export async function createReelContainer(
  options: { videoUrl: string; caption?: string; coverUrl?: string; shareToFeed?: boolean },
  config = instagramConfig(),
): Promise<string> {
  const data = await call<{ id: string }>(config, "POST", `${config.accountId}/media`, {
    media_type: "REELS",
    video_url: options.videoUrl,
    caption: options.caption,
    cover_url: options.coverUrl,
    share_to_feed: options.shareToFeed === undefined ? undefined : options.shareToFeed,
  });
  return data.id;
}

export type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export async function containerStatus(
  id: string,
  config = instagramConfig(),
): Promise<{ status_code: ContainerStatus; status?: string }> {
  return call<{ status_code: ContainerStatus; status?: string }>(config, "GET", id, { fields: "status_code,status" });
}

/**
 * Video containers are processed asynchronously. Meta's guidance is to check about once a
 * minute for no more than five; this polls a little faster at the start because a carousel
 * image is usually ready within seconds.
 */
export async function waitForContainer(
  id: string,
  options: { timeoutMs?: number; onTick?: (status: ContainerStatus, waitedMs: number) => void } = {},
  config = instagramConfig(),
): Promise<void> {
  const timeout = options.timeoutMs ?? 5 * 60 * 1000;
  const started = Date.now();
  let delay = 2000;
  for (;;) {
    const { status_code: status } = await containerStatus(id, config);
    options.onTick?.(status, Date.now() - started);
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR") throw new InstagramApiError(`Instagram could not process that media (container ${id})`, 400);
    if (status === "EXPIRED") throw new InstagramApiError(`The container expired before it was published (${id})`, 400);
    if (Date.now() - started > timeout) throw new InstagramApiError(`Still processing after ${Math.round(timeout / 1000)}s`, 504);
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.6, 20000);
  }
}

export async function publishContainer(creationId: string, config = instagramConfig()): Promise<string> {
  const data = await call<{ id: string }>(config, "POST", `${config.accountId}/media_publish`, { creation_id: creationId });
  return data.id;
}

export interface MediaInfo {
  id: string;
  permalink?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  caption?: string;
}

export async function getMedia(id: string, config = instagramConfig()): Promise<MediaInfo> {
  return call<MediaInfo>(config, "GET", id, { fields: "id,permalink,media_type,media_product_type,timestamp" });
}

export async function recentMedia(limit = 50, config = instagramConfig()): Promise<MediaInfo[]> {
  const data = await call<{ data?: MediaInfo[] }>(config, "GET", `${config.accountId}/media`, {
    fields: "id,permalink,media_type,media_product_type,timestamp,caption",
    limit,
  });
  return data.data ?? [];
}

export interface InsightValue {
  name: string;
  values?: { value?: number }[];
  total_value?: { value?: number };
}

/**
 * Metrics move: some are in development, some were deprecated (impressions, for media made
 * after July 2024). So the whole set is asked for first, and on a refusal each metric is
 * tried on its own — whatever the account actually supports comes back, instead of nothing.
 */
export async function mediaInsights(id: string, metrics: string[], config = instagramConfig()): Promise<Record<string, number>> {
  const read = (data: { data?: InsightValue[] }): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const entry of data.data ?? []) {
      const value = entry.total_value?.value ?? entry.values?.[0]?.value;
      if (typeof value === "number") out[entry.name] = value;
    }
    return out;
  };

  try {
    return read(await call<{ data?: InsightValue[] }>(config, "GET", `${id}/insights`, { metric: metrics.join(",") }));
  } catch {
    const out: Record<string, number> = {};
    for (const metric of metrics) {
      try {
        Object.assign(out, read(await call<{ data?: InsightValue[] }>(config, "GET", `${id}/insights`, { metric })));
      } catch {
        // This account or media type does not support that metric; skip it.
      }
    }
    return out;
  }
}

export const FEED_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "profile_visits", "follows", "total_interactions"];
export const REEL_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "ig_reels_avg_watch_time", "total_interactions"];
