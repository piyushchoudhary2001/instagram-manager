import { NextResponse } from "next/server";
import { readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readConfig());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read content/config.json" }, { status: 500 });
  }
}
