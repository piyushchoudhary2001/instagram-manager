/**
 * Checks every file in content/ — schema, ids, dates, and whether each post would pass
 * review. Run it after Claude drafts, and in CI if you ever add one.
 *   npm run validate
 */
import { reviewIssues } from "../src/lib/status";
import { listPosts, readConfig } from "../src/lib/store";
import { overflowReport } from "../src/lib/render/render";
import { STATUS_LABEL } from "../src/lib/status";

async function main(): Promise<void> {
  const config = await readConfig();
  const { posts, issues } = await listPosts();

  let errors = issues.length;
  for (const issue of issues) console.error(`✗ ${issue.file}: ${issue.message}`);

  const seenDates = new Map<string, string[]>();

  for (const { post } of posts) {
    const review = reviewIssues(post, config);
    const blocking = review.filter((i) => i.level === "error");
    const warnings = review.filter((i) => i.level === "warning");
    const overflow = post.slides.length || post.reel?.cover ? await overflowReport(post, config.handle) : [];

    if (post.date) seenDates.set(post.date, [...(seenDates.get(post.date) ?? []), post.id]);

    const ready = blocking.length === 0 && overflow.length === 0;
    const mark = ready ? "✓" : post.status === "idea" ? "·" : "✗";
    console.log(`${mark} ${post.id} — ${STATUS_LABEL[post.status]}`);
    for (const issue of blocking) console.log(`    error: ${issue.message}`);
    for (const issue of warnings) console.log(`    note:  ${issue.message}`);
    for (const line of overflow) console.log(`    text:  ${line}`);

    // An idea is allowed to be empty; anything further along is not.
    if (post.status !== "idea" && post.status !== "archived" && (blocking.length > 0 || overflow.length > 0)) {
      if (post.status !== "drafting") errors += 1;
    }
    if (overflow.length > 0) errors += 1;
  }

  for (const [date, ids] of seenDates) {
    if (ids.length > 1) console.warn(`! ${date} has ${ids.length} posts: ${ids.join(", ")}`);
  }

  console.log(`\n${posts.length} posts · ${errors} problem${errors === 1 ? "" : "s"}`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
