import { NextResponse } from "next/server";
import { exportPost } from "@/lib/export";
import { NotFoundError, getPost, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A zip with the slides as PNGs, the caption and the post JSON — ready to post by hand. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { post } = await getPost(id);
    const config = await readConfig().catch(() => ({ handle: "@build.it01" }));
    const pack = await exportPost(post, config.handle);
    return new NextResponse(new Uint8Array(pack.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pack.filename}"`,
        "X-Slide-Overflow": pack.overflow.length ? "1" : "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build the export" }, { status: 500 });
  }
}
