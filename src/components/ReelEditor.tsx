"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Beat, Post } from "@/lib/schema";

/**
 * The reel editor.
 *
 * A row per beat — the shot, which clip, where it starts, how long it runs, and the words
 * on screen — then a build that happens here rather than in a terminal. The script and the
 * edit are the same thing, so changing a duration rewrites the beat's time and the cut
 * follows.
 */

interface MediaFile {
  name: string;
  kind: "video" | "image" | "audio";
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

interface PlanBeat {
  index: number;
  start: number;
  end: number;
  source: string | null;
  kind: "video" | "image" | "missing";
}

interface Job {
  state: "running" | "done" | "failed";
  step: string;
  progress: number;
  warnings: string[];
  error?: string;
  duration?: number;
  finishedAt?: string;
}

const GRADES = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "none", label: "No grade" },
];

/** Beat times are written back from the durations, so the script and the cut never disagree. */
function retime(beats: Beat[], durations: number[]): Beat[] {
  let cursor = 0;
  return beats.map((beat, i) => {
    const length = Math.max(0.4, Math.round((durations[i] ?? 3) * 10) / 10);
    const start = Math.round(cursor * 10) / 10;
    const end = Math.round((cursor + length) * 10) / 10;
    cursor = end;
    const tidy = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return { ...beat, time: `${tidy(start)}–${tidy(end)} s` };
  });
}

export function ReelEditor({ post, onChange }: { post: Post; onChange: (changes: Partial<Post>) => void }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [planBeats, setPlanBeats] = useState<PlanBeat[]>([]);
  const [built, setBuilt] = useState<{ at: string; bytes: number } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [ffmpeg, setFfmpeg] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [grade, setGrade] = useState("warm");
  const [captions, setCaptions] = useState(true);
  const [nonce, setNonce] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reel = post.reel;
  const beats = reel?.beats ?? [];
  const clips = files.filter((f) => f.kind !== "audio");
  const audio = files.filter((f) => f.kind === "audio");

  const refresh = useCallback(async () => {
    const [mediaRes, planRes] = await Promise.all([
      fetch(`/api/posts/${post.id}/media`).then((r) => r.json()),
      fetch(`/api/posts/${post.id}/reel`).then((r) => r.json()),
    ]);
    setFiles((mediaRes.files as MediaFile[]) ?? []);
    if (planRes.plan) setPlanBeats(planRes.plan.beats as PlanBeat[]);
    setBuilt((planRes.built as { at: string; bytes: number } | null) ?? null);
    setFfmpeg(Boolean(planRes.ffmpeg));
  }, [post.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, nonce]);

  // Follow a build that is already running (a reload, or a second tab).
  useEffect(() => {
    let live = true;
    fetch(`/api/posts/${post.id}/reel/build`)
      .then((r) => r.json())
      .then((body) => {
        if (live && body.job) {
          setJob(body.job as Job);
          if ((body.job as Job).state === "running") startPolling();
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const body = await fetch(`/api/posts/${post.id}/reel/build`).then((r) => r.json());
      const next = body.job as Job | null;
      setJob(next);
      if (next && next.state !== "running") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setNonce((n) => n + 1);
      }
    }, 1500);
  }

  function setBeats(next: Beat[]) {
    if (!reel) return;
    onChange({ reel: { ...reel, beats: next } });
  }

  function patchBeat(index: number, changes: Partial<Beat>) {
    const next = [...beats];
    next[index] = { ...next[index], ...changes };
    setBeats(next);
  }

  function setDuration(index: number, seconds: number) {
    const durations = beats.map((b, i) => (i === index ? seconds : lengthOf(i)));
    setBeats(retime(beats, durations));
  }

  function lengthOf(index: number): number {
    const planned = planBeats.find((b) => b.index === index);
    return planned ? Math.round((planned.end - planned.start) * 10) / 10 : 3;
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= beats.length) return;
    const next = [...beats];
    [next[index], next[target]] = [next[target], next[index]];
    setBeats(retime(next, next.map((_, i) => lengthOf(i === index ? target : i === target ? index : i))));
  }

  /** Fills each empty beat with the clip the cutter would have picked, so the mapping is visible. */
  function autoAssign() {
    const next = beats.map((beat, i) => {
      if (beat.clip) return beat;
      const planned = planBeats.find((b) => b.index === i);
      return planned?.source ? { ...beat, clip: planned.source } : beat;
    });
    setBeats(next);
  }

  async function upload(list: FileList | File[]) {
    const items = Array.from(list);
    if (items.length === 0) return;
    setBusy("upload");
    try {
      for (const file of items) {
        const name = encodeURIComponent(file.name);
        const response = await fetch(`/api/posts/${post.id}/media/${name}`, { method: "PUT", body: file });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          window.alert(`${file.name}: ${(body.error as string) ?? "upload failed"}`);
        }
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function removeFile(name: string) {
    if (!window.confirm(`Delete ${name} from this post's footage?`)) return;
    await fetch(`/api/posts/${post.id}/media/${encodeURIComponent(name)}`, { method: "DELETE" });
    await refresh();
  }

  async function build() {
    setBusy("build");
    try {
      const response = await fetch(`/api/posts/${post.id}/reel/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, captions }),
      });
      const body = await response.json();
      setJob(body.job as Job);
      if ((body.job as Job)?.state === "running") startPolling();
    } finally {
      setBusy(null);
    }
  }

  if (!reel) return <p className="muted">This post has no reel script yet.</p>;

  const missing = beats.filter((_, i) => !(beats[i].clip ?? planBeats.find((b) => b.index === i)?.source)).length;
  const totalLength = beats.reduce((sum, _, i) => sum + lengthOf(i), 0);

  return (
    <div>
      <div className="section__head" style={{ marginTop: 4 }}>
        <h2>The cut</h2>
        <span className="muted">
          {beats.length} beats · {totalLength.toFixed(0)}s
          {missing > 0 ? ` · ${missing} without footage` : ""}
        </span>
      </div>

      {/* footage */}
      <div
        className={`dropzone${dragging ? " dropzone--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy === "upload" ? "Uploading…" : "Drop clips, stills, music or a voiceover here — or click to choose"}
      </div>

      {files.length > 0 ? (
        <div className="clips">
          {clips.map((file) => (
            <figure className="clip" key={file.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/posts/${post.id}/media/${encodeURIComponent(file.name)}?thumb=1&t=0.5`} alt="" />
              <figcaption>
                <span className="clip__name" title={file.name}>
                  {file.name}
                </span>
                <span className="muted">
                  {file.duration ? `${file.duration}s` : "still"} · {(file.bytes / 1e6).toFixed(1)} MB
                </span>
              </figcaption>
              <button className="clip__remove" onClick={() => void removeFile(file.name)} title="Remove">
                ✕
              </button>
            </figure>
          ))}
        </div>
      ) : null}

      {audio.length > 0 ? (
        <div className="row" style={{ gap: 16, margin: "14px 0 4px", flexWrap: "wrap" }}>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <span className="muted">Music</span>
            <select
              className="select select--compact"
              style={{ width: 180 }}
              value={reel.music ?? ""}
              onChange={(e) => onChange({ reel: { ...reel, music: e.target.value || undefined } })}
            >
              <option value="">auto by name</option>
              {audio.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <span className="muted">Voiceover</span>
            <select
              className="select select--compact"
              style={{ width: 180 }}
              value={reel.voiceover ?? ""}
              onChange={(e) => onChange({ reel: { ...reel, voiceover: e.target.value || undefined } })}
            >
              <option value="">auto by name</option>
              {audio.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {/* beats */}
      <div className="beatlist">
        {beats.map((beat, i) => {
          const planned = planBeats.find((b) => b.index === i);
          const clip = beat.clip ?? planned?.source ?? "";
          const length = lengthOf(i);
          return (
            <div className="beatrow" key={i}>
              <div className="beatrow__shot">
                {clip ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/posts/${post.id}/media/${encodeURIComponent(clip)}?thumb=1&t=${(beat.clipStart ?? 0) + 0.3}`}
                    alt=""
                  />
                ) : (
                  <span className="beatrow__empty">no clip</span>
                )}
                <span className="beatrow__num">{i + 1}</span>
              </div>

              <div className="beatrow__body">
                <input
                  className="input"
                  value={beat.onScreen}
                  placeholder="Words on screen"
                  onChange={(e) => patchBeat(i, { onScreen: e.target.value })}
                />
                <input
                  className="input beatrow__vo"
                  value={beat.voiceover}
                  placeholder="Voiceover line"
                  onChange={(e) => patchBeat(i, { voiceover: e.target.value })}
                />
              </div>

              <div className="beatrow__controls">
                <select
                  className="select"
                  value={beat.clip ?? ""}
                  onChange={(e) => patchBeat(i, { clip: e.target.value || undefined })}
                  title="Which clip"
                >
                  <option value="">{planned?.source ? `auto · ${planned.source}` : "— no clip —"}</option>
                  {clips.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <label className="beatrow__field" title="Seconds into the clip to start from">
                  <span>from</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.5}
                    value={beat.clipStart ?? 0}
                    onChange={(e) => patchBeat(i, { clipStart: Number(e.target.value) || undefined })}
                  />
                </label>
                <label className="beatrow__field" title="How long this beat runs">
                  <span>for</span>
                  <input
                    className="input"
                    type="number"
                    min={0.4}
                    step={0.5}
                    value={length}
                    onChange={(e) => setDuration(i, Number(e.target.value))}
                  />
                </label>
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn btn--small btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Earlier">
                    ↑
                  </button>
                  <button
                    className="btn btn--small btn--ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === beats.length - 1}
                    title="Later"
                  >
                    ↓
                  </button>
                  <button
                    className="btn btn--small btn--ghost"
                    onClick={() => setBeats(retime(beats.filter((_, index) => index !== i), beats.filter((_, index) => index !== i).map((_, index) => lengthOf(index < i ? index : index + 1))))}
                    title="Remove this beat"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 10 }}>
        <button
          className="btn btn--small"
          onClick={() => setBeats(retime([...beats, { time: "", onScreen: "", voiceover: "" }], [...beats.map((_, i) => lengthOf(i)), 3]))}
        >
          Add a beat
        </button>
        {clips.length > 0 && beats.some((b) => !b.clip) ? (
          <button className="btn btn--small" onClick={autoAssign}>
            Assign clips to beats
          </button>
        ) : null}
        <span className="muted" style={{ fontSize: 12 }}>
          Changing a length re-times the whole script.
        </span>
      </div>

      {/* build */}
      <div className="buildbar">
        <label className="row" style={{ gap: 8, fontSize: 13 }}>
          <span className="muted">Grade</span>
          <select className="select select--compact" style={{ width: 130 }} value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="row" style={{ gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
          <span className="muted">Burn in the captions</span>
        </label>
        <button
          className="btn btn--go"
          disabled={!ffmpeg || job?.state === "running" || busy !== null || beats.length === 0}
          onClick={() => void build()}
        >
          {job?.state === "running" ? "Cutting…" : built ? "Build again" : "Build the cut"}
        </button>
        {!ffmpeg ? (
          <span className="muted" style={{ fontSize: 12, color: "var(--text-error)" }}>
            ffmpeg is not installed — brew install ffmpeg
          </span>
        ) : null}
      </div>

      {job ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
            <span>{job.step}</span>
            {job.duration ? <span className="muted mono">{job.duration.toFixed(1)}s</span> : null}
          </div>
          {job.state === "running" ? (
            <div className="bar" style={{ marginTop: 10 }}>
              <div className="bar__fill" style={{ width: `${Math.max(4, Math.round(job.progress * 100))}%` }} />
            </div>
          ) : null}
          {job.error ? <div className="issue issue--error" style={{ marginTop: 10 }}>{job.error}</div> : null}
          {job.warnings.map((warning, i) => (
            <div className="issue issue--warning" style={{ marginTop: 8 }} key={i}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      {built ? (
        <div style={{ marginTop: 16 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            key={built.at}
            src={`/api/posts/${post.id}/reel/file?v=${built.at}`}
            controls
            playsInline
            style={{ width: "100%", maxWidth: 280, borderRadius: 16, border: "1px solid var(--border-default)", display: "block" }}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {(built.bytes / 1e6).toFixed(1)} MB · exports/{post.id}/reel.mp4 · add the trending track in Instagram before posting
          </div>
        </div>
      ) : null}
    </div>
  );
}
