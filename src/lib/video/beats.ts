import fs from "node:fs";
import path from "node:path";
import type { Beat, Post } from "../schema";
import { mediaDir } from "../store";

/**
 * Turning a written script into an edit plan.
 *
 * The script in a post is the thing you reviewed: timed beats, the words on screen, the
 * voiceover. This reads those times, finds a clip for each beat, and hands the renderer
 * a plan it can cut without guessing.
 */

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);

export interface BeatTiming {
  start: number;
  end: number;
  duration: number;
}

/**
 * Reads the time column of a script. Handles "0–3 s", "3-8 s", "0:03–0:08" and "8 s",
 * because a script is written for a person first.
 */
export function parseBeatTime(value: string, fallbackStart: number, fallbackDuration = 4): BeatTiming {
  const cleaned = value.replace(/–|—|to/g, "-").replace(/[^\d:.\-]/g, " ").trim();
  const parts = cleaned
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  const toSeconds = (token: string): number | null => {
    if (!token) return null;
    if (token.includes(":")) {
      const [m, s] = token.split(":").map(Number);
      if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
      return null;
    }
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  };

  if (parts.length >= 2) {
    const start = toSeconds(parts[0]);
    const end = toSeconds(parts[1]);
    if (start !== null && end !== null && end > start) return { start, end, duration: end - start };
  }
  if (parts.length === 1) {
    const only = toSeconds(parts[0]);
    if (only !== null) return { start: fallbackStart, end: fallbackStart + only, duration: only };
  }
  return { start: fallbackStart, end: fallbackStart + fallbackDuration, duration: fallbackDuration };
}

export interface PlannedBeat extends BeatTiming {
  index: number;
  onScreen: string;
  voiceover: string;
  shot?: string;
  /** absolute path to the clip or still for this beat, when one was found */
  source: string | null;
  sourceKind: "video" | "image" | "missing";
  /** per-beat voiceover file, if you recorded them separately */
  voiceFile: string | null;
}

export interface ReelPlan {
  postId: string;
  clipsDir: string;
  beats: PlannedBeat[];
  duration: number;
  music: string | null;
  voiceover: string | null;
  missing: number[];
  /** files in the folder nothing claimed */
  unused: string[];
}

function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => !name.startsWith("."))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  } catch {
    return [];
  }
}

/** Clips belong to a post: content/media/<post-id>/. */
export function clipsDirFor(postId: string, override?: string): string {
  return override ? path.resolve(override) : path.join(mediaDir(), postId);
}

/**
 * Matching clips to beats. A file that starts with a beat number ("03-paddle.mp4") goes
 * to that beat; everything else fills the remaining beats in order. Name them if you can —
 * it makes the cut predictable when you reshoot one shot.
 */
export function planReel(post: Post, options: { clipsDir?: string; music?: string } = {}): ReelPlan {
  const dir = clipsDirFor(post.id, options.clipsDir);
  const files = listFiles(dir);

  const media = files.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()) || IMAGE_EXT.has(path.extname(f).toLowerCase()));
  const audio = files.filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()));

  const music =
    options.music ??
    (audio.find((f) => /music|track|bgm|song/i.test(f)) ? path.join(dir, audio.find((f) => /music|track|bgm|song/i.test(f))!) : null);
  const voiceover = audio.find((f) => /voice|vo\b|narration/i.test(f) && !/^vo-?\d/i.test(f));

  const beats = post.reel?.beats ?? [];
  const claimed = new Set<string>();
  const byNumber = new Map<number, string>();
  for (const file of media) {
    const match = /^(\d{1,2})[^\d]/.exec(file);
    if (match) {
      const n = Number(match[1]);
      if (n >= 1 && n <= beats.length && !byNumber.has(n)) byNumber.set(n, file);
    }
  }

  const pool = media.filter((f) => ![...byNumber.values()].includes(f));
  let poolIndex = 0;

  let cursor = 0;
  const planned: PlannedBeat[] = beats.map((beat: Beat, index) => {
    const timing = parseBeatTime(beat.time, cursor);
    cursor = timing.end;

    const explicit = typeof (beat as { clip?: unknown }).clip === "string" ? ((beat as { clip?: string }).clip as string) : undefined;
    let file: string | undefined = explicit && files.includes(explicit) ? explicit : byNumber.get(index + 1);
    if (!file) {
      while (poolIndex < pool.length && claimed.has(pool[poolIndex])) poolIndex += 1;
      file = pool[poolIndex];
      if (file) poolIndex += 1;
    }
    if (file) claimed.add(file);

    const perBeatVoice = files.find((f) => new RegExp(`^vo-?0?${index + 1}\\.`, "i").test(f));
    const ext = file ? path.extname(file).toLowerCase() : "";

    return {
      index,
      ...timing,
      onScreen: beat.onScreen ?? "",
      voiceover: beat.voiceover ?? "",
      shot: beat.shot,
      source: file ? path.join(dir, file) : null,
      sourceKind: file ? (VIDEO_EXT.has(ext) ? "video" : "image") : "missing",
      voiceFile: perBeatVoice ? path.join(dir, perBeatVoice) : null,
    };
  });

  const used = new Set(planned.map((b) => b.source).filter(Boolean) as string[]);
  const unused = media.map((f) => path.join(dir, f)).filter((f) => !used.has(f));

  return {
    postId: post.id,
    clipsDir: dir,
    beats: planned,
    duration: planned.reduce((total, beat) => Math.max(total, beat.end), 0),
    music,
    voiceover: voiceover ? path.join(dir, voiceover) : null,
    missing: planned.filter((b) => b.sourceKind === "missing").map((b) => b.index),
    unused,
  };
}

/** A .srt beside the video, for anyone who wants captions as a file rather than burned in. */
export function toSrt(plan: ReelPlan): string {
  const stamp = (seconds: number): string => {
    const ms = Math.round((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s},${String(ms).padStart(3, "0")}`;
  };
  return plan.beats
    .filter((beat) => beat.onScreen.trim())
    .map((beat, i) => `${i + 1}\n${stamp(beat.start)} --> ${stamp(beat.end)}\n${beat.onScreen.trim()}\n`)
    .join("\n");
}
