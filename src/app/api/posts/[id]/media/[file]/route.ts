import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { clipPath, clipsDir, deleteMedia, kindOf, listMedia, safeName, thumbnail } from "@/lib/video/media";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string; file: string }> };

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

function serve(file: string, type: string, size: number, range: string | null): NextResponse {
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : size - 1;
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "no-store",
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
  });
}

/** The clip itself, for playing in the editor — or `?thumb=1&t=2` for a still from it. */
export async function GET(request: Request, { params }: Params) {
  const { id, file } = await params;
  const url = new URL(request.url);

  if (url.searchParams.get("thumb") === "1") {
    const at = Number(url.searchParams.get("t") ?? 0.5);
    const made = await thumbnail(id, file, Number.isFinite(at) ? Math.max(0, at) : 0.5);
    if (!made) return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
    const bytes = await fs.readFile(made);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" },
    });
  }

  const full = clipPath(id, file);
  if (!full) return NextResponse.json({ error: "Not a file we handle" }, { status: 400 });
  const stat = await fs.stat(full).catch(() => null);
  if (!stat) return NextResponse.json({ error: "Nothing there" }, { status: 404 });
  const type = TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
  return serve(full, type, stat.size, request.headers.get("range"));
}

/**
 * Upload a clip. The body is the file itself rather than a multipart form, so it streams
 * to disk instead of being held in memory — phone footage is big.
 */
export async function PUT(request: Request, { params }: Params) {
  const { id, file } = await params;
  const name = safeName(file);
  if (!name || !kindOf(name)) {
    return NextResponse.json({ error: "That file type is not something the cutter can use" }, { status: 415 });
  }
  if (!request.body) return NextResponse.json({ error: "No file in the request" }, { status: 400 });

  const dir = clipsDir(id);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  const temp = `${target}.${Date.now()}.part`;
  try {
    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(temp));
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
  return NextResponse.json({ file: name, files: await listMedia(id) }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, file } = await params;
  const ok = await deleteMedia(id, file);
  if (!ok) return NextResponse.json({ error: "Not a file we handle" }, { status: 400 });
  return NextResponse.json({ files: await listMedia(id) });
}
