# Roadmap

## Phase 1 — drafting and approval *(done)*

- Trilyt design system extracted from Figma into `brand/` — colours, type, spacing, radii, 73 icons, Manrope.
- Eight slide templates rendered at 1080 × 1350, with type auto-fitted against real font metrics so nothing overflows.
- Reel covers at 1080 × 1920, inside the grid-safe zone.
- File-based content store with etags, so Claude and the app can both write without clobbering each other.
- Calendar, review queue and a slide-by-slide editor with live preview.
- Approval gating: facts, placeholders, slide counts, text fit — plus a content signature that un-approves a post if a word changes afterwards.
- Export pack: PNGs, caption, hashtags, alt text.

## Phase 2 — reels *(done)*

- `npm run reel -- <post-id>` cuts a post's script into a 1080 × 1920 reel: beats trimmed to their times, frames cropped, a consistent grade, captions burned in from the on-screen text, voiceover levelled with the music ducked under it, and the cover frame rendered alongside.
- Clips are matched to beats by file name, by an explicit `clip` on the beat, or in order; a missing clip becomes a labelled card rather than a failure.
- The Script tab shows the mapping and plays the cut.
- Still manual on purpose: adding a trending track, which the API cannot do.

## Phase 3 — publishing and numbers *(done)*

- Publish an approved carousel, image or reel straight to Instagram: containers, processing, publish, and the permalink written back into the post file.
- Media is served to Meta over short-lived signed links from the app itself, so nothing has to be uploaded to a third-party host first.
- `npm run insights` (or the button on the Publishing page) pulls saves, shares, reach, views, likes, comments, profile visits and follows into each post, and updates the follower count. Posts published by hand are matched by permalink.
- Credentials stay in `.env.local`; the app reports only whether they are set, and strips token-shaped strings out of errors.
- Setup, and the limits that shape it, are in `docs/INSTAGRAM.md`.

## Next, if it earns it

- **Stories**: the plan already calls for a poll or question box most days; they could be drafted and tracked here too.
- **Performance feedback into drafting**: with a few weeks of insights in the files, Claude can weight new drafts toward the pillars that actually earn saves — the data is already in the right place for it.
- **Scheduled publishing**: the API has no scheduler, so this would mean a small local job that publishes an approved post at its planned time. Worth it only once posting from here is routine.
- **A second account**: nothing in the store assumes one handle except `content/config.json`.
