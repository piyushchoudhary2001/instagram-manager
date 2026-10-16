import { NextResponse } from "next/server";
import { hasIcon, iconSvg } from "@/lib/render/icons";

type Params = { params: Promise<{ name: string }> };

/** One brand icon as SVG, for the editor and the brand page. */
export async function GET(request: Request, { params }: Params) {
  const { name } = await params;
  if (!hasIcon(name)) return NextResponse.json({ error: `No icon called "${name}"` }, { status: 404 });
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("size") ?? 24);
  const color = url.searchParams.get("color") ?? "#141414";
  const svg = iconSvg(name, { size: Number.isFinite(size) ? size : 24, color });
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
