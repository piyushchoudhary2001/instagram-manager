import { reconcileAll } from "@/lib/approval";
import { labelDay } from "@/lib/dates";
import { listPosts, readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Reports only whether a variable is set. Values stay in your .env and never reach the UI or Claude. */
function envStatus() {
  const keys = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_ACCOUNT_ID", "PUBLIC_MEDIA_BASE_URL"];
  return keys.map((key) => ({ key, set: Boolean(process.env[key]) }));
}

export default async function PublishPage() {
  const config = await readConfig();
  const { posts } = await listPosts();
  const all = (await reconcileAll(posts)).map((s) => s.post);
  const ready = all.filter((p) => p.status === "approved" || p.status === "scheduled");
  const env = envStatus();
  const configured = env.every((e) => e.set);

  return (
    <>
      <div className="section" style={{ marginTop: 36 }}>
        <h1>Publishing</h1>
        <p className="lede" style={{ marginTop: 10 }}>
          Today the app hands you a pack — slides as PNGs, caption, alt text — and you post it. Publishing straight to Instagram is
          the next phase and needs a Meta app of your own; the steps are below.
        </p>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Approved and waiting</h2>
          <span className="muted">{ready.length} ready</span>
        </div>
        {ready.length === 0 ? (
          <div className="empty">Nothing approved yet. Approve a post and it shows up here with its pack.</div>
        ) : (
          <div className="queue">
            {ready.map((post) => (
              <div className="queue__item" key={post.id}>
                <span className="queue__thumb" aria-hidden />
                <span>
                  <strong style={{ fontSize: 15 }}>{post.title}</strong>
                  <span className="card__meta">
                    {post.date ? labelDay(post.date) : "No date"} · {post.time ?? config.defaultTime} IST · {post.format}
                  </span>
                </span>
                <a className="btn btn--small" href={`/api/posts/${post.id}/export`}>
                  Download pack
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Direct publishing</h2>
          <span className="muted">{configured ? "credentials present" : "not configured"}</span>
        </div>
        <div className="panel">
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
            <li>
              Make sure the account is a Business or Creator account and is linked to a Facebook Page — the Instagram API for
              publishing only works on those.
            </li>
            <li>
              Create an app at <code>developers.facebook.com</code>, add the Instagram product, and generate a long-lived access
              token for the account.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values there. They stay on your machine;
              never paste them into a chat, and never commit the file.
            </li>
            <li>
              Publishing needs the images on a public HTTPS URL for Meta to fetch, so set <code>PUBLIC_MEDIA_BASE_URL</code> to
              wherever the exported PNGs will be served from.
            </li>
            <li>Then the Publish button appears here, and a posted piece gets its permalink written back into its JSON.</li>
          </ol>
          <div className="row" style={{ marginTop: 18, flexWrap: "wrap" }}>
            {env.map((item) => (
              <span key={item.key} className="chip" style={{ color: item.set ? "var(--text-success)" : "var(--text-tertiary)" }}>
                <span className="chip__dot" aria-hidden />
                {item.key}
                {item.set ? " set" : " missing"}
              </span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Worth knowing before you build on it: the API posts to a container and then publishes it, there is a daily cap on API
            posts, and trending audio cannot be attached through the API — so reels are likely to stay a manual upload even after
            this is wired up. Check the current Instagram Graph API docs when you get to it; the limits move.
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Video</h2>
          <span className="muted">phase two</span>
        </div>
        <div className="panel">
          <p style={{ marginTop: 0 }}>
            The reel pipeline lives in <code>docs/VIDEO.md</code>: where to drop raw clips, how the script in a post&apos;s Script
            tab becomes an edit list, and what Claude can do with ffmpeg on your machine — rough cuts, burned-in captions from the
            beats, a colour grade, audio levelling, and the cover frame this app already renders.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            It needs the folder with your clips connected to the session, which is why it comes after the carousels.
          </p>
        </div>
      </div>
    </>
  );
}
