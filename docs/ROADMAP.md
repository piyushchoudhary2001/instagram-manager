# Roadmap

## Phase 1 — drafting and approval *(done)*

- Trilyt design system extracted from Figma into `brand/` — colours, type, spacing, radii, 73 icons, Manrope.
- Eight slide templates rendered at 1080 × 1350, with type auto-fitted against real font metrics so nothing overflows.
- Reel covers at 1080 × 1920, inside the grid-safe zone.
- File-based content store with etags, so Claude and the app can both write without clobbering each other.
- Calendar, review queue and a slide-by-slide editor with live preview.
- Approval gating: facts, placeholders, slide counts, text fit — plus a content signature that un-approves a post if a word changes afterwards.
- Export pack: PNGs, caption, hashtags, alt text.

## Phase 2 — reels

- A rough cut assembled from a post's script with `ffmpeg`: cuts, burned-in captions, grade, audio levelling, the cover frame.
- Review the cut in the app the way slides are reviewed now.
- Needs the folder of raw clips connected to a Claude session. See `docs/VIDEO.md`.

## Phase 3 — publishing and numbers

- Publish an approved post straight to Instagram through the Graph API, and write the permalink back into its JSON.
- Pull Insights per post — saves, shares, reach from non-followers, follows — into the post file, so the weekly review stops being manual.
- Needs a Meta app, a Business account linked to a Facebook Page, and a long-lived token in `.env.local`.
- Known limits worth designing around: images must be fetchable at a public HTTPS URL, there is a daily cap on API posts, and trending audio cannot be attached through the API — so reels may stay a manual upload even then.

## Later, if it earns it

- **Stories**: the plan already calls for a poll or question box most days; they could be drafted and tracked here too.
- **A second account**: nothing in the store assumes one handle except `content/config.json`.
- **Performance feedback into drafting**: once there are a few weeks of Insights in the files, Claude can weight new drafts toward the pillars that actually earn saves.
