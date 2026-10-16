import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { exportsDirFor } from "@/lib/video/render";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Serves the built cut so you can watch it next to the script, with range support for scrubbing. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const file = path.join(exportsDirFor(id), "reel.mp4");
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return NextResponse.json({ error: "No cut built yet" }, { status: 404 });
  }

  const range = request.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : size - 1;
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "no-store",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, {
    headers: { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": String(size), "Cache-Control": "no-store" },
  });
}
