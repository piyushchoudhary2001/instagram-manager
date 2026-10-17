import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ConfigSchema, PostSchema, type Config, type Post } from "./schema";

/**
 * The content store is a folder of JSON files, one per post, tracked in git.
 * Claude edits the files directly; the app reads and writes the same files.
 * Every write is atomic (temp file + rename) and guarded by an etag so the app
 * never silently overwrites an edit made outside it.
 */

export const contentDir = (): string => process.env.CONTENT_DIR ?? path.join(process.cwd(), "content");
export const postsDir = (): string => path.join(contentDir(), "posts");
export const mediaDir = (): string => path.join(contentDir(), "media");
const configPath = (): string => path.join(contentDir(), "config.json");

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`No post with id "${id}"`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  latest: StoredPost;
  constructor(latest: StoredPost) {
    super("This post changed on disk since you loaded it");
    this.name = "ConflictError";
    this.latest = latest;
  }
}

export interface StoredPost {
  post: Post;
  etag: string;
  path: string;
}

export function etagOf(raw: string): string {
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

/** Hash of the fields a human actually approves. Changing any of them invalidates an approval. */
export function contentHash(post: Post): string {
  const deliverable = {
    slides: post.slides,
    caption: post.caption,
    hashtags: post.hashtags,
    altText: post.altText ?? "",
    reel: post.reel ?? null,
    format: post.format,
  };
  return createHash("sha256").update(JSON.stringify(deliverable)).digest("hex").slice(0, 16);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(postsDir(), { recursive: true });
  await fs.mkdir(mediaDir(), { recursive: true });
}

function fileFor(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(id)) throw new Error(`Invalid post id: ${id}`);
  return path.join(postsDir(), `${id}.json`);
}

export function serialize(post: Post): string {
  return `${JSON.stringify(post, null, 2)}\n`;
}

async function writeAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
}

export async function readConfig(): Promise<Config> {
  const raw = await fs.readFile(configPath(), "utf8");
  return ConfigSchema.parse(JSON.parse(raw));
}

export async function writeConfig(config: Config): Promise<void> {
  await ensureDirs();
  await writeAtomic(configPath(), `${JSON.stringify(config, null, 2)}\n`);
}

export async function listPostFiles(): Promise<string[]> {
  await ensureDirs();
  const names = await fs.readdir(postsDir());
  return names.filter((n) => n.endsWith(".json") && !n.endsWith(".tmp")).sort();
}

/** Read one post. Throws NotFoundError if the file is gone. */
export async function getPost(id: string): Promise<StoredPost> {
  const file = fileFor(id);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new NotFoundError(id);
  }
  const post = PostSchema.parse(JSON.parse(raw));
  return { post, etag: etagOf(raw), path: file };
}

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult {
  posts: StoredPost[];
  issues: LoadIssue[];
}

/** Read every post. Files that fail to parse are reported, not thrown — one bad file shouldn't blank the calendar. */
export async function listPosts(): Promise<LoadResult> {
  const files = await listPostFiles();
  const posts: StoredPost[] = [];
  const issues: LoadIssue[] = [];
  for (const name of files) {
    const file = path.join(postsDir(), name);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = PostSchema.parse(JSON.parse(raw));
      if (`${parsed.id}.json` !== name) {
        issues.push({ file: name, message: `id "${parsed.id}" does not match the file name` });
      }
      posts.push({ post: parsed, etag: etagOf(raw), path: file });
    } catch (error) {
      issues.push({ file: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  posts.sort((a, b) => {
    const da = a.post.date ?? "9999-99-99";
    const db = b.post.date ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return a.post.id < b.post.id ? -1 : 1;
  });
  return { posts, issues };
}

export async function createPost(post: Post): Promise<StoredPost> {
  await ensureDirs();
  const file = fileFor(post.id);
  const exists = await fs
    .access(file)
    .then(() => true)
    .catch(() => false);
  if (exists) throw new Error(`A post with id "${post.id}" already exists`);
  const now = new Date().toISOString();
  const withStamps: Post = { ...post, createdAt: post.createdAt ?? now, updatedAt: now };
  const raw = serialize(withStamps);
  await writeAtomic(file, raw);
  return { post: withStamps, etag: etagOf(raw), path: file };
}

/**
 * Write a post. `ifMatch` is the etag the caller last saw: when it no longer matches
 * the file on disk the write is refused and the latest version is handed back.
 */
export async function savePost(post: Post, ifMatch?: string): Promise<StoredPost> {
  await ensureDirs();
  const file = fileFor(post.id);
  let current: StoredPost | null = null;
  try {
    current = await getPost(post.id);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  if (current && ifMatch && current.etag !== ifMatch) throw new ConflictError(current);
  if (!current) return createPost(post);
  const withStamps: Post = { ...post, createdAt: current.post.createdAt ?? post.createdAt, updatedAt: new Date().toISOString() };
  const raw = serialize(withStamps);
  await writeAtomic(file, raw);
  return { post: withStamps, etag: etagOf(raw), path: file };
}

export async function deletePost(id: string): Promise<void> {
  await fs.rm(fileFor(id), { force: true });
}

export function addHistory(post: Post, by: "claude" | "you" | "system", action: string, note?: string): Post {
  const entry = { at: new Date().toISOString(), by, action, ...(note ? { note } : {}) };
  return { ...post, history: [...post.history, entry].slice(-80) };
}

/**
 * Resolve a media reference ("content/media/x.jpg", "media/x.jpg" or "x.jpg") to an absolute path.
 * The turbopackIgnore comments keep the bundler from tracing the whole project because of these joins.
 */
export function resolveMedia(ref: string, postId?: string): string[] {
  const cleaned = ref.replace(/^\.?\//, "");
  if (path.isAbsolute(ref)) return [ref];
  if (cleaned.startsWith("content/media/")) return [path.join(/* turbopackIgnore: true */ contentDir(), cleaned.slice("content/".length))];
  if (cleaned.startsWith("media/")) return [path.join(/* turbopackIgnore: true */ contentDir(), cleaned)];
  // A bare name belongs to the post's own folder; the flat folder is the older layout.
  const candidates: string[] = [];
  if (postId) candidates.push(path.join(/* turbopackIgnore: true */ mediaDir(), postId, cleaned));
  candidates.push(path.join(/* turbopackIgnore: true */ mediaDir(), cleaned));
  return candidates;
}
