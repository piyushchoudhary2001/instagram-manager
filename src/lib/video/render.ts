import fs from "node:fs/promises";
import path from "node:path";
import type { Post } from "../schema";
import { renderSlideSvg, svgToPng } from "../render/render";
import { captionOverlayPng } from "./captions";
import { capabilities, ffmpeg, probe } from "./ffmpeg";
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

/**
 * Writes the caption layer for one beat as a transparent PNG, or null when the beat has
 * no words. Rendered by the slide engine, so the type matches the carousels exactly.
 */
async function captionLayer(
  beat: PlannedBeat,
  workDir: string,
  isHook: boolean,
  handle: string,
  withHandle: boolean,
  warnings: string[],
): Promise<string | null> {
  const overlay = await captionOverlayPng({
    text: beat.onScreen,
    style: isHook ? "hook" : "beat",
    handle: withHandle ? handle : undefined,
  });
  if (!overlay) return null;
  if (overlay.overflow) warnings.push(`Beat ${beat.index + 1}: the words on screen are long, so they are set small.`);
  const file = path.join(workDir, `cap-${String(beat.index).padStart(2, "0")}.png`);
  await fs.writeFile(file, overlay.png);
  return file;
}


/**
 * Which encoders this ffmpeg actually has. Instagram needs H.264 and AAC, so if neither is
 * present the build stops with something you can act on rather than a wall of ffmpeg output.
 */
interface Encoders {
  video: { codec: string; args: string[] };
  audio: { codec: string; args: string[] };
}

let encoderChoice: Encoders | null = null;

async function encoders(): Promise<Encoders> {
  if (encoderChoice) return encoderChoice;
  const caps = await capabilities();

  let video: Encoders["video"] | null = null;
  if (caps.encoders.has("libx264")) video = { codec: "libx264", args: ["-preset", "veryfast", "-crf", "18"] };
  else if (caps.encoders.has("h264_videotoolbox")) video = { codec: "h264_videotoolbox", args: ["-b:v", "8M"] };
  else if (caps.encoders.has("libopenh264")) video = { codec: "libopenh264", args: ["-b:v", "8M"] };
  if (!video) {
    throw new Error(
      "This ffmpeg has no H.264 encoder, which Instagram needs. Install a full build: macOS `brew install ffmpeg`, Ubuntu `sudo apt install ffmpeg`, Windows `winget install Gyan.FFmpeg`.",
    );
  }

  let audio: Encoders["audio"] | null = null;
  if (caps.encoders.has("aac")) audio = { codec: "aac", args: [] };
  else if (caps.encoders.has("aac_at")) audio = { codec: "aac_at", args: [] };
  else if (caps.encoders.has("libfdk_aac")) audio = { codec: "libfdk_aac", args: [] };
  if (!audio) throw new Error("This ffmpeg has no AAC encoder. Install a full ffmpeg build.");

  encoderChoice = { video, audio };
  return encoderChoice;
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
  const caps = await capabilities();
  const grade = GRADES[options.grade].filter((filter) => caps.filters.has(filter.split("=")[0]));
  const duration = Math.max(0.4, beat.duration);
  const overlay = options.captions
    ? await captionLayer(beat, workDir, isHook, options.handle, beat.index === plan.beats.length - 1, warnings)
    : null;

  const input: string[] = [];
  const chain: string[] = [];

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
    input.push("-i", beat.source);
    chain.push(...FRAME, ...grade);
  } else if (beat.sourceKind === "image" && beat.source) {
    input.push("-loop", "1", "-i", beat.source);
    if (caps.filters.has("zoompan")) {
      // A still gets a slow push so it does not read as a freeze.
      const frames = Math.round(duration * FPS);
      chain.push(
        "scale=1620:2880:force_original_aspect_ratio=increase",
        "crop=1620:2880",
        `zoompan=z='min(zoom+0.0004,1.10)':d=${frames}:s=1080x1920:fps=${FPS}`,
        ...grade,
      );
    } else {
      chain.push(...FRAME, ...grade);
    }
  } else {
    // No footage for this beat: a brand card so the cut still plays and the gap is obvious.
    input.push("-f", "lavfi", "-i", `color=c=0x141414:s=1080x1920:r=${FPS}`);
    chain.push(`fps=${FPS}`);
    warnings.push(`Beat ${beat.index + 1} has no clip — a placeholder card is in its place.`);
  }

  const args: string[] = [...input];
  if (overlay) {
    // The caption is a second input, composited on top — no drawtext, so no dependency on
    // an ffmpeg built with libfreetype.
    args.push("-loop", "1", "-i", overlay);
    const graph = `[0:v]${[...chain, "format=yuv420p"].join(",")}[base];[base][1:v]overlay=0:0:format=auto[ovl];[ovl]format=yuv420p[vout]`;
    args.push("-filter_complex", graph, "-map", "[vout]");
  } else {
    args.push("-vf", [...chain, "format=yuv420p"].join(","));
  }
  const { video } = await encoders();
  args.push("-an", "-t", String(duration), "-c:v", video.codec, ...video.args, "-r", String(FPS), out);

  await ffmpeg(args, `beat ${beat.index + 1}`);
  return out;
}

/** Music under voice: the music ducks when the voice is there, and the whole thing lands at -14 LUFS. */
async function buildAudio(plan: ReelPlan, workDir: string, duration: number, warnings: string[]): Promise<string> {
  const out = path.join(workDir, "audio.m4a");
  const { audio } = await encoders();
  const caps = await capabilities();
  const perBeatVoice = plan.beats.filter((beat) => beat.voiceFile);

  // Every stage is optional: a minimal ffmpeg build still produces a usable track, just
  // without the levelling or the ducking.
  const level = caps.filters.has("loudnorm") ? "loudnorm=I=-14:TP=-1.5:LRA=11," : "";
  const finish = `${level}aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`;
  if (!caps.filters.has("loudnorm")) {
    warnings.push("This ffmpeg has no loudnorm filter, so the audio is not levelled to Instagram's target.");
  }

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
      const delay = Math.round(beat.start * 1000);
      graph.push(`[${index}:a]aresample=48000,adelay=${delay}|${delay}[${label}]`);
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
    if (voiceLabel && caps.filters.has("sidechaincompress")) {
      // The voice is needed twice — once to key the ducking, once in the mix — and a
      // filter output can only be consumed once, so it is split first.
      graph.push(`[${voiceLabel}]asplit=2[vokey][vomix]`);
      graph.push(`${musicIn}aresample=48000,volume=0.35[music]`);
      graph.push(`[music][vokey]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked]`);
      graph.push(`[ducked][vomix]amix=inputs=2:duration=first:normalize=0,${finish}`);
    } else if (voiceLabel) {
      // No ducking available: hold the music lower throughout so the voice still carries.
      graph.push(`${musicIn}aresample=48000,volume=0.18[music]`);
      graph.push(`[music][${voiceLabel}]amix=inputs=2:duration=first:normalize=0,${finish}`);
      warnings.push("This ffmpeg has no sidechaincompress filter, so the music sits low instead of ducking under the voice.");
    } else {
      graph.push(`${musicIn}aresample=48000,volume=0.9,${finish}`);
    }
  } else if (voiceLabel) {
    graph.push(`[${voiceLabel}]${finish}`);
  } else {
    // No audio at all: a silent track, because a reel without an audio stream can be rejected.
    inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    graph.push(`[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[out]`);
    warnings.push("No music or voiceover found, so the reel is silent. Add the track in Instagram before posting.");
  }

  await ffmpeg(
    [
      ...inputs,
      "-filter_complex",
      graph.join(";"),
      "-map",
      "[out]",
      "-t",
      String(duration),
      "-c:a",
      audio.codec,
      ...audio.args,
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      out,
    ],
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
  const { audio: audioCodec } = await encoders();
  const video = path.join(outDir, "reel.mp4");
  await ffmpeg(
    ["-i", silentVideo, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", audioCodec.codec, ...audioCodec.args, "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", video],
    "mux",
  );

  const cover = await buildCover(post, settings.handle, outDir);
  const srt = path.join(outDir, "captions.srt");
  await writeText(srt, toSrt(plan));

  if (!options.keepWork) await fs.rm(workDir, { recursive: true, force: true });

  if (duration > 90) warnings.push(`The cut is ${Math.round(duration)}s. These scripts are written for under 30s.`);
  return { video, cover, srt, duration, warnings };
}
