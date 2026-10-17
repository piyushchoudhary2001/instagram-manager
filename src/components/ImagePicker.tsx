"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MediaFile {
  name: string;
  kind: "video" | "image" | "audio";
  bytes: number;
  width?: number;
  height?: number;
}

/**
 * Pictures for a slide.
 *
 * Photos live with the post, in content/media/<post-id>/, the same folder the reel cutter
 * uses. Drop one here and it becomes the slide's background, with the scrim and the white
 * type handled by the renderer.
 */
export function ImagePicker({
  postId,
  value,
  onChange,
}: {
  postId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await fetch(`/api/posts/${postId}/media`).then((r) => r.json());
      setFiles(((body.files as MediaFile[]) ?? []).filter((f) => f.kind === "image"));
    } catch {
      setFiles([]);
    }
  }, [postId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(list: FileList | File[]) {
    const items = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (items.length === 0) return;
    setBusy(true);
    try {
      let last: string | undefined;
      for (const file of items) {
        const response = await fetch(`/api/posts/${postId}/media/${encodeURIComponent(file.name)}`, {
          method: "PUT",
          body: file,
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok) last = body.file as string;
        else window.alert(`${file.name}: ${(body.error as string) ?? "upload failed"}`);
      }
      await refresh();
      if (last) onChange(last);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="field__label">
        <span>Photo</span>
        <span className="muted">sits behind the words</span>
      </span>

      {files.length > 0 ? (
        <div className="picker">
          <button type="button" className={`picker__none${value ? "" : " picker__none--on"}`} onClick={() => onChange(undefined)}>
            None
          </button>
          {files.map((file) => (
            <button
              type="button"
              key={file.name}
              className={`picker__item${value === file.name ? " picker__item--on" : ""}`}
              title={file.name}
              onClick={() => onChange(file.name)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/posts/${postId}/media/${encodeURIComponent(file.name)}?thumb=1`} alt={file.name} />
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`dropzone dropzone--slim${dragging ? " dropzone--over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.click();
        }}
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
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? "Uploading…" : "Drop a photo here, or click to choose"}
      </div>
    </div>
  );
}
