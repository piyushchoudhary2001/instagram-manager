/**
 * Pulls Instagram's numbers into the post files.
 *
 *   npm run insights
 *
 * Reads your .env.local for the credentials. Safe to run on a schedule — it only writes
 * the metrics and a history line, and it matches posts you published by hand through
 * their permalink.
 */
import { config as loadEnv } from "./env";
import { syncInsights } from "../src/lib/instagram/insights";
import { configState } from "../src/lib/instagram/config";

async function main(): Promise<void> {
  loadEnv();
  const state = configState();
  if (!state.ready) {
    console.error(`Not configured yet. Missing from .env.local: ${state.missing.join(", ")}`);
    console.error("See docs/INSTAGRAM.md.");
    process.exit(1);
  }

  const result = await syncInsights({ onProgress: (message) => console.log(`  ${message}`) });

  console.log("");
  if (result.followers !== undefined) console.log(`Followers: ${result.followers.toLocaleString("en-IN")}`);
  for (const match of result.matched) console.log(`matched ${match.id} → ${match.mediaId}`);
  for (const updated of result.updated) console.log(`✓ ${updated.id} — ${updated.metrics} metrics`);
  for (const skipped of result.skipped) console.log(`· ${skipped.id} — ${skipped.why}`);
  console.log(`\n${result.updated.length} post${result.updated.length === 1 ? "" : "s"} updated.\n`);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
