import { NextResponse } from "next/server";
import { approvalStale, reconcileApproval, signApproval } from "@/lib/approval";
import { PostSchema } from "@/lib/schema";
import { readiness } from "@/lib/status";
import { ConflictError, NotFoundError, addHistory, deletePost, getPost, readConfig, savePost } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const stored = await reconcileApproval(await getPost(id));
    const config = await readConfig().catch(() => undefined);
    return NextResponse.json({ post: stored.post, etag: stored.etag, review: readiness(stored.post, config) });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that post" }, { status: 500 });
  }
}

/**
 * Save an edit. `ifMatch` is the etag the editor loaded with: when the file has changed
 * underneath (Claude drafting into it, a git pull) the write is refused and the caller
 * gets the current version back to merge.
 */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { post?: unknown; ifMatch?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body.post);
  if (!parsed.success) {
    return NextResponse.json({ error: "That post does not fit the schema", details: parsed.error.issues }, { status: 422 });
  }
  if (parsed.data.id !== id) return NextResponse.json({ error: "The id in the body does not match the URL" }, { status: 400 });

  try {
    const current = await getPost(id);
    if (current.post.status !== parsed.data.status) {
      return NextResponse.json({ error: "Use /status to move a post through the workflow" }, { status: 400 });
    }
    let next = parsed.data;
    // Editing an approved post un-approves it; that is the point of the signature.
    if (approvalStale({ ...next, approval: current.post.approval })) {
      next = { ...addHistory(next, "you", "edited after approval", "Back to review."), status: "in_review", approval: null };
    } else if (next.approval && next.status === "approved") {
      next = signApproval(next, next.approval.approvedBy);
    }
    const stored = await savePost(next, body.ifMatch);
    const config = await readConfig().catch(() => undefined);
    return NextResponse.json({ post: stored.post, etag: stored.etag, review: readiness(stored.post, config) });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: error.message, latest: error.latest.post, etag: error.latest.etag },
        { status: 409 },
      );
    }
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const current = await getPost(id);
    if (current.post.status === "posted") {
      return NextResponse.json({ error: "A posted piece stays in the record. Archive it instead." }, { status: 400 });
    }
    await deletePost(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete" }, { status: 500 });
  }
}
