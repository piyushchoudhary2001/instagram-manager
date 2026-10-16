import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { verifyMedia } from "@/lib/instagram/config";
import { publishDirFor } from "@/lib/instagram/publish";
import { exportsDirFor } from "@/lib/video/render";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; file: string }> };

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4" };

/**
 * The one route Instagram itself calls. Publishing means Meta fetches the media over the
 * internet, so while a tunnel is up this is reachable by anyone who has the link — which is
 * why every link is signed and expires in half an hour, and why only files this app wrote
 * for a publish can be served.
 */
export async function GET(request: Request, { params }: Params) {
  const { id, file } = await params;
  const url = new URL(request.url);
  const expires = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";

  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(id) || !/^[A-Za-z0-9._-]{1,64}$/.test(file) || file.includes("..")) {
    return NextResponse.json({ error: "No" }, { status: 400 });
  }
  if (!verifyMedia(id, file, expires, signature)) {
    return NextResponse.json({ error: "That link is not valid any more" }, { status: 403 });
  }

  const extension = path.extname(file).toLowerCase();
  const contentType = TYPES[extension];
  if (!contentType) return NextResponse.json({ error: "Not a publishable file" }, { status: 400 });

  const candidate = extension === ".mp4" || file === "cover.jpg" ? path.join(exportsDirFor(id), file) : path.join(publishDirFor(id), file);

  let size: number;
  try {
    size = (await fs.stat(candidate)).size;
  } catch {
    return NextResponse.json({ error: "Nothing there" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(candidate)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
