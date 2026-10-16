import fs from "node:fs/promises";
import path from "node:path";
import { MAX_CAPTION, type Post } from "../schema";
import { renderSlideSvg, svgToJpeg } from "../render/render";
import { readiness } from "../status";
import { exportsDirFor } from "../video/render";
import {
  createCarouselContainer,
  createImageContainer,
  createReelContainer,
  getMedia,
  publishContainer,
  waitForContainer,
} from "./client";
import { configState, instagramConfig, MEDIA_TTL_MS, signMedia } from "./config";

/**
 * Publishing an approved post.
 *
 * Instagram does not accept an upload: it fetches the media from a URL you give it. So the
 * slides are written as JPEGs, served from this app behind a short-lived signed link, and
 * the container → publish dance happens against those links.
 */

/** The API's own carousel limit, which is lower than the 20 slides the app itself allows. */
export const API_CAROUSEL_MAX = 10;

export interface PublishBlock {
  field: string;
  message: string;
  fix?: string;
}

export async function publishChecks(post: Post): Promise<PublishBlock[]> {
  const blocks: PublishBlock[] = [];
  const state = configState();

  if (!state.ready) {
    blocks.push({
      field: "credentials",
      message: `Not configured yet: ${state.missing.join(", ")}.`,
      fix: "Put them in .env.local and restart the app.",
    });
  }
  if (!state.publicBase) {
    blocks.push({
      field: "publicBase",
      message: "PUBLIC_MEDIA_BASE_URL is not set, so Instagram has nowhere to fetch the media from.",
      fix: "Start a tunnel to this app and set that variable to its https address.",
    });
  } else if (!/^https:\/\//i.test(state.publicBase)) {
    blocks.push({ field: "publicBase", message: "PUBLIC_MEDIA_BASE_URL must be https — Instagram will not fetch over http." });
  }

  if (post.status !== "approved" && post.status !== "scheduled") {
    blocks.push({ field: "status", message: `This post is "${post.status}". Approve it first.` });
  }

  const review = readiness(post);
  for (const issue of review.errors) blocks.push({ field: issue.field, message: issue.message });

  const caption = fullCaption(post);
  if (caption.length > MAX_CAPTION) {
    blocks.push({ field: "caption", message: `The caption and hashtags come to ${caption.length} characters; the limit is ${MAX_CAPTION}.` });
  }

  if (post.format === "carousel") {
    if (post.slides.length > API_CAROUSEL_MAX) {
      blocks.push({
        field: "slides",
        message: `The API publishes at most ${API_CAROUSEL_MAX} images in a carousel; this has ${post.slides.length}.`,
        fix: `Cut it to ${API_CAROUSEL_MAX} slides, or post this one by hand.`,
      });
    }
    if (post.slides.length < 2) blocks.push({ field: "slides", message: "A carousel needs at least 2 slides." });
  }

  if (post.format === "reel") {
    const video = path.join(exportsDirFor(post.id), "reel.mp4");
    const built = await fs
      .access(video)
      .then(() => true)
      .catch(() => false);
    if (!built) {
      blocks.push({
        field: "reel",
        message: "There is no cut built for this reel yet.",
        fix: `Run: npm run reel -- ${post.id}`,
      });
    }
  }

  if (post.format === "story") blocks.push({ field: "format", message: "Stories are not published from here." });

  return blocks;
}

/** Things worth knowing before you publish, which are not reasons to stop. */
export function publishNotes(post: Post): string[] {
  const notes: string[] = [];
  if (post.format === "reel") {
    notes.push("Trending audio cannot be attached through the API. A reel published from here keeps whatever audio is in the file.");
  }
  if (post.format === "carousel" && post.slides.length > 0) {
    notes.push("Instagram crops every slide to the first one's aspect ratio. All of these are 4:5, so nothing moves.");
  }
  notes.push("The media is served from this app while publishing, so the tunnel has to stay up until it finishes.");
  return notes;
}

export function fullCaption(post: Post): string {
  const tags = post.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ");
  return tags ? `${post.caption.trim()}\n\n${tags}` : post.caption.trim();
}

export function publishDirFor(postId: string): string {
  return path.join(exportsDirFor(postId), "publish");
}

/** Writes the slides as JPEGs where the signed media route can serve them. */
export async function writePublishMedia(post: Post, handle: string): Promise<string[]> {
  const dir = publishDirFor(post.id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const names: string[] = [];
  for (let i = 0; i < post.slides.length; i++) {
    const rendered = await renderSlideSvg(post.slides[i], { handle, index: i, total: post.slides.length });
    const name = `${String(i + 1).padStart(2, "0")}.jpg`;
    await fs.writeFile(path.join(dir, name), svgToJpeg(rendered.svg, rendered.width));
    names.push(name);
  }
  return names;
}

export function signedUrl(postId: string, file: string, base: string): string {
  const expires = Date.now() + MEDIA_TTL_MS;
  const signature = signMedia(postId, file, expires);
  return `${base.replace(/\/$/, "")}/api/public/${postId}/${file}?exp=${expires}&sig=${signature}`;
}

export interface PublishResult {
  mediaId: string;
  permalink?: string;
  containerId: string;
}

export interface PublishOptions {
  handle: string;
  onProgress?: (message: string) => void;
}

export async function publishPost(post: Post, options: PublishOptions): Promise<PublishResult> {
  const say = options.onProgress ?? (() => undefined);
  const config = instagramConfig();
  const base = config.publicBase;
  if (!base) throw new Error("PUBLIC_MEDIA_BASE_URL is not set");
  const caption = fullCaption(post);

  let containerId: string;

  if (post.format === "reel") {
    const video = path.join(exportsDirFor(post.id), "reel.mp4");
    await fs.access(video).catch(() => {
      throw new Error(`No cut built yet — run: npm run reel -- ${post.id}`);
    });
    const cover = await fs
      .access(path.join(exportsDirFor(post.id), "cover.jpg"))
      .then(() => signedUrl(post.id, "cover.jpg", base))
      .catch(() => undefined);
    say("Handing Instagram the video");
    containerId = await createReelContainer(
      { videoUrl: signedUrl(post.id, "reel.mp4", base), caption, coverUrl: cover },
      config,
    );
  } else if (post.format === "carousel") {
    say("Rendering the slides as JPEGs");
    const files = await writePublishMedia(post, options.handle);
    const children: string[] = [];
    for (let i = 0; i < files.length; i++) {
      say(`Uploading slide ${i + 1} of ${files.length}`);
      children.push(
        await createImageContainer(
          { imageUrl: signedUrl(post.id, files[i], base), isCarouselItem: true, altText: post.slides[i].alt },
          config,
        ),
      );
    }
    say("Building the carousel");
    containerId = await createCarouselContainer({ children, caption }, config);
  } else {
    say("Rendering the image");
    const files = await writePublishMedia(post, options.handle);
    if (files.length === 0) throw new Error("Nothing to publish — this post has no slides");
    containerId = await createImageContainer(
      { imageUrl: signedUrl(post.id, files[0], base), caption, altText: post.altText },
      config,
    );
  }

  say("Waiting for Instagram to process it");
  await waitForContainer(containerId, { onTick: (status) => say(`Container ${status.toLowerCase().replace("_", " ")}`) }, config);

  say("Publishing");
  const mediaId = await publishContainer(containerId, config);
  const info = await getMedia(mediaId, config).catch(() => null);

  return { mediaId, permalink: info?.permalink, containerId };
}
