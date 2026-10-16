/**
 * Renders every post's slides to PNG under renders/<post-id>/.
 *   npm run render            # everything with slides
 *   npm run render -- <id>    # one post
 * The folder is git-ignored; it is for eyeballing drafts, not for storing deliverables.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { listPosts, readConfig } from "../src/lib/store";
import { renderPost, svgToPng } from "../src/lib/render/render";

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const config = await readConfig();
  const { posts, issues } = await listPosts();
  for (const issue of issues) console.warn(`! ${issue.file}: ${issue.message}`);

  const wanted = posts.filter((p) => (only.length ? only.includes(p.post.id) : p.post.slides.length > 0 || p.post.reel?.cover));
  if (wanted.length === 0) {
    console.log("Nothing to render.");
    return;
  }

  for (const { post } of wanted) {
    const outDir = path.join(process.cwd(), "renders", post.id);
    await fs.mkdir(outDir, { recursive: true });
    const rendered = await renderPost(post, config.handle);
    for (let i = 0; i < rendered.slides.length; i++) {
      const slide = rendered.slides[i];
      const name = `${String(i + 1).padStart(2, "0")}-${post.slides[i].template}.png`;
      await fs.writeFile(path.join(outDir, name), svgToPng(slide.svg, slide.width));
    }
    if (rendered.cover) {
      await fs.writeFile(path.join(outDir, "cover-1080x1920.png"), svgToPng(rendered.cover.svg, rendered.cover.width));
    }
    const count = rendered.slides.length + (rendered.cover ? 1 : 0);
    console.log(`${post.id}: ${count} image${count === 1 ? "" : "s"} → renders/${post.id}`);
    for (const message of rendered.overflow) console.warn(`  ! ${message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
