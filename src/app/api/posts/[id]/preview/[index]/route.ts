import { NextResponse } from "next/server";
import { renderSlideSvg, svgToPng } from "@/lib/render/render";
import { NotFoundError, getPost, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * One slide, rendered on demand. SVG by default (sharp in the browser, cheap to make);
 * add ?format=png for the real export pixels, and ?cover=1 for a reel's 1080×1920 cover.
 */
export async function GET(request: Request, { params }: Params) {
  const { id, index } = await params;
  const url = new URL(request.url);
  const wantPng = url.searchParams.get("format") === "png";
  const wantCover = url.searchParams.get("cover") === "1";

  try {
    const { post } = await getPost(id);
    const config = await readConfig().catch(() => ({ handle: "@build.it01" }));
    const slide = wantCover ? post.reel?.cover : post.slides[Number(index)];
    if (!slide) return NextResponse.json({ error: "No slide there" }, { status: 404 });

    const rendered = await renderSlideSvg(slide, {
      handle: config.handle,
      index: wantCover ? 0 : Number(index),
      total: wantCover ? 1 : post.slides.length,
      reelCover: wantCover,
      postId: id,
    });

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Slide-Overflow": rendered.overflow.length ? "1" : "0",
    };
    if (wantPng) {
      const png = svgToPng(rendered.svg, rendered.width);
      return new NextResponse(new Uint8Array(png), {
        headers: { ...headers, "Content-Type": "image/png", "Content-Disposition": `inline; filename="${id}-${index}.png"` },
      });
    }
    return new NextResponse(rendered.svg, { headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" } });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not render that slide" }, { status: 500 });
  }
}
