/**
 * Cuts a reel from its script.
 *
 *   npm run reel -- <post-id>              build it
 *   npm run reel -- <post-id> --plan       just show which clip goes where
 *   npm run reel -- <post-id> --grade none --no-captions
 *   npm run reel -- <post-id> --clips ~/Desktop/kayak --music ~/Desktop/track.mp3
 *
 * Clips live in content/media/<post-id>/. Name a file after its beat number
 * ("03-paddle.mp4") to pin it; anything else fills the remaining beats in order.
 */
import path from "node:path";
import { planReel } from "../src/lib/video/beats";
import { buildReel, exportsDirFor, type Grade } from "../src/lib/video/render";
import { ffmpegAvailable } from "../src/lib/video/ffmpeg";
import { getPost, readConfig } from "../src/lib/store";

const VALUE_FLAGS = new Set(["clips", "music", "grade", "out"]);

const argv = process.argv.slice(2);
const flags = new Map<string, string | true>();
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith("--")) {
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      flags.set(name, argv[i + 1] ?? "");
      i += 1;
    } else {
      flags.set(name, true);
    }
  } else {
    positional.push(arg);
  }
}

const flag = (name: string): string | undefined => {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
};
const has = (name: string): boolean => flags.has(name);

async function main(): Promise<void> {
  const id = positional[0];
  if (!id) {
    console.error("Which post? e.g. npm run reel -- 2026-10-22-kayaking-beginner-mistakes");
    process.exit(1);
  }

  const config = await readConfig();
  const { post } = await getPost(id);
  if (post.format !== "reel") {
    console.error(`${id} is a ${post.format}, not a reel.`);
    process.exit(1);
  }
  if (!post.reel?.beats.length) {
    console.error(`${id} has no beats in its script yet.`);
    process.exit(1);
  }

  const plan = planReel(post, { clipsDir: flag("clips"), music: flag("music") });

  console.log(`\n${post.title}`);
  console.log(`Clips from ${path.relative(process.cwd(), plan.clipsDir)}\n`);
  for (const beat of plan.beats) {
    const source = beat.source ? path.basename(beat.source) : "— no clip —";
    console.log(
      `  ${String(beat.index + 1).padStart(2, "0")}  ${beat.start.toFixed(1)}–${beat.end.toFixed(1)}s  ${source.padEnd(28)} ${beat.onScreen.slice(0, 44)}`,
    );
  }
  console.log(`\n  music: ${plan.music ? path.basename(plan.music) : "none"}`);
  console.log(`  voice: ${plan.voiceover ? path.basename(plan.voiceover) : plan.beats.some((b) => b.voiceFile) ? "per-beat files" : "none"}`);
  if (plan.unused.length) console.log(`  unused: ${plan.unused.map((f) => path.basename(f)).join(", ")}`);
  if (plan.missing.length) console.log(`  missing clips for beats: ${plan.missing.map((i) => i + 1).join(", ")}`);

  if (has("plan")) return;

  if (!(await ffmpegAvailable())) {
    console.error("\nffmpeg is not on your PATH. macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg");
    process.exit(1);
  }

  console.log("");
  const result = await buildReel(post, plan, {
    handle: config.handle,
    grade: (flag("grade") as Grade) ?? "warm",
    outDir: flag("out"),
    captions: !has("no-captions"),
    keepWork: has("keep-work"),
    onProgress: (message) => console.log(`  ${message}`),
  });

  const rel = (file: string) => path.relative(process.cwd(), file);
  console.log(`\n✓ ${rel(result.video)}  ${result.duration.toFixed(1)}s`);
  if (result.cover) console.log(`  ${rel(result.cover)}`);
  console.log(`  ${rel(result.srt)}`);
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
  console.log(`\nWatch it, then open Instagram to add the audio and post. Everything is in ${rel(exportsDirFor(post.id))}.\n`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
