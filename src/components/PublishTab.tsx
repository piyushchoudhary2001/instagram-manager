"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/dates";
import type { Post } from "@/lib/schema";

interface Block {
  field: string;
  message: string;
  fix?: string;
}

const METRIC_LABEL: Record<string, string> = {
  saved: "Saves",
  shares: "Shares",
  reach: "Reach",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  profile_visits: "Profile visits",
  follows: "Follows",
  total_interactions: "Interactions",
  ig_reels_avg_watch_time: "Avg watch (ms)",
};

/** Publishing one post: what would stop it, the act itself, and the numbers afterwards. */
export function PublishTab({ post, onPublished }: { post: Post; onPublished: (post: Post, etag: string) => void }) {
  const [checks, setChecks] = useState<{ blocks: Block[]; notes: string[]; ready: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/posts/${post.id}/publish`)
      .then((response) => response.json())
      .then((body) => live && setChecks(body as { blocks: Block[]; notes: string[]; ready: boolean }))
      .catch(() => live && setError("Could not run the checks"));
    return () => {
      live = false;
    };
  }, [post.id, post.status, nonce]);

  const insights = post.published?.insights as Record<string, number | string> | undefined;

  async function publish() {
    if (!window.confirm("This posts to Instagram now. Ready?")) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      const response = await fetch(`/api/posts/${post.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) {
        setError((body.error as string) ?? "Publishing failed");
        if (Array.isArray(body.blocks)) setChecks({ blocks: body.blocks as Block[], notes: [], ready: false });
        return;
      }
      setSteps((body.steps as string[]) ?? []);
      onPublished(body.post as Post, body.etag as string);
    } catch {
      setError("Publishing failed before it reached Instagram.");
    } finally {
      setBusy(false);
    }
  }

  if (post.status === "posted") {
    return (
      <div>
        <h3 style={{ marginBottom: 10 }}>Live</h3>
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Posted {relativeTime(post.published?.postedAt)}
            {post.published?.mediaId ? ` · media ${post.published.mediaId}` : ""}
          </div>
          {post.published?.permalink ? (
            <a href={post.published.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              Open on Instagram
            </a>
          ) : null}
        </div>

        <div className="section__head">
          <h2>Numbers</h2>
          <span className="muted">{insights ? `updated ${relativeTime(insights.fetchedAt as string)}` : "not pulled yet"}</span>
        </div>
        {insights ? (
          <div className="goal" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {Object.entries(METRIC_LABEL)
              .filter(([key]) => typeof insights[key] === "number")
              .map(([key, label]) => (
                <div className="goal__cell" key={key}>
                  <div className="goal__value mono" style={{ fontSize: 24 }}>
                    {(insights[key] as number).toLocaleString("en-IN")}
                  </div>
                  <div className="goal__label">{label}</div>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted">
            Run <code>npm run insights</code>, or hit sync on the Publishing page, and the saves, shares and reach land here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>Publish to Instagram</h3>
      {!checks ? <p className="muted">Running the checks…</p> : null}

      {checks && checks.blocks.length > 0 ? (
        <div className="queue" style={{ marginBottom: 16 }}>
          {checks.blocks.map((block, i) => (
            <div className="issue issue--error" key={i} style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <span>{block.message}</span>
              {block.fix ? <span className="muted">{block.fix}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {checks && checks.notes.length > 0 ? (
        <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, marginBottom: 16 }}>
          {checks.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      ) : null}

      {steps.length > 0 ? (
        <div className="panel mono" style={{ fontSize: 12.5, marginBottom: 16 }}>
          {steps.map((step, i) => (
            <div key={i}>{step}</div>
          ))}
        </div>
      ) : null}

      {error ? <div className="issue issue--error" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="row">
        <button className="btn btn--go" disabled={!checks?.ready || busy} onClick={() => void publish()}>
          {busy ? "Publishing…" : "Publish now"}
        </button>
        <button className="btn btn--ghost btn--small" onClick={() => setNonce((n) => n + 1)} disabled={busy}>
          Re-check
        </button>
        <a className="btn btn--small" href={`/api/posts/${post.id}/export`}>
          Download the pack instead
        </a>
      </div>
    </div>
  );
}
