import fs from "node:fs/promises";
import path from "node:path";
import type { Post } from "../schema";
import { renderSlideSvg, svgToPng } from "../render/render";
import { drawtextFilter, handleLine, layoutCaption, REEL } from "./captions";
import { ffmpeg, probe } from "./ffmpeg";
import { toSrt, type PlannedBeat, type ReelPlan } from "./beats";

/**
 * The cut.
 *
 * Each beat becomes its own clip — trimmed to the time in the script, framed to 1080×1920,
 * graded, with its words burned in — and then they are joined and the audio laid under.
 * Building segment by segment means a failure points at one beat rather than the whole reel,
 * and re-running after a reshoot only redoes what changed.
 */

export const FPS = 30;

export type Grade = "warm" | "neutral" | "none";

const GRADES: Record<Grade, string[]> = {
  // Warm enough for coast and road footage without turning skin orange.
  warm: ["eq=contrast=1.06:saturation=1.10:gamma=1.02:brightness=0.012", "unsharp=5:5:0.3:5:5:0.0"],
  neutral: ["eq=contrast=1.04:saturation=1.02"],
  none: [],
};

export interface BuildOptions {
  handle: string;
  grade?: Grade;
  /** burn the on-screen text into the picture (a .srt is written either way) */
  captions?: boolean;
  outDir?: string;
  keepWork?: boolean;
  onProgress?: (message: string) => void;
}

export interface BuildResult {
  video: string;
  cover: string | null;
  srt: string;
  duration: number;
  warnings: string[];
}

const FRAME = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", `fps=${FPS}`];

export function exportsDirFor(postId: string, override?: string): string {
  return override ? path.resolve(override) : path.join(process.cwd(), "exports", postId);
}

async function writeText(file: string, text: string): Promise<void> {
  await fs.writeFile(file, text, "utf8");
}

/** Caption drawtext filters for one beat, with each line's text written to its own file. */
async function captionFilters(beat: PlannedBeat, workDir: string, isHook: boolean, handle: string, withHandle: boolean): Promise<string[]> {
  const block = layoutCaption(beat.onScreen, isHook ? "hook" : "beat");
  const filters: string[] = [];
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i];
    const file = path.join(workDir, `t${String(beat.index).padStart(2, "0")}-${i}.txt`);
    await writeText(file, line.text);
    filters.push(drawtextFilter(line, file));
  }
  if (withHandle) {
    const line = handleLine(handle);
    const file = path.join(workDir, `h${String(beat.index).padStart(2, "0")}.txt`);
    await writeText(file, line.text);
    filters.push(drawtextFilter(line, file));
  }
  return filters;
}

async function buildSegment(
  beat: PlannedBeat,
  plan: ReelPlan,
  workDir: string,
  options: Required<Pick<BuildOptions, "handle" | "grade" | "captions">>,
  warnings: string[],
): Promise<string> {
  const out = path.join(workDir, `seg-${String(beat.index).padStart(2, "0")}.mp4`);
  const isHook = beat.index === 0;
  const grade = GRADES[options.grade];
  const text = options.captions ? await captionFilters(beat, workDir, isHook, options.handle, beat.index === plan.beats.length - 1) : [];
  const duration = Math.max(0.4, beat.duration);

  const input: string[] = [];
  const filters: string[] = [];

  if (beat.sourceKind === "video" && beat.source) {
    const info = await probe(beat.source);
    const available = info.duration > 0 ? info.duration - beat.clipStart : 0;
    if (available > 0 && available < duration - 0.05) {
      // Short clip: loop it rather than freezing on the last frame.
      // -stream_loop and -ss are both input options and must come before -i, in that order.
      input.push("-stream_loop", "-1");
      warnings.push(
        `Beat ${beat.index + 1}: ${available.toFixed(1)}s of clip for a ${duration.toFixed(1)}s beat, so it loops.`,
      );
    }
    if (beat.clipStart > 0) input.push("-ss", String(beat.clipStart));
    input.push("-i", beat.source, "-t", String(duration));
    filters.push(...FRAME, ...grade);
  } else if (beat.sourceKind === "image" && beat.source) {
    // A still gets a slow push so it does not read as a freeze.
    const frames = Math.round(duration * FPS);
    input.push("-loop", "1", "-i", beat.source, "-t", String(duration));
    filters.push(
      "scale=1620:2880:force_original_aspect_ratio=increase",
      "crop=1620:2880",
      `zoompan=z='min(zoom+0.0004,1.10)':d=${frames}:s=1080x1920:fps=${FPS}`,
      ...grade,
    );
  } else {
    // No footage for this beat: a brand card so the cut still plays and the gap is obvious.
    input.push("-f", "lavfi", "-i", `color=c=0x141414:s=1080x1920:r=${FPS}:d=${duration}`);
    warnings.push(`Beat ${beat.index + 1} has no clip — a placeholder card is in its place.`);
  }

  filters.push("format=yuv420p", ...text);

  await ffmpeg(
    [...input, "-vf", filters.join(","), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", String(FPS), out],
    `beat ${beat.index + 1}`,
  );
  return out;
}

/** Music under voice: the music ducks when the voice is there, and the whole thing lands at -14 LUFS. */
async function buildAudio(plan: ReelPlan, workDir: string, duration: number, warnings: string[]): Promise<string> {
  const out = path.join(workDir, "audio.m4a");
  const perBeatVoice = plan.beats.filter((beat) => beat.voiceFile);
  const hasVoice = Boolean(plan.voiceover) || perBeatVoice.length > 0;

  const inputs: string[] = [];
  const graph: string[] = [];
  let index = 0;
  let voiceLabel: string | null = null;

  if (plan.voiceover) {
    inputs.push("-i", plan.voiceover);
    graph.push(`[${index}:a]aresample=48000,apad[vo]`);
    voiceLabel = "vo";
    index += 1;
  } else if (perBeatVoice.length > 0) {
    const labels: string[] = [];
    for (const beat of perBeatVoice) {
      inputs.push("-i", beat.voiceFile!);
      const label = `v${index}`;
      graph.push(`[${index}:a]aresample=48000,adelay=${Math.round(beat.start * 1000)}|${Math.round(beat.start * 1000)}[${label}]`);
      labels.push(`[${label}]`);
      index += 1;
    }
    graph.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad[vo]`);
    voiceLabel = "vo";
  }

  if (plan.music) {
    inputs.push("-stream_loop", "-1", "-i", plan.music);
    const musicIn = `[${index}:a]`;
    index += 1;
    if (voiceLabel) {
      // The voice is needed twice — once to key the ducking, once in the mix — and a
      // filter output can only be consumed once, so it is split first.
      graph.push(`[${voiceLabel}]asplit=2[vokey][vomix]`);
      graph.push(`${musicIn}aresample=48000,volume=0.35[music]`);
      graph.push(`[music][vokey]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked]`);
      graph.push(`[ducked][vomix]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`);
    } else {
      graph.push(`${musicIn}aresample=48000,volume=0.9,loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`);
    }
  } else if (voiceLabel) {
    graph.push(`[${voiceLabel}]loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`);
  } else {
    // No audio at all: a silent track, because a reel without an audio stream can be rejected.
    inputs.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`);
    graph.push(`[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`);
    warnings.push("No music or voiceover found, so the reel is silent. Add the track in Instagram before posting.");
  }

  await ffmpeg(
    [...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", "-t", String(duration), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out],
    "audio",
  );
  return out;
}

async function buildCover(post: Post, handle: string, outDir: string): Promise<string | null> {
  const slide = post.reel?.cover;
  if (!slide) return null;
  const rendered = await renderSlideSvg(slide, { handle, index: 0, total: 1, reelCover: true });
  const png = path.join(outDir, "cover.png");
  await fs.writeFile(png, svgToPng(rendered.svg, rendered.width));
  const jpg = path.join(outDir, "cover.jpg");
  await ffmpeg(["-i", png, "-q:v", "2", jpg], "cover");
  await fs.rm(png, { force: true });
  return jpg;
}

export async function buildReel(post: Post, plan: ReelPlan, options: BuildOptions): Promise<BuildResult> {
  const say = options.onProgress ?? (() => undefined);
  const outDir = exportsDirFor(post.id, options.outDir);
  const workDir = path.join(outDir, ".work");
  await fs.mkdir(workDir, { recursive: true });

  const settings = {
    handle: options.handle,
    grade: options.grade ?? "warm",
    captions: options.captions ?? true,
  };
  const warnings: string[] = [];

  const segments: string[] = [];
  for (const beat of plan.beats) {
    say(`Cutting beat ${beat.index + 1} of ${plan.beats.length} (${beat.duration.toFixed(1)}s)`);
    segments.push(await buildSegment(beat, plan, workDir, settings, warnings));
  }

  say("Joining the beats");
  const listFile = path.join(workDir, "segments.txt");
  await writeText(listFile, segments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
  const silentVideo = path.join(workDir, "video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", silentVideo], "join");

  const info = await probe(silentVideo);
  const duration = info.duration || plan.duration;

  say("Laying the audio under it");
  const audio = await buildAudio(plan, workDir, duration, warnings);

  say("Writing the reel");
  const video = path.join(outDir, "reel.mp4");
  await ffmpeg(
    ["-i", silentVideo, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", video],
    "mux",
  );

  const cover = await buildCover(post, settings.handle, outDir);
  const srt = path.join(outDir, "captions.srt");
  await writeText(srt, toSrt(plan));

  if (!options.keepWork) await fs.rm(workDir, { recursive: true, force: true });

  if (duration > 90) warnings.push(`The cut is ${Math.round(duration)}s. These scripts are written for under 30s.`);
  return { video, cover, srt, duration, warnings };
}
