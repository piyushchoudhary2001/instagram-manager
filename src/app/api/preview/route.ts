import { NextResponse } from "next/server";
import { renderSlideSvg } from "@/lib/render/render";
import { SlideSchema } from "@/lib/schema";
import { readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Renders a slide that has not been saved yet, so the studio can show the real thing
 * while you type instead of a guess.
 */
export async function POST(request: Request) {
  let body: { slide?: unknown; index?: number; total?: number; reelCover?: boolean; postId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const parsed = SlideSchema.safeParse(body.slide);
  if (!parsed.success) return NextResponse.json({ error: "That is not a slide", details: parsed.error.issues }, { status: 422 });

  const config = await readConfig().catch(() => ({ handle: "@build.it01" }));
  try {
    const rendered = await renderSlideSvg(parsed.data, {
      handle: config.handle,
      index: body.index ?? 0,
      total: body.total ?? 1,
      reelCover: body.reelCover ?? false,
      postId: body.postId,
    });
    return NextResponse.json({ svg: rendered.svg, width: rendered.width, height: rendered.height, overflow: rendered.overflow });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not render" }, { status: 500 });
  }
}
