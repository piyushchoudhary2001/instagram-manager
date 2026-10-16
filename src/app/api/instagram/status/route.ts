import { NextResponse } from "next/server";
import { getAccount, getPublishingLimit } from "@/lib/instagram/client";
import { configState, redact } from "@/lib/instagram/config";

export const dynamic = "force-dynamic";

/** Whether publishing is set up, and what the account looks like from the API's side. */
export async function GET() {
  const state = configState();
  if (!state.ready) return NextResponse.json({ ...state, account: null, limit: null });

  try {
    const [account, limit] = await Promise.all([getAccount(), getPublishingLimit()]);
    return NextResponse.json({
      ...state,
      account: { id: account.id, username: account.username, followers: account.followers_count, media: account.media_count },
      limit: limit ? { used: limit.quota_usage, total: limit.config?.quota_total ?? null } : null,
      error: null,
    });
  } catch (error) {
    return NextResponse.json({
      ...state,
      account: null,
      limit: null,
      error: redact(error instanceof Error ? error.message : "Could not reach the API"),
    });
  }
}
