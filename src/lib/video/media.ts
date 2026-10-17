import fs from "node:fs/promises";
import path from "node:path";
import { mediaDir } from "../store";
import { exportsDirFor } from "./render";
import { ffmpeg, probe } from "./ffmpeg";

/**
 * The footage folder, as the app sees it.
 *
 * Clips still live in content/media/<post-id>/ — the folder you can also just drop files
 * into — but the app can now list, upload, preview and remove them, so a reel never needs
 * a terminal.
 */

export const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".mkv", ".webm"];
export const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"];
export const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];
const ALLOWED = new Set([...VIDEO_EXT, ...IMAGE_EXT, ...AUDIO_EXT]);

export type MediaKind = "video" | "image" | "audio";

export interface MediaFile {
  name: string;
  kind: MediaKind;
  bytes: number;
  /** seconds, for video and audio */
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export function kindOf(name: string): MediaKind | null {
  const ext = path.extname(name).toLowerCase();
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return null;
}

/** Keeps an uploaded name usable as a file name, and refuses anything we cannot cut with. */
export function safeName(input: string): string | null {
  const base = path
    .basename(input)
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  if (!base || base.includes("..")) return null;
  if (!ALLOWED.has(path.extname(base).toLowerCase())) return null;
  return base;
}

export function clipsDir(postId: string): string {
  return path.join(mediaDir(), postId);
}

export function clipPath(postId: string, file: string): string | null {
  const name = safeName(file);
  if (!name) return null;
  return path.join(clipsDir(postId), name);
}

export async function listMedia(postId: string): Promise<MediaFile[]> {
  const dir = clipsDir(postId);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: MediaFile[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    if (name.startsWith(".")) continue;
    const kind = kindOf(name);
    if (!kind) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile()) continue;
    const entry: MediaFile = { name, kind, bytes: stat.size };
    if (kind !== "image") {
      const info = await probe(full);
      entry.duration = Math.round(info.duration * 10) / 10;
      if (kind === "video") {
        entry.width = info.width;
        entry.height = info.height;
        entry.hasAudio = info.hasAudio;
      }
    }
    files.push(entry);
  }
  return files;
}

export async function deleteMedia(postId: string, file: string): Promise<boolean> {
  const full = clipPath(postId, file);
  if (!full) return false;
  await fs.rm(full, { force: true });
  await fs.rm(path.join(thumbsDir(postId)), { recursive: true, force: true });
  return true;
}

function thumbsDir(postId: string): string {
  return path.join(exportsDirFor(postId), ".thumbs");
}

/**
 * A still from a clip, so a beat row shows the shot rather than a file name.
 * Cached per file and timestamp; the cache lives with the other build output.
 */
export async function thumbnail(postId: string, file: string, at = 0.5): Promise<string | null> {
  const source = clipPath(postId, file);
  if (!source) return null;
  const kind = kindOf(file);
  if (kind === "audio") return null;

  const stat = await fs.stat(source).catch(() => null);
  if (!stat) return null;

  const dir = thumbsDir(postId);
  const key = `${path.parse(file).name}-${Math.round(at * 10)}-${Math.round(stat.mtimeMs)}.jpg`;
  const out = path.join(dir, key);
  const cached = await fs
    .access(out)
    .then(() => true)
    .catch(() => false);
  if (cached) return out;

  await fs.mkdir(dir, { recursive: true });
  const args =
    kind === "image"
      ? ["-i", source, "-vf", "scale=-2:240", "-frames:v", "1", "-q:v", "4", out]
      : ["-ss", String(at), "-i", source, "-vf", "scale=-2:240", "-frames:v", "1", "-q:v", "4", out];
  try {
    await ffmpeg(args, "thumbnail");
  } catch {
    return null;
  }
  return out;
}
