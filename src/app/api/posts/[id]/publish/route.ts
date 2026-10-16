import { NextResponse } from "next/server";
import { redact } from "@/lib/instagram/config";
import { publishChecks, publishNotes, publishPost } from "@/lib/instagram/publish";
import { NotFoundError, addHistory, getPost, readConfig, savePost } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/** What would stop this post going out right now. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { post } = await getPost(id);
    const blocks = await publishChecks(post);
    return NextResponse.json({ blocks, notes: publishNotes(post), ready: blocks.length === 0 });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not check" }, { status: 500 });
  }
}

/**
 * Publishes an approved post. This is a person pressing a button — the API will not do it
 * for a post you have not approved, and it records what went out in the post's own file.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { ifMatch?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const stored = await getPost(id);
    const post = stored.post;
    const blocks = await publishChecks(post);
    if (blocks.length > 0) return NextResponse.json({ error: "Not ready to publish", blocks }, { status: 422 });

    const config = await readConfig();
    const steps: string[] = [];
    const result = await publishPost(post, { handle: config.handle, onProgress: (message) => steps.push(message) });

    const published = {
      postedAt: new Date().toISOString(),
      mediaId: result.mediaId,
      ...(result.permalink ? { permalink: result.permalink } : {}),
    };
    const next = addHistory(
      { ...post, status: "posted" as const, published },
      "you",
      "published to Instagram",
      result.permalink ?? `media ${result.mediaId}`,
    );
    const saved = await savePost(next, body.ifMatch ?? stored.etag);

    return NextResponse.json({ post: saved.post, etag: saved.etag, steps, ...result });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(
      { error: redact(error instanceof Error ? error.message : "Publishing failed") },
      { status: 502 },
    );
  }
}
