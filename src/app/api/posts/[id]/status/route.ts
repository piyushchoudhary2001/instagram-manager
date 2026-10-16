import { NextResponse } from "next/server";
import { signApproval } from "@/lib/approval";
import { STATUSES, type Status } from "@/lib/schema";
import { canTransition, readiness } from "@/lib/status";
import { ConflictError, NotFoundError, addHistory, getPost, readConfig, savePost } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Moving a post through the workflow. Approving is the one action with teeth: it refuses
 * while there are blocking issues, and it signs the content so a later edit sends it back.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  let body: { status?: string; note?: string; ifMatch?: string; force?: boolean; permalink?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const status = body.status as Status;
  if (!STATUSES.includes(status)) return NextResponse.json({ error: `Unknown status "${body.status}"` }, { status: 400 });

  try {
    const current = await getPost(id);
    const post = current.post;
    if (!canTransition(post.status, status)) {
      return NextResponse.json({ error: `A post cannot go from ${post.status} to ${status}` }, { status: 400 });
    }

    const config = await readConfig().catch(() => undefined);
    const review = readiness(post, config);
    if ((status === "approved" || status === "scheduled") && !review.canApprove && !body.force) {
      return NextResponse.json({ error: "There are still blocking issues", issues: review.errors }, { status: 422 });
    }

    let next = addHistory(post, "you", `moved to ${status}`, body.note);
    next = { ...next, status };
    if (status === "approved" || status === "scheduled") {
      next = signApproval(next);
    } else if (status === "changes_requested" || status === "drafting" || status === "in_review") {
      next = { ...next, approval: null };
    }
    if (status === "posted") {
      next = {
        ...next,
        published: { postedAt: new Date().toISOString(), ...(body.permalink ? { permalink: body.permalink } : {}) },
      };
    }

    const stored = await savePost(next, body.ifMatch);
    return NextResponse.json({ post: stored.post, etag: stored.etag, review: readiness(stored.post, config) });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message, latest: error.latest.post, etag: error.latest.etag }, { status: 409 });
    }
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the status" }, { status: 500 });
  }
}
