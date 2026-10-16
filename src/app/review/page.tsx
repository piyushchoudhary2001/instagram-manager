import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { thumbFor } from "@/components/PostCard";
import { reconcileAll } from "@/lib/approval";
import { labelDay } from "@/lib/dates";
import { readiness } from "@/lib/status";
import { listPosts, readConfig } from "@/lib/store";
import type { Post } from "@/lib/schema";

export const dynamic = "force-dynamic";

const ORDER: Post["status"][] = ["in_review", "changes_requested", "drafting", "approved", "scheduled", "idea", "posted", "archived"];

export default async function ReviewPage() {
  const config = await readConfig();
  const { posts } = await listPosts();
  const all = (await reconcileAll(posts)).map((s) => s.post);
  const groups = ORDER.map((status) => ({ status, posts: all.filter((p) => p.status === status) })).filter((g) => g.posts.length);

  return (
    <>
      <div className="section" style={{ marginTop: 36 }}>
        <h1>Review queue</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Everything Claude has drafted, in the order it needs you. Approving signs the content; if a word changes afterwards the
          post comes straight back here.
        </p>
      </div>

      {groups.map((group) => (
        <div className="section" key={group.status}>
          <div className="section__head">
            <h2>
              <StatusChip status={group.status} />
            </h2>
            <span className="muted">{group.posts.length}</span>
          </div>
          <div className="queue">
            {group.posts.map((post) => {
              const review = readiness(post, config);
              const thumb = thumbFor(post);
              return (
                <Link key={post.id} className="queue__item" href={`/posts/${post.id}`}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="queue__thumb" src={thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="queue__thumb" aria-hidden />
                  )}
                  <span>
                    <strong style={{ fontSize: 15 }}>{post.title}</strong>
                    <span className="card__meta">
                      {post.date ? labelDay(post.date) : "No date"} · {post.format} · {post.pillar}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: 12, textAlign: "right" }}>
                    {review.errors.length > 0
                      ? `${review.errors.length} blocking`
                      : review.warnings.length > 0
                        ? `${review.warnings.length} note${review.warnings.length === 1 ? "" : "s"}`
                        : "clear"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {groups.length === 0 ? <div className="empty">Nothing drafted yet.</div> : null}
    </>
  );
}
