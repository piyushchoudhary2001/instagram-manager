import fs from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { encode as encodeJpeg } from "jpeg-js";
import { CANVAS, type Post, type Slide } from "../schema";
import { resolveMedia } from "../store";
import { loadFonts } from "./fonts";
import { buildReelCover, buildSlide, type RenderContext } from "./templates";

/**
 * Rendering. Satori turns the template tree into SVG (flexbox, real font metrics),
 * resvg rasterises it to PNG. The app previews the SVG — it is sharp at any zoom and
 * cheap to produce — and exports PNGs for Instagram.
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function imageDataUri(ref: string, postId?: string): Promise<string | null> {
  for (const file of resolveMedia(ref, postId)) {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) continue;
    try {
      const bytes = await fs.readFile(file);
      return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

async function collectImages(slides: Slide[], postId?: string): Promise<Record<string, string>> {
  const refs = [...new Set(slides.map((s) => s.image).filter((v): v is string => Boolean(v)))];
  const entries = await Promise.all(refs.map(async (ref) => [ref, await imageDataUri(ref, postId)] as const));
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e[1] !== null));
}

export interface RenderOptions {
  handle: string;
  index: number;
  total: number;
  /** render the 1080×1920 reel cover instead of the 1080×1350 carousel frame */
  reelCover?: boolean;
  images?: Record<string, string>;
  /** so a bare image name resolves inside this post's own media folder */
  postId?: string;
}

export interface RenderedSlide {
  svg: string;
  width: number;
  height: number;
  /** text that could not be made to fit, if any */
  overflow: string[];
}

export async function renderSlideSvg(slide: Slide, options: RenderOptions): Promise<RenderedSlide> {
  const size = options.reelCover ? { width: CANVAS.reelCover.width, height: CANVAS.reelCover.height } : CANVAS.carousel;
  const images = options.images ?? (await collectImages([slide], options.postId));
  const overflow: string[] = [];
  const ctx: RenderContext = { handle: options.handle, index: options.index, total: options.total, images, overflow };
  const tree = options.reelCover ? buildReelCover(slide, ctx) : buildSlide(slide, ctx);
  const svg = await satori(tree as never, { width: size.width, height: size.height, fonts: loadFonts() });
  return { svg, width: size.width, height: size.height, overflow };
}

export function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } });
  return Buffer.from(resvg.render().asPng());
}

/**
 * JPEG, because the publishing API takes JPEG and nothing else. resvg hands back raw RGBA,
 * so this encodes straight from the pixels rather than round-tripping through a PNG.
 */
export function svgToJpeg(svg: string, width: number, quality = 92): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } });
  const rendered = resvg.render();
  const encoded = encodeJpeg({ data: rendered.pixels, width: rendered.width, height: rendered.height }, quality);
  return Buffer.from(encoded.data);
}

export async function renderSlidePng(slide: Slide, options: RenderOptions): Promise<{ png: Buffer; overflow: string[] }> {
  const { svg, width, overflow } = await renderSlideSvg(slide, options);
  return { png: svgToPng(svg, width), overflow };
}

export interface RenderedPost {
  slides: RenderedSlide[];
  cover?: RenderedSlide;
  overflow: string[];
}

/** Every slide of a post, plus a reel cover when the post is a reel with one. */
export async function renderPost(post: Post, handle: string): Promise<RenderedPost> {
  const all = [...post.slides, ...(post.reel?.cover ? [post.reel.cover] : [])];
  const images = await collectImages(all, post.id);
  const slides: RenderedSlide[] = [];
  for (let i = 0; i < post.slides.length; i++) {
    slides.push(await renderSlideSvg(post.slides[i], { handle, index: i, total: post.slides.length, images, postId: post.id }));
  }
  let cover: RenderedSlide | undefined;
  if (post.reel?.cover) {
    cover = await renderSlideSvg(post.reel.cover, { handle, index: 0, total: 1, reelCover: true, images, postId: post.id });
  }
  const overflow = [...slides.flatMap((s) => s.overflow), ...(cover?.overflow ?? [])];
  return { slides, cover, overflow };
}

/** Check a post's slides fit without keeping the rendered output. */
export async function overflowReport(post: Post, handle: string): Promise<string[]> {
  const { overflow } = await renderPost(post, handle);
  return overflow;
}

export { collectImages };
