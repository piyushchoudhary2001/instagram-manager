import { NextResponse } from "next/server";
import { listMedia } from "@/lib/video/media";
import { NotFoundError, getPost } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Everything in this post's footage folder, with durations so the editor can lay out the beats. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await getPost(id);
    return NextResponse.json({ files: await listMedia(id) });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the folder" }, { status: 500 });
  }
}
