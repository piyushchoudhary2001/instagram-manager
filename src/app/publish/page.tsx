import Link from "next/link";
import { PublishStatus } from "@/components/PublishStatus";
import { reconcileAll } from "@/lib/approval";
import { labelDay, relativeTime } from "@/lib/dates";
import { listPosts, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

const SHOWN_METRICS: [string, string][] = [
  ["saved", "saves"],
  ["shares", "shares"],
  ["reach", "reach"],
  ["views", "views"],
  ["follows", "follows"],
];

export default async function PublishPage() {
  const config = await readConfig();
  const { posts } = await listPosts();
  const all = (await reconcileAll(posts)).map((s) => s.post);
  const ready = all.filter((p) => p.status === "approved" || p.status === "scheduled");
  const posted = all.filter((p) => p.status === "posted").reverse();

  return (
    <>
      <div className="section" style={{ marginTop: 36 }}>
        <h1>Publishing</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Post straight from here once your Meta app is set up, or download the pack and post by hand. Either way the permalink and
          the numbers end up in the post&apos;s own file.
        </p>
      </div>

      <div className="section">
        <PublishStatus />
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Approved and waiting</h2>
          <span className="muted">{ready.length} ready</span>
        </div>
        {ready.length === 0 ? (
          <div className="empty">Nothing approved yet. Approve a post and it shows up here.</div>
        ) : (
          <div className="queue">
            {ready.map((post) => (
              <div className="queue__item" key={post.id}>
                <span className="queue__thumb" aria-hidden />
                <span>
                  <Link href={`/posts/${post.id}`}>
                    <strong style={{ fontSize: 15 }}>{post.title}</strong>
                  </Link>
                  <span className="card__meta">
                    {post.date ? labelDay(post.date) : "No date"} · {post.time ?? config.defaultTime} IST · {post.format}
                    {post.format === "carousel" && post.slides.length > 10 ? " · too many slides for the API" : ""}
                  </span>
                </span>
                <span className="row">
                  <Link className="btn btn--small btn--go" href={`/posts/${post.id}`}>
                    Publish
                  </Link>
                  <a className="btn btn--small" href={`/api/posts/${post.id}/export`}>
                    Pack
                  </a>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {posted.length > 0 ? (
        <div className="section">
          <div className="section__head">
            <h2>Live</h2>
            <span className="muted">newest first</span>
          </div>
          <div className="queue">
            {posted.map((post) => {
              const insights = post.published?.insights as Record<string, number | string> | undefined;
              return (
                <div className="queue__item" key={post.id}>
                  <span className="queue__thumb" aria-hidden />
                  <span>
                    <Link href={`/posts/${post.id}`}>
                      <strong style={{ fontSize: 15 }}>{post.title}</strong>
                    </Link>
                    <span className="card__meta">
                      {post.published?.postedAt ? relativeTime(post.published.postedAt) : "posted"}
                      {insights
                        ? ` · ${SHOWN_METRICS.filter(([key]) => typeof insights[key] === "number")
                            .map(([key, label]) => `${insights[key]} ${label}`)
                            .join(" · ")}`
                        : " · no numbers yet"}
                    </span>
                  </span>
                  {post.published?.permalink ? (
                    <a className="btn btn--small" href={post.published.permalink} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>
                      no link
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Setting it up</h2>
          <span className="muted">docs/INSTAGRAM.md</span>
        </div>
        <div className="panel">
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
            <li>Make the account a Business or Creator account — the publishing API works on those only.</li>
            <li>
              Create an app at <code>developers.facebook.com</code>, add the Instagram product, and generate a long-lived token with{" "}
              <code>instagram_business_basic</code>, <code>instagram_business_content_publish</code> and{" "}
              <code>instagram_business_manage_insights</code>.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code> and fill it in there. Those values stay on your machine —
              they are not committed, and they never go into a chat.
            </li>
            <li>
              Start a tunnel so Meta can fetch the media (<code>cloudflared tunnel --url http://localhost:3000</code>) and put its
              https address in <code>PUBLIC_MEDIA_BASE_URL</code>. Take the tunnel down when you are done.
            </li>
            <li>Open an approved post, go to its Publish tab, and send it.</li>
          </ol>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Worth knowing: a carousel can carry at most 10 images through the API (the app itself allows 20 for manual posting),
            images are converted to JPEG because that is all the API takes, there is a cap of 100 API posts a day, and trending
            audio cannot be attached through the API — so reels you want a trending track on are still better posted by hand.
          </p>
        </div>
      </div>
    </>
  );
}
