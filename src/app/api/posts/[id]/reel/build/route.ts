import { NextResponse } from "next/server";
import { jobFor, startBuild } from "@/lib/video/jobs";
import { NotFoundError, getPost } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

type Params = { params: Promise<{ id: string }> };

/** Where the current build has got to. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json({ job: jobFor(id) });
}

/** Start cutting. Returns straight away; poll GET for progress. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { grade?: string; captions?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  try {
    const { post } = await getPost(id);
    if (post.format !== "reel") return NextResponse.json({ error: "Not a reel" }, { status: 400 });
    const job = await startBuild(id, {
      grade: (body.grade as "warm" | "neutral" | "none") ?? "warm",
      captions: body.captions ?? true,
    });
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the build" }, { status: 500 });
  }
}
