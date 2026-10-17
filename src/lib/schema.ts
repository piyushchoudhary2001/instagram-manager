import { z } from "zod";

/**
 * Content model. Everything the manager knows about a post lives in one JSON file
 * (content/posts/<id>.json). Claude drafts by writing these files; you approve in the app.
 * Objects are "loose": unknown keys survive a round trip instead of being stripped.
 */

export const FORMATS = ["carousel", "reel", "story", "single"] as const;
export type Format = (typeof FORMATS)[number];

export const STATUSES = [
  "idea",
  "drafting",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "posted",
  "archived",
] as const;
export type Status = (typeof STATUSES)[number];

export const TEMPLATES = ["cover", "statement", "point", "bullets", "compare", "stat", "photo", "cta"] as const;
export type Template = (typeof TEMPLATES)[number];

export const TONES = ["light", "sun", "ink"] as const;
export type Tone = (typeof TONES)[number];

export const FACT_STATUSES = ["needs_check", "sourced", "verified"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

const text = z.string();
const icon = z.string();

export const ItemSchema = z.looseObject({
  icon: icon.optional(),
  title: text,
  detail: text.optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const SideSchema = z.looseObject({
  heading: text,
  icon: icon.optional(),
  items: z.array(text).default([]),
});
export type Side = z.infer<typeof SideSchema>;

export const SlideSchema = z.looseObject({
  id: z.string().optional(),
  template: z.enum(TEMPLATES),
  tone: z.enum(TONES).optional(),
  kicker: text.optional(),
  title: text.optional(),
  body: text.optional(),
  icon: icon.optional(),
  badge: z.looseObject({ text, icon: icon.optional() }).optional(),
  step: text.optional(),
  listStyle: z.enum(["icons", "numbers", "checks"]).optional(),
  items: z.array(ItemSchema).optional(),
  callout: z.looseObject({ label: text.optional(), text }).optional(),
  left: SideSchema.optional(),
  right: SideSchema.optional(),
  stat: z.looseObject({ value: text, label: text.optional() }).optional(),
  actions: z.array(z.looseObject({ icon: icon.optional(), label: text })).optional(),
  image: text.optional(),
  footnote: text.optional(),
  alt: text.optional(),
  notes: text.optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const BeatSchema = z.looseObject({
  time: text,
  onScreen: text.default(""),
  voiceover: text.default(""),
  shot: text.optional(),
  /** file name inside content/media/<post-id>/, when a beat should use a particular clip */
  clip: text.optional(),
  /** seconds into that clip to start from, when the good part is not at the beginning */
  clipStart: z.number().optional(),
});
export type Beat = z.infer<typeof BeatSchema>;

export const ReelSchema = z.looseObject({
  durationSec: z.number().optional(),
  hook: text.default(""),
  beats: z.array(BeatSchema).default([]),
  audio: text.default(""),
  /** file names in the post's media folder, when the bed or the narration should not be guessed by name */
  music: text.optional(),
  voiceover: text.optional(),
  captionsLanguage: z.enum(["en", "hi", "hinglish"]).default("en"),
  footage: z.array(text).default([]),
  cover: SlideSchema.optional(),
});
export type Reel = z.infer<typeof ReelSchema>;

export const FactSchema = z.looseObject({
  id: z.string().optional(),
  claim: text,
  status: z.enum(FACT_STATUSES).default("needs_check"),
  source: text.optional(),
  url: text.optional(),
  note: text.optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export const HistorySchema = z.looseObject({
  at: text,
  by: z.enum(["claude", "you", "system"]),
  action: text,
  note: text.optional(),
});
export type HistoryEntry = z.infer<typeof HistorySchema>;

export const PostSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "id must be lowercase letters, numbers and dashes"),
  title: z.string().min(1),
  format: z.enum(FORMATS),
  pillar: z.string(),
  status: z.enum(STATUSES).default("idea"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  hook: text.default(""),
  cta: text.default(""),
  caption: text.default(""),
  hashtags: z.array(text).default([]),
  altText: text.optional(),
  slides: z.array(SlideSchema).default([]),
  reel: ReelSchema.optional(),
  facts: z.array(FactSchema).default([]),
  notes: text.default(""),
  approval: z
    .looseObject({ approvedAt: text, approvedBy: text, contentHash: text })
    .nullable()
    .optional(),
  published: z
    .looseObject({
      postedAt: text,
      permalink: text.optional(),
      mediaId: text.optional(),
      /** numbers pulled back from Instagram; metric names are whatever the API returned */
      insights: z.looseObject({ fetchedAt: text }).optional(),
    })
    .nullable()
    .optional(),
  history: z.array(HistorySchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Post = z.infer<typeof PostSchema>;

export const PillarSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  why: z.string().default(""),
  target: z.number().default(0),
});
export type Pillar = z.infer<typeof PillarSchema>;

export const ConfigSchema = z.looseObject({
  handle: z.string(),
  displayName: z.string().default(""),
  timezone: z.string().default("Asia/Kolkata"),
  utcOffset: z.string().default("+05:30"),
  defaultTime: z.string().default("19:30"),
  language: z.string().default("en"),
  pillars: z.array(PillarSchema).default([]),
  goal: z
    .looseObject({
      followers: z.number(),
      current: z.number(),
      currentAsOf: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      label: z.string().optional(),
    })
    .optional(),
  plan: z
    .looseObject({
      start: z.string(),
      weeks: z.number(),
      weekThemes: z.array(z.string()).default([]),
    })
    .optional(),
  hashtagLimits: z.looseObject({ min: z.number(), max: z.number() }).default({ min: 3, max: 5 }),
});
export type Config = z.infer<typeof ConfigSchema>;

/** Slide canvas sizes in pixels. */
export const CANVAS = {
  carousel: { width: 1080, height: 1350 },
  /** gridSafeHeight is the part of a reel cover the profile grid will not crop. */
  reelCover: { width: 1080, height: 1920, gridSafeHeight: 1440 },
} as const;

export const MAX_CAPTION = 2200;
export const MAX_SLIDES = 20;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function makePostId(date: string | null | undefined, title: string): string {
  const slug = slugify(title) || "post";
  return date ? `${date}-${slug}` : slug;
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** A sensible empty slide for the editor's "Add slide" button. */
export function newSlide(template: Template): Slide {
  switch (template) {
    case "cover":
      return { template, tone: "sun", kicker: "Topic", title: "Your headline", body: "One line that says what they get.", icon: "compass" };
    case "statement":
      return { template, kicker: "Key point", title: "Say the one thing that matters." };
    case "point":
      return { template, kicker: "Tip", step: "1", title: "State the point", callout: { label: "Ask", text: "A question worth asking" } };
    case "bullets":
      return {
        template,
        kicker: "List",
        title: "A short list",
        listStyle: "icons",
        items: [
          { icon: "map-pin", title: "First item", detail: "What it means" },
          { icon: "clock", title: "Second item", detail: "What it means" },
          { icon: "shield", title: "Third item", detail: "What it means" },
        ],
      };
    case "compare":
      return {
        template,
        kicker: "Compare",
        title: "This or that",
        left: { heading: "Skip", icon: "x-circle", items: ["First", "Second"] },
        right: { heading: "Pack", icon: "check-circle", items: ["First", "Second"] },
      };
    case "stat":
      return { template, kicker: "The number", stat: { value: "₹0", label: "What it covers" }, body: "A line of context." };
    case "photo":
      return { template, kicker: "Place", title: "Caption over a photo", image: "" };
    case "cta":
      return {
        template,
        tone: "sun",
        title: "Save this for your trip.",
        body: "Send it to whoever is planning with you.",
        actions: [
          { icon: "bookmark", label: "Save this" },
          { icon: "send", label: "Send to a friend" },
        ],
      };
  }
}

/** Flatten every user-visible string of a slide (used for placeholder checks and alt text). */
export function slideStrings(slide: Slide): string[] {
  const out: string[] = [];
  const push = (s?: string) => {
    if (s && s.trim()) out.push(s);
  };
  push(slide.kicker);
  push(slide.title);
  push(slide.body);
  push(slide.step);
  push(slide.badge?.text);
  push(slide.callout?.label);
  push(slide.callout?.text);
  push(slide.stat?.value);
  push(slide.stat?.label);
  push(slide.footnote);
  for (const it of slide.items ?? []) {
    push(it.title);
    push(it.detail);
  }
  for (const side of [slide.left, slide.right]) {
    if (!side) continue;
    push(side.heading);
    for (const t of side.items) push(t);
  }
  for (const a of slide.actions ?? []) push(a.label);
  return out;
}

export function defaultAltText(slide: Slide, index: number, total: number): string {
  if (slide.alt) return slide.alt;
  const parts = slideStrings(slide).slice(0, 4).join(". ");
  return `Slide ${index + 1} of ${total}. ${parts}`.slice(0, 400);
}
