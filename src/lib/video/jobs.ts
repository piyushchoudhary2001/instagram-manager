import { planReel } from "./beats";
import { buildReel, type Grade } from "./render";
import { ffmpegAvailable } from "./ffmpeg";
import { getPost, readConfig } from "../store";

/**
 * Builds run in the background.
 *
 * Cutting a 30-second reel takes ffmpeg the better part of a minute, which is far too long
 * to hold an HTTP request open. So the request starts a job, the editor polls it, and the
 * progress the CLI prints to a terminal shows up as a line in the UI instead.
 *
 * State lives in memory: a restart loses the job, not the output.
 */

export type JobState = "running" | "done" | "failed";

export interface BuildJob {
  postId: string;
  state: JobState;
  step: string;
  /** 0–1, from how many beats are cut so far */
  progress: number;
  warnings: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
}

const jobs = new Map<string, BuildJob>();

export function jobFor(postId: string): BuildJob | null {
  return jobs.get(postId) ?? null;
}

export interface BuildRequest {
  grade?: Grade;
  captions?: boolean;
}

export async function startBuild(postId: string, options: BuildRequest = {}): Promise<BuildJob> {
  const existing = jobs.get(postId);
  if (existing?.state === "running") return existing;

  if (!(await ffmpegAvailable())) {
    const failed: BuildJob = {
      postId,
      state: "failed",
      step: "ffmpeg is not installed",
      progress: 0,
      warnings: [],
      error: "ffmpeg is not on your PATH. macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg · Windows: winget install Gyan.FFmpeg",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    jobs.set(postId, failed);
    return failed;
  }

  const job: BuildJob = {
    postId,
    state: "running",
    step: "Getting ready",
    progress: 0,
    warnings: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(postId, job);

  void (async () => {
    try {
      const config = await readConfig();
      const { post } = await getPost(postId);
      if (post.format !== "reel" || !post.reel?.beats.length) throw new Error("This post has no reel script to cut");
      const plan = planReel(post);
      const total = plan.beats.length || 1;

      const result = await buildReel(post, plan, {
        handle: config.handle,
        grade: options.grade ?? "warm",
        captions: options.captions ?? true,
        onProgress: (message) => {
          job.step = message;
          const match = /beat (\d+) of (\d+)/i.exec(message);
          // Cutting the beats is most of the work; the join, audio and mux are the last fifth.
          if (match) job.progress = (Number(match[1]) - 1) / total * 0.8;
          else if (/joining/i.test(message)) job.progress = 0.82;
          else if (/audio/i.test(message)) job.progress = 0.88;
          else if (/writing/i.test(message)) job.progress = 0.95;
        },
      });

      job.state = "done";
      job.step = "Done";
      job.progress = 1;
      job.warnings = result.warnings;
      job.duration = result.duration;
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      job.state = "failed";
      job.step = "Failed";
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
    }
  })();

  return job;
}
