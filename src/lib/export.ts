import { zipSync, strToU8 } from "fflate";
import type { Post } from "./schema";
import { renderPost } from "./render/render";

/**
 * Export pack: the PNGs in posting order, the caption and hashtags as a text file,
 * and the alt text — everything needed to post by hand, or to hand to the Graph API
 * once Instagram publishing is wired up.
 */

export function captionFile(post: Post): string {
  const lines = [post.caption.trim()];
  if (post.hashtags.length) lines.push("", post.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" "));
  if (post.altText?.trim()) lines.push("", "— Alt text —", post.altText.trim());
  if (post.format === "reel" && post.reel) {
    lines.push("", "— Reel —", `Hook: ${post.reel.hook}`, `Audio: ${post.reel.audio || "not chosen yet"}`);
    for (const beat of post.reel.beats) {
      lines.push(`${beat.time}  ${beat.onScreen}${beat.voiceover ? `  //  ${beat.voiceover}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export interface ExportPack {
  zip: Uint8Array;
  filename: string;
  overflow: string[];
}

export async function exportPost(post: Post, handle: string): Promise<ExportPack> {
  const rendered = await renderPost(post, handle);
  const files: Record<string, Uint8Array> = {};
  const { svgToPng } = await import("./render/render");
  rendered.slides.forEach((slide, i) => {
    files[`${String(i + 1).padStart(2, "0")}.png`] = new Uint8Array(svgToPng(slide.svg, slide.width));
  });
  if (rendered.cover) files["cover-1080x1920.png"] = new Uint8Array(svgToPng(rendered.cover.svg, rendered.cover.width));
  files["caption.txt"] = strToU8(captionFile(post));
  files["post.json"] = strToU8(`${JSON.stringify(post, null, 2)}\n`);
  return {
    zip: zipSync(files, { level: 6 }),
    filename: `${post.id}.zip`,
    overflow: rendered.overflow,
  };
}
