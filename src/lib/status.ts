import { MAX_CAPTION, MAX_SLIDES, slideStrings, type Config, type Post, type Status } from "./schema";

/**
 * The workflow. Claude can draft and hand over for review; approving, requesting
 * changes and marking posted are yours alone.
 */

export const STATUS_LABEL: Record<Status, string> = {
  idea: "Idea",
  drafting: "Drafting",
  in_review: "Needs your review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
  archived: "Archived",
};

export const STATUS_HINT: Record<Status, string> = {
  idea: "A topic on the calendar with nothing written yet.",
  drafting: "Claude is writing this one.",
  in_review: "Waiting for you to approve or send notes.",
  changes_requested: "Your notes are in; Claude picks it back up.",
  approved: "You signed it off. Ready to schedule.",
  scheduled: "Approved and dated. Export and post at the planned time.",
  posted: "Live on Instagram.",
  archived: "Parked. Out of the calendar.",
};

/** Statuses only a person may set. */
export const HUMAN_ONLY: Status[] = ["approved", "posted"];

const TRANSITIONS: Record<Status, Status[]> = {
  idea: ["drafting", "archived"],
  drafting: ["in_review", "idea", "archived"],
  in_review: ["approved", "changes_requested", "drafting", "archived"],
  changes_requested: ["drafting", "in_review", "archived"],
  approved: ["scheduled", "in_review", "changes_requested", "posted", "archived"],
  scheduled: ["posted", "approved", "in_review", "changes_requested", "archived"],
  posted: ["archived", "scheduled"],
  archived: ["idea", "drafting", "in_review"],
};

export function canTransition(from: Status, to: Status): boolean {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

export function nextStatuses(from: Status): Status[] {
  return TRANSITIONS[from] ?? [];
}

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  field: string;
  message: string;
  slide?: number;
}

const PLACEHOLDER = /\[[^\]\n]{2,}\]/;

/**
 * Everything standing between a draft and an approval. Errors block approval;
 * warnings are judgement calls you can approve past.
 */
export function reviewIssues(post: Post, config?: Pick<Config, "hashtagLimits">): Issue[] {
  const issues: Issue[] = [];
  const limits = config?.hashtagLimits ?? { min: 3, max: 5 };

  if (!post.caption.trim()) issues.push({ level: "error", field: "caption", message: "The caption is empty." });
  if (post.caption.length > MAX_CAPTION)
    issues.push({
      level: "warning",
      field: "caption",
      message: `The caption is ${post.caption.length} characters; Instagram cuts off at ${MAX_CAPTION}.`,
    });
  if (PLACEHOLDER.test(post.caption))
    issues.push({ level: "error", field: "caption", message: "The caption still has a placeholder in square brackets." });

  if (post.hashtags.length < limits.min || post.hashtags.length > limits.max)
    issues.push({
      level: "warning",
      field: "hashtags",
      message: `${post.hashtags.length} hashtags. ${limits.min}–${limits.max} works better than a wall of them.`,
    });
  for (const tag of post.hashtags) {
    if (/\s/.test(tag)) issues.push({ level: "error", field: "hashtags", message: `"${tag}" has a space in it.` });
  }

  if (post.format === "carousel") {
    if (post.slides.length < 2) issues.push({ level: "error", field: "slides", message: "A carousel needs at least 2 slides." });
    if (post.slides.length > MAX_SLIDES)
      issues.push({ level: "error", field: "slides", message: `Instagram allows ${MAX_SLIDES} slides; this has ${post.slides.length}.` });
    if (!post.slides.some((s) => s.template === "cover"))
      issues.push({ level: "warning", field: "slides", message: "No cover slide — the first slide is what stops the scroll." });
  }

  post.slides.forEach((slide, i) => {
    const strings = slideStrings(slide);
    if (strings.length === 0) issues.push({ level: "error", field: "slides", slide: i, message: `Slide ${i + 1} has no text.` });
    for (const s of strings) {
      if (PLACEHOLDER.test(s)) {
        issues.push({ level: "error", field: "slides", slide: i, message: `Slide ${i + 1} still has a placeholder: ${s.match(PLACEHOLDER)?.[0]}` });
        break;
      }
    }
    if (slide.template === "photo" && !slide.image)
      issues.push({ level: "error", field: "slides", slide: i, message: `Slide ${i + 1} is a photo slide with no image.` });
  });

  if (post.format === "reel") {
    if (!post.reel) issues.push({ level: "error", field: "reel", message: "This is a reel with no script." });
    else {
      if (!post.reel.hook.trim()) issues.push({ level: "error", field: "reel", message: "The reel has no hook." });
      if (post.reel.beats.length === 0) issues.push({ level: "error", field: "reel", message: "The reel script has no beats." });
      for (const beat of post.reel.beats) {
        if (PLACEHOLDER.test(beat.onScreen) || PLACEHOLDER.test(beat.voiceover)) {
          issues.push({ level: "error", field: "reel", message: "The reel script still has a placeholder in square brackets." });
          break;
        }
      }
      if (post.reel.footage.length === 0)
        issues.push({ level: "warning", field: "reel", message: "No footage listed — note which clips this needs." });
    }
  }

  const unchecked = post.facts.filter((f) => f.status === "needs_check");
  if (unchecked.length > 0)
    issues.push({
      level: "error",
      field: "facts",
      message: `${unchecked.length} fact${unchecked.length === 1 ? "" : "s"} still to check: ${unchecked
        .slice(0, 2)
        .map((f) => f.claim.slice(0, 48))
        .join("; ")}${unchecked.length > 2 ? "…" : ""}`,
    });
  for (const fact of post.facts) {
    if (fact.status === "sourced" && !fact.url && !fact.source)
      issues.push({ level: "warning", field: "facts", message: `"${fact.claim.slice(0, 40)}" is marked sourced but has no source.` });
  }

  if (!post.altText?.trim() && (post.format === "carousel" || post.format === "single"))
    issues.push({ level: "warning", field: "altText", message: "No alt text. Worth a line for people using screen readers." });

  if (!post.date) issues.push({ level: "warning", field: "date", message: "No date on the calendar yet." });

  return issues;
}

export function errorsOf(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === "error");
}

export function warningsOf(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === "warning");
}

export interface Readiness {
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  canApprove: boolean;
}

export function readiness(post: Post, config?: Pick<Config, "hashtagLimits">): Readiness {
  const issues = reviewIssues(post, config);
  const errors = errorsOf(issues);
  return { issues, errors, warnings: warningsOf(issues), canApprove: errors.length === 0 };
}
