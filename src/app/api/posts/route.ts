import { NextResponse } from "next/server";
import { reconcileAll } from "@/lib/approval";
import { PostSchema, makePostId, type Post } from "@/lib/schema";
import { readiness } from "@/lib/status";
import { createPost, listPosts, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await readConfig().catch(() => undefined);
  const { posts, issues } = await listPosts();
  const reconciled = await reconcileAll(posts);
  return NextResponse.json({
    posts: reconciled.map(({ post, etag }) => ({
      ...post,
      etag,
      review: readiness(post, config),
    })),
    issues,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const draft = body as Partial<Post>;
  const candidate = {
    status: "idea",
    hook: "",
    cta: "",
    caption: "",
    hashtags: [],
    slides: [],
    facts: [],
    notes: "",
    history: [],
    ...draft,
    id: draft.id ?? makePostId(draft.date ?? null, draft.title ?? "untitled"),
  };
  const parsed = PostSchema.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json({ error: "That post does not fit the schema", details: parsed.error.issues }, { status: 422 });
  }
  if (parsed.data.status === "approved" || parsed.data.status === "posted") {
    return NextResponse.json({ error: "A new post cannot start out approved or posted" }, { status: 422 });
  }
  try {
    const stored = await createPost(parsed.data);
    return NextResponse.json({ post: stored.post, etag: stored.etag }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the post" }, { status: 409 });
  }
}
