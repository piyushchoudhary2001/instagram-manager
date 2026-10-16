import { NextResponse } from "next/server";
import { redact } from "@/lib/instagram/config";
import { syncInsights } from "@/lib/instagram/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pulls the numbers for everything marked posted and writes them into the post files. */
export async function POST() {
  try {
    const result = await syncInsights();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: redact(error instanceof Error ? error.message : "Could not sync") }, { status: 502 });
  }
}
