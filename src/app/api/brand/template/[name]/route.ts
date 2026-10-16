import { NextResponse } from "next/server";
import { renderSlideSvg } from "@/lib/render/render";
import { TEMPLATES, newSlide, type Template } from "@/lib/schema";
import { readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

/** A sample of one slide template, for the brand page. */
export async function GET(_request: Request, { params }: Params) {
  const { name } = await params;
  if (!TEMPLATES.includes(name as Template)) return NextResponse.json({ error: `No template called "${name}"` }, { status: 404 });
  const config = await readConfig().catch(() => ({ handle: "@build.it01" }));
  const rendered = await renderSlideSvg(newSlide(name as Template), { handle: config.handle, index: 2, total: 8 });
  return new NextResponse(rendered.svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" } });
}
