"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/dates";

interface PlannedBeatView {
  index: number;
  start: number;
  end: number;
  onScreen: string;
  source: string | null;
  kind: "video" | "image" | "missing";
}

interface ReelPlanView {
  plan: {
    clipsDir: string;
    duration: number;
    music: string | null;
    voiceover: string | null;
    unused: string[];
    beats: PlannedBeatView[];
  };
  built: { at: string; bytes: number } | null;
  ffmpeg: boolean;
  command: string;
}

/**
 * The bridge between the script and the footage: which clip lands on which beat, what is
 * missing, and the cut itself once it is built.
 */
export function ReelPanel({ postId }: { postId: string }) {
  const [data, setData] = useState<ReelPlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/posts/${postId}/reel`)
      .then(async (response) => {
        const body = await response.json();
        if (!live) return;
        if (response.ok) setData(body as ReelPlanView);
        else setError((body.error as string) ?? "Could not read the plan");
      })
      .catch(() => live && setError("Could not read the plan"));
    return () => {
      live = false;
    };
  }, [postId, nonce]);

  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Looking at the footage folder…</p>;

  const { plan, built } = data;
  const missing = plan.beats.filter((beat) => beat.kind === "missing").length;

  return (
    <div>
      <div className="section__head" style={{ marginTop: 8 }}>
        <h2>The cut</h2>
        <button className="btn btn--small btn--ghost" onClick={() => setNonce((n) => n + 1)}>
          Re-check the folder
        </button>
      </div>

      {built ? (
        <div style={{ marginBottom: 16 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={`/api/posts/${postId}/reel/file?v=${built.at}`}
            controls
            playsInline
            style={{ width: "100%", maxWidth: 300, borderRadius: 16, border: "1px solid var(--border-default)", display: "block" }}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Built {relativeTime(built.at)} · {(built.bytes / 1e6).toFixed(1)} MB · {plan.duration.toFixed(0)}s
          </div>
        </div>
      ) : null}

      <div className="slide-list" style={{ marginBottom: 14 }}>
        {plan.beats.map((beat) => (
          <div className="slide-list__item" key={beat.index} style={{ cursor: "default" }}>
            <span className="mono muted">{String(beat.index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{beat.source ?? "No clip for this beat"}</strong>
              <span className="muted"> · {beat.onScreen.slice(0, 52) || "no words on screen"}</span>
            </span>
            <span className="muted mono" style={{ fontSize: 12 }}>
              {(beat.end - beat.start).toFixed(1)}s
            </span>
          </div>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 13, display: "grid", gap: 4, marginBottom: 16 }}>
        <span>
          Clips from <code>{plan.clipsDir}</code>
        </span>
        <span>
          Music: {plan.music ?? "none"} · Voiceover: {plan.voiceover ?? "none"}
        </span>
        {plan.unused.length ? <span>Not used: {plan.unused.join(", ")}</span> : null}
        {missing > 0 ? (
          <span style={{ color: "var(--text-warning)" }}>
            {missing} beat{missing === 1 ? "" : "s"} without footage — each gets a placeholder card until you drop a clip in.
          </span>
        ) : null}
        {!data.ffmpeg ? <span style={{ color: "var(--text-error)" }}>ffmpeg is not installed, so the build will not run yet.</span> : null}
      </div>

      <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <code style={{ fontSize: 13 }}>{data.command}</code>
        <button
          className="btn btn--small"
          onClick={() => {
            void navigator.clipboard?.writeText(data.command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Name a clip after its beat — <code>03-paddle.mp4</code> — to pin it there. Add <code>--plan</code> to see the mapping without
        building, or <code>--grade none</code> to skip the colour pass.
      </p>
    </div>
  );
}
