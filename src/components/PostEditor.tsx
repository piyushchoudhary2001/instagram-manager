"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { label12h, labelDay, relativeTime } from "@/lib/dates";
import {
  FORMATS,
  MAX_CAPTION,
  TEMPLATES,
  type Config,
  type Fact,
  type Post,
  type Slide,
  type Template,
  newSlide,
} from "@/lib/schema";
import { STATUS_HINT, STATUS_LABEL, nextStatuses, reviewIssues, type Issue } from "@/lib/status";
import { PublishTab } from "./PublishTab";
import { ReelPanel } from "./ReelPanel";
import { SlideFields } from "./SlideFields";
import { StatusChip } from "./StatusChip";
import { SelectField, TextArea, TextField } from "./fields";

type Tab = "review" | "slides" | "caption" | "script" | "publish" | "details";

const TABS: { id: Tab; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "slides", label: "Slides" },
  { id: "caption", label: "Caption" },
  { id: "script", label: "Script" },
  { id: "publish", label: "Publish" },
  { id: "details", label: "Details" },
];

const svgSrc = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export function PostEditor({
  initialPost,
  initialEtag,
  config,
  iconNames,
}: {
  initialPost: Post;
  initialEtag: string;
  config: Config;
  iconNames: string[];
}) {
  const router = useRouter();
  const [post, setPost] = useState<Post>(initialPost);
  const [saved, setSaved] = useState<Post>(initialPost);
  const [etag, setEtag] = useState(initialEtag);
  const [tab, setTab] = useState<Tab>(initialPost.format === "reel" && initialPost.slides.length === 0 ? "script" : "review");
  // -1 is the reel cover; a reel with no slides opens on it.
  const [current, setCurrent] = useState(initialPost.slides.length > 0 ? 0 : -1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ post: Post; etag: string } | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(() => JSON.stringify(post) !== JSON.stringify(saved), [post, saved]);
  const issues = useMemo(() => reviewIssues(post, config), [post, config]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const slides: Slide[] = post.slides;
  const coverSlide = post.reel?.cover;
  const stageSlide: Slide | undefined = current === -1 ? coverSlide : slides[current];

  /* live preview of whatever is on screen, saved or not */
  useEffect(() => {
    if (!stageSlide) {
      setPreviewSvg(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const slide = stageSlide;
    const index = current === -1 ? 0 : current;
    const total = current === -1 ? 1 : slides.length;
    const reelCover = current === -1;
    timer.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slide, index, total, reelCover }),
        });
        const data = await response.json();
        if (response.ok) setPreviewSvg(data.svg as string);
      } catch {
        /* keep the last good frame */
      } finally {
        setPreviewing(false);
      }
    }, 320);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stageSlide, current, slides.length]);

  const patch = useCallback((changes: Partial<Post>) => setPost((previous) => ({ ...previous, ...changes })), []);

  const updateSlide = (index: number, slide: Slide) => {
    if (index === -1) {
      if (!post.reel) return;
      patch({ reel: { ...post.reel, cover: slide } });
      return;
    }
    const next = [...post.slides];
    next[index] = slide;
    patch({ slides: next });
  };

  async function save(): Promise<boolean> {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post, ifMatch: etag }),
      });
      const data = await response.json();
      if (response.status === 409) {
        setConflict({ post: data.latest as Post, etag: data.etag as string });
        setMessage({ kind: "error", text: "This post changed on disk while you were editing." });
        return false;
      }
      if (!response.ok) {
        setMessage({ kind: "error", text: (data.error as string) ?? "Could not save" });
        return false;
      }
      setPost(data.post as Post);
      setSaved(data.post as Post);
      setEtag(data.etag as string);
      setVersion((v) => v + 1);
      setMessage({ kind: "ok", text: "Saved to content/posts." });
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function move(status: string, extra: Record<string, unknown> = {}) {
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy(status);
    setMessage(null);
    try {
      const response = await fetch(`/api/posts/${post.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ifMatch: etag, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(data.issues) ? ` ${(data.issues as Issue[]).map((i) => i.message).join(" ")}` : "";
        setMessage({ kind: "error", text: `${(data.error as string) ?? "Could not update"}${detail}` });
        return;
      }
      setPost(data.post as Post);
      setSaved(data.post as Post);
      setEtag(data.etag as string);
      setVersion((v) => v + 1);
      setMessage({ kind: "ok", text: `Moved to ${STATUS_LABEL[(data.post as Post).status]}.` });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function requestChanges() {
    const note = window.prompt("What should change? Claude picks this up from the post's history.");
    if (note === null) return;
    void move("changes_requested", { note });
  }

  function markPosted() {
    const permalink = window.prompt("Permalink (optional) — paste the Instagram link if you have it.") ?? "";
    void move("posted", permalink ? { permalink } : {});
  }

  const canApprove = errors.length === 0;

  return (
    <>
      <div className="section" style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Link className="eyebrow" href="/">
              ← Calendar
            </Link>
            <h1 style={{ marginTop: 8, maxWidth: "22ch" }}>{post.title}</h1>
            <p className="lede" style={{ marginTop: 8 }}>
              {post.date ? labelDay(post.date) : "No date"}
              {post.time ? ` · ${label12h(post.time)} IST` : ""} · {post.format} · {post.pillar}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <StatusChip status={post.status} />
            <div className="muted" style={{ fontSize: 12, marginTop: 8, maxWidth: "28ch" }}>
              {STATUS_HINT[post.status]}
            </div>
          </div>
        </div>
      </div>

      {conflict ? (
        <div className="issue issue--error" style={{ marginBottom: 16, flexDirection: "column", alignItems: "flex-start" }}>
          <strong>The file changed while you were editing.</strong>
          <span>
            Claude may have drafted into it, or you pulled a change. Keep yours and overwrite, or take the version on disk and lose
            your edits.
          </span>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn btn--small"
              onClick={() => {
                setEtag(conflict.etag);
                setConflict(null);
                void save();
              }}
            >
              Keep mine
            </button>
            <button
              className="btn btn--small btn--ghost"
              onClick={() => {
                setPost(conflict.post);
                setSaved(conflict.post);
                setEtag(conflict.etag);
                setConflict(null);
                setVersion((v) => v + 1);
              }}
            >
              Take the file
            </button>
          </div>
        </div>
      ) : null}

      <div className="editor">
        <div className="stage">
          <div className="stage__frame">
            {previewSvg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgSrc(previewSvg)} alt={stageSlide?.alt ?? "Slide preview"} />
            ) : (
              <div className="empty" style={{ border: "none" }}>
                {post.format === "reel"
                  ? "No cover frame yet. Add one in the Script tab to design the thumbnail."
                  : "No slides yet. Add one in the Slides tab."}
              </div>
            )}
          </div>
          <div className="filmstrip">
            {coverSlide ? (
              <button type="button" aria-pressed={current === -1} onClick={() => setCurrent(-1)} title="Reel cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/posts/${post.id}/preview/0?cover=1&v=${version}`} alt="Reel cover" />
              </button>
            ) : null}
            {slides.map((slide, i) => (
              <button key={i} type="button" aria-pressed={current === i} onClick={() => setCurrent(i)} title={`${i + 1}. ${slide.template}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/posts/${post.id}/preview/${i}?v=${version}`} alt={`Slide ${i + 1}`} />
              </button>
            ))}
          </div>
          <div className="row muted" style={{ fontSize: 12, justifyContent: "space-between" }}>
            <span>
              {current === -1
                ? "Reel cover · 1080 × 1920"
                : slides.length === 0
                  ? "Nothing to show yet"
                  : `Slide ${current + 1} of ${slides.length} · 1080 × 1350`}
              {previewing ? " · rendering…" : ""}
            </span>
            <a href={`/api/posts/${post.id}/export`} className="muted">
              Download the pack ↓
            </a>
          </div>
        </div>

        <div>
          <div className="tabs" role="tablist">
            {TABS.filter((t) => {
              if (t.id === "script") return post.format === "reel";
              if (t.id === "publish") return post.status === "approved" || post.status === "scheduled" || post.status === "posted";
              return true;
            }).map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "review" && errors.length > 0 ? ` (${errors.length})` : ""}
              </button>
            ))}
          </div>

          {tab === "review" ? (
            <ReviewTab
              post={post}
              errors={errors}
              warnings={warnings}
              onFactChange={(index, fact) => {
                const facts = [...post.facts];
                facts[index] = fact;
                patch({ facts });
              }}
              onJumpToSlide={(index) => {
                setCurrent(index);
                setTab("slides");
              }}
            />
          ) : null}

          {tab === "slides" ? (
            <div>
              <div className="slide-list" style={{ marginBottom: 16 }}>
                {slides.map((slide, i) => (
                  <button key={i} className="slide-list__item" aria-pressed={current === i} onClick={() => setCurrent(i)}>
                    <span className="mono muted">{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{slide.title ?? slide.stat?.value ?? slide.kicker ?? slide.template}</strong>
                      <span className="muted"> · {slide.template}</span>
                    </span>
                    <span className="row">
                      <span
                        role="button"
                        tabIndex={0}
                        className="btn btn--small btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (i === 0) return;
                          const next = [...slides];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          patch({ slides: next });
                          setCurrent(i - 1);
                        }}
                        onKeyDown={() => undefined}
                      >
                        ↑
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="btn btn--small btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (i === slides.length - 1) return;
                          const next = [...slides];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          patch({ slides: next });
                          setCurrent(i + 1);
                        }}
                        onKeyDown={() => undefined}
                      >
                        ↓
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="btn btn--small btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          patch({ slides: slides.filter((_, index) => index !== i) });
                          setCurrent(Math.max(0, current - 1));
                        }}
                        onKeyDown={() => undefined}
                      >
                        ✕
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginBottom: 20 }}>
                <select
                  className="select"
                  style={{ width: 200 }}
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    patch({ slides: [...slides, newSlide(e.target.value as Template)] });
                    setCurrent(slides.length);
                    setTab("slides");
                    e.target.value = "";
                  }}
                >
                  <option value="">Add a slide…</option>
                  {TEMPLATES.map((template) => (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  ))}
                </select>
              </div>
              {stageSlide ? (
                <SlideFields slide={stageSlide} iconNames={iconNames} onChange={(slide) => updateSlide(current, slide)} />
              ) : (
                <p className="muted">Pick a slide to edit it.</p>
              )}
            </div>
          ) : null}

          {tab === "caption" ? (
            <div>
              <TextArea
                label="Caption"
                rows={8}
                value={post.caption}
                hint={`${post.caption.length} / ${MAX_CAPTION}`}
                onChange={(caption) => patch({ caption })}
              />
              <TextField
                label="Hashtags"
                value={post.hashtags.join(" ")}
                hint={`${post.hashtags.length} · ${config.hashtagLimits.min}–${config.hashtagLimits.max} works best`}
                onChange={(value) =>
                  patch({
                    hashtags: value
                      .split(/[\s,]+/)
                      .filter(Boolean)
                      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
                  })
                }
              />
              <TextArea label="Alt text" rows={3} value={post.altText ?? ""} onChange={(altText) => patch({ altText })} />
              <TextField label="Hook" value={post.hook} onChange={(hook) => patch({ hook })} />
              <TextField label="Call to action" value={post.cta} onChange={(cta) => patch({ cta })} />
            </div>
          ) : null}

          {tab === "script" && post.format === "reel" ? (
            <ScriptTab
              post={post}
              iconNames={iconNames}
              onChange={patch}
              onEditCover={() => {
                setCurrent(-1);
                setTab("slides");
              }}
            />
          ) : null}

          {tab === "publish" ? (
            <PublishTab
              post={post}
              onPublished={(next, nextEtag) => {
                setPost(next);
                setSaved(next);
                setEtag(nextEtag);
                setVersion((v) => v + 1);
                setMessage({ kind: "ok", text: "Published." });
                router.refresh();
              }}
            />
          ) : null}

          {tab === "details" ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="Date" value={post.date ?? ""} hint="YYYY-MM-DD" onChange={(date) => patch({ date: date || null })} />
                <TextField label="Time" value={post.time ?? ""} hint="HH:MM, IST" onChange={(time) => patch({ time: time || null })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <SelectField
                  label="Format"
                  value={post.format}
                  options={FORMATS.map((format) => ({ value: format, label: format }))}
                  onChange={(format) => patch({ format: format as Post["format"] })}
                />
                <SelectField
                  label="Pillar"
                  value={post.pillar}
                  options={config.pillars.map((pillar) => ({ value: pillar.id, label: pillar.name }))}
                  onChange={(pillar) => patch({ pillar })}
                />
              </div>
              <TextField label="Title" value={post.title} onChange={(title) => patch({ title })} />
              <TextArea label="Notes" rows={4} value={post.notes} hint="for you and Claude; never posted" onChange={(notes) => patch({ notes })} />
              <div className="field__label" style={{ marginTop: 20 }}>
                History
              </div>
              <div className="history">
                {[...post.history].reverse().map((entry, i) => (
                  <div className="history__row" key={i}>
                    <span className="muted mono">{relativeTime(entry.at)}</span>
                    <span>
                      <strong>{entry.by}</strong> {entry.action}
                      {entry.note ? <span className="muted"> — {entry.note}</span> : null}
                    </span>
                  </div>
                ))}
                {post.history.length === 0 ? <span className="muted">Nothing yet.</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 20 }}>
                <code>content/posts/{post.id}.json</code>
              </div>
            </div>
          ) : null}

          <div className="toolbar">
            <button className="btn btn--primary" disabled={!dirty || busy !== null} onClick={() => void save()}>
              {busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
            {post.status !== "approved" && post.status !== "posted" ? (
              <button
                className="btn btn--go"
                disabled={!canApprove || busy !== null}
                title={canApprove ? "Sign this off" : "Fix the blocking issues first"}
                onClick={() => void move("approved")}
              >
                {busy === "approved" ? "Approving…" : "Approve"}
              </button>
            ) : null}
            {post.status === "in_review" || post.status === "approved" ? (
              <button className="btn" disabled={busy !== null} onClick={requestChanges}>
                Request changes
              </button>
            ) : null}
            {post.status === "approved" || post.status === "scheduled" ? (
              <button className="btn" disabled={busy !== null} onClick={markPosted}>
                Mark posted
              </button>
            ) : null}
            {nextStatuses(post.status).includes("in_review") && post.status !== "in_review" ? (
              <button className="btn btn--ghost" disabled={busy !== null} onClick={() => void move("in_review")}>
                Send to review
              </button>
            ) : null}
            {message ? (
              <span className={message.kind === "error" ? "issue issue--error" : "muted"} style={{ fontSize: 13 }}>
                {message.text}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- review tab */

function ReviewTab({
  post,
  errors,
  warnings,
  onFactChange,
  onJumpToSlide,
}: {
  post: Post;
  errors: Issue[];
  warnings: Issue[];
  onFactChange: (index: number, fact: Fact) => void;
  onJumpToSlide: (index: number) => void;
}) {
  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>
        {errors.length === 0 ? "Nothing is blocking this." : `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix first`}
      </h3>
      <div className="queue">
        {errors.map((issue, i) => (
          <div
            key={`e${i}`}
            className="issue issue--error"
            onClick={() => (issue.slide !== undefined ? onJumpToSlide(issue.slide) : undefined)}
          >
            <span>{issue.message}</span>
          </div>
        ))}
        {warnings.map((issue, i) => (
          <div key={`w${i}`} className="issue issue--warning">
            <span>{issue.message}</span>
          </div>
        ))}
        {errors.length === 0 && warnings.length === 0 ? <div className="muted">Caption, slides and facts all check out.</div> : null}
      </div>

      <div className="section" style={{ marginTop: 28 }}>
        <div className="section__head">
          <h2>Facts</h2>
          <span className="muted">Approval waits until nothing is left to check.</span>
        </div>
        {post.facts.length === 0 ? <p className="muted">No factual claims flagged on this one.</p> : null}
        {post.facts.map((fact, i) => (
          <div className="fact" key={fact.id ?? i}>
            <div className="fact__claim">{fact.claim}</div>
            {fact.note ? <div className="fact__meta">{fact.note}</div> : null}
            <div className="fact__meta">
              {fact.source ? <span>{fact.source}</span> : <span>No source yet</span>}
              {fact.url ? (
                <>
                  {" · "}
                  <a href={fact.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                    link
                  </a>
                </>
              ) : null}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {(["needs_check", "sourced", "verified"] as const).map((status) => (
                <button
                  key={status}
                  className={`btn btn--small${fact.status === status ? " btn--primary" : " btn--ghost"}`}
                  onClick={() => onFactChange(i, { ...fact, status })}
                >
                  {status === "needs_check" ? "Still to check" : status === "sourced" ? "Has a source" : "Verified"}
                </button>
              ))}
              <input
                className="input"
                style={{ flex: 1, height: 32 }}
                placeholder="Source URL"
                value={fact.url ?? ""}
                onChange={(e) => onFactChange(i, { ...fact, url: e.target.value || undefined })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Caption as it will post</h2>
        </div>
        <div className="panel" style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
          {post.caption || <span className="muted">No caption yet.</span>}
          {post.hashtags.length ? <div style={{ marginTop: 12, color: "var(--text-info)" }}>{post.hashtags.join(" ")}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- script tab */

function ScriptTab({
  post,
  iconNames,
  onChange,
  onEditCover,
}: {
  post: Post;
  iconNames: string[];
  onChange: (changes: Partial<Post>) => void;
  onEditCover: () => void;
}) {
  const reel = post.reel ?? { hook: "", beats: [], audio: "", captionsLanguage: "en" as const, footage: [] };
  const set = (changes: Partial<typeof reel>) => onChange({ reel: { ...reel, ...changes } });
  return (
    <div>
      <TextField label="Hook (the first three seconds)" value={reel.hook} onChange={(hook) => set({ hook })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <TextField label="Audio" value={reel.audio} hint="trending track or voiceover" onChange={(audio) => set({ audio })} />
        <SelectField
          label="Captions"
          value={reel.captionsLanguage}
          options={[
            { value: "en", label: "English" },
            { value: "hinglish", label: "Hinglish" },
            { value: "hi", label: "Hindi" },
          ]}
          onChange={(value) => set({ captionsLanguage: value as typeof reel.captionsLanguage })}
        />
      </div>

      <div className="field__label" style={{ marginTop: 10 }}>
        Beats
      </div>
      <table className="beats">
        <thead>
          <tr>
            <th style={{ width: 86 }}>Time</th>
            <th>On screen</th>
            <th>Voiceover</th>
            <th style={{ width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {reel.beats.map((beat, i) => (
            <tr key={i}>
              <td>
                <input
                  className="input"
                  value={beat.time}
                  onChange={(e) => {
                    const beats = [...reel.beats];
                    beats[i] = { ...beat, time: e.target.value };
                    set({ beats });
                  }}
                />
              </td>
              <td>
                <textarea
                  className="textarea"
                  style={{ minHeight: 56 }}
                  value={beat.onScreen}
                  onChange={(e) => {
                    const beats = [...reel.beats];
                    beats[i] = { ...beat, onScreen: e.target.value };
                    set({ beats });
                  }}
                />
              </td>
              <td>
                <textarea
                  className="textarea"
                  style={{ minHeight: 56 }}
                  value={beat.voiceover}
                  onChange={(e) => {
                    const beats = [...reel.beats];
                    beats[i] = { ...beat, voiceover: e.target.value };
                    set({ beats });
                  }}
                />
              </td>
              <td>
                <button
                  className="btn btn--small btn--ghost"
                  onClick={() => set({ beats: reel.beats.filter((_, index) => index !== i) })}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn btn--small"
        style={{ marginTop: 10 }}
        onClick={() => set({ beats: [...reel.beats, { time: "", onScreen: "", voiceover: "" }] })}
      >
        Add a beat
      </button>

      <TextArea
        label="Footage needed"
        rows={4}
        hint="one per line"
        value={reel.footage.join("\n")}
        onChange={(value) => set({ footage: value.split("\n").filter((line) => line.trim()) })}
      />

      <div className="row" style={{ marginTop: 12 }}>
        {reel.cover ? (
          <button className="btn btn--small" onClick={onEditCover}>
            Edit the cover frame
          </button>
        ) : (
          <button
            className="btn btn--small"
            onClick={() => set({ cover: { ...newSlide("cover"), title: reel.hook || post.hook || post.title } })}
          >
            Add a cover frame
          </button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          1080 × 1920, with the words held inside the top 1440 px so the grid crop does not cut them.
        </span>
      </div>
      <input type="hidden" value={iconNames.length} readOnly />

      <div style={{ marginTop: 32, borderTop: "1px solid var(--border-default)", paddingTop: 8 }}>
        <ReelPanel postId={post.id} />
      </div>
    </div>
  );
}
