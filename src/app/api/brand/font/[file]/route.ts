import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { WEIGHT_FILES } from "@/lib/render/fonts";

type Params = { params: Promise<{ file: string }> };

const ALLOWED = new Set(Object.values(WEIGHT_FILES));

/** Serves the brand TTFs so the app and the slides use one copy of Manrope. */
export async function GET(_request: Request, { params }: Params) {
  const { file } = await params;
  if (!ALLOWED.has(file)) return NextResponse.json({ error: "Unknown font" }, { status: 404 });
  const bytes = await fs.readFile(path.join(process.cwd(), "brand", "fonts", file));
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
