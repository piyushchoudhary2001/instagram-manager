import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { planReel } from "@/lib/video/beats";
import { exportsDirFor } from "@/lib/video/render";
import { ffmpegAvailable } from "@/lib/video/ffmpeg";
import { NotFoundError, getPost } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * What the cut would look like: which clip lands on which beat, what is missing, and
 * whether a build already exists. The building itself runs from the command line —
 * ffmpeg on a 30-second reel is not something to hold an HTTP request open for.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { post } = await getPost(id);
    if (post.format !== "reel") return NextResponse.json({ error: "Not a reel" }, { status: 400 });

    const plan = planReel(post);
    const outDir = exportsDirFor(id);
    const video = path.join(outDir, "reel.mp4");
    let built: { at: string; bytes: number } | null = null;
    try {
      const stat = await fs.stat(video);
      built = { at: stat.mtime.toISOString(), bytes: stat.size };
    } catch {
      built = null;
    }

    return NextResponse.json({
      plan: {
        clipsDir: path.relative(process.cwd(), plan.clipsDir),
        duration: plan.duration,
        music: plan.music ? path.basename(plan.music) : null,
        voiceover: plan.voiceover ? path.basename(plan.voiceover) : null,
        unused: plan.unused.map((file) => path.basename(file)),
        beats: plan.beats.map((beat) => ({
          index: beat.index,
          start: beat.start,
          end: beat.end,
          onScreen: beat.onScreen,
          source: beat.source ? path.basename(beat.source) : null,
          kind: beat.sourceKind,
        })),
      },
      built,
      ffmpeg: await ffmpegAvailable(),
      command: `npm run reel -- ${id}`,
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the plan" }, { status: 500 });
  }
}
