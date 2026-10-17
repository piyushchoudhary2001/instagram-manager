import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Thin wrapper around the ffmpeg CLI — the pipeline shells out rather than binding a library. */

export class FfmpegMissingError extends Error {
  constructor() {
    super(
      "ffmpeg is not on your PATH. macOS: brew install ffmpeg. Ubuntu: sudo apt install ffmpeg. Windows: winget install Gyan.FFmpeg.",
    );
    this.name = "FfmpegMissingError";
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"], { maxBuffer: 1 << 20 });
    return true;
  } catch {
    return false;
  }
}

export async function ffmpeg(args: string[], label = "ffmpeg"): Promise<void> {
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 24 });
  } catch (error) {
    const err = error as { code?: string; stderr?: string };
    if (err.code === "ENOENT") throw new FfmpegMissingError();
    const tail = (err.stderr ?? "").trim().split("\n").slice(-6).join("\n");
    throw new Error(`${label} failed:\n${tail}`);
  }
}

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  fps: number;
}

export async function probe(file: string): Promise<ProbeResult> {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { maxBuffer: 1 << 24 },
    );
    const data = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string; duration?: string }[];
    };
    const streams = data.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    const [num, den] = (video?.r_frame_rate ?? "30/1").split("/").map(Number);
    return {
      duration: Number(data.format?.duration ?? video?.duration ?? 0),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      hasAudio: streams.some((s) => s.codec_type === "audio"),
      fps: den ? num / den : 30,
    };
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === "ENOENT") throw new FfmpegMissingError();
    return { duration: 0, width: 0, height: 0, hasAudio: false, fps: 30 };
  }
}

/**
 * What this particular ffmpeg can actually do.
 *
 * Builds vary a lot: some ship without libfreetype (no drawtext), some are compiled
 * LGPL-only (no eq, no unsharp, no libx264). Rather than failing halfway through a cut
 * with "No such filter", the pipeline asks first and either degrades or says plainly
 * what to install.
 */
export interface Capabilities {
  filters: Set<string>;
  encoders: Set<string>;
}

let cached: Capabilities | null = null;

export async function capabilities(): Promise<Capabilities> {
  if (cached) return cached;
  const read = async (flag: string): Promise<Set<string>> => {
    try {
      const { stdout } = await run("ffmpeg", ["-hide_banner", flag], { maxBuffer: 1 << 24 });
      const names = new Set<string>();
      for (const line of stdout.split("\n")) {
        // " T.C drawtext        V->V  Draw text…"  /  " V....D libx264  …"
        const match = /^\s*[A-Z.]{3,6}\s+(\S+)/.exec(line);
        if (match) names.add(match[1]);
      }
      return names;
    } catch {
      return new Set<string>();
    }
  };
  cached = { filters: await read("-filters"), encoders: await read("-encoders") };
  return cached;
}

export function resetCapabilities(): void {
  cached = null;
}
