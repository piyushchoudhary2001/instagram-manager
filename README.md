# Content manager for @build.it01

A local-first tool for running the Instagram account: Claude drafts posts as JSON, the app renders the real slides from the Trilyt design system, and you approve them before anything goes out. Nothing publishes by itself, and nothing is marked approved unless you click it.

```bash
git clone https://github.com/piyushchoudhary2001/instagram-manager.git
cd instagram-manager
npm install
npm run dev          # http://localhost:3000
```

Node 20.9 or newer. No database, no login, no cloud: the content lives in `content/` as files in this repo.

## What it does

| | |
|---|---|
| **Calendar** | Three weeks at a glance, with the real cover of every post. |
| **Review queue** | Everything Claude has drafted, ordered by what needs you. |
| **Post editor** | Slide-by-slide WYSIWYG, caption, reel script, facts, history. |
| **Carousel studio** | Eight slide templates rendered to 1080 × 1350 from the Figma tokens, with the type auto-fitted so nothing ever overflows. |
| **Export pack** | A zip of PNGs, the caption and the alt text, ready to post. |
| **Brand page** | The tokens, icons and templates as the renderer actually uses them. |

## How a post moves

```
idea → drafting → in review → approved → scheduled → posted
                      ↑            |
                      └── changes requested
```

Claude can take a post as far as **in review**. Approving, requesting changes and marking something posted are yours — the API refuses them from anywhere else.

Approval signs the content: a hash of the slides, caption, hashtags, alt text and reel script. If any of it changes afterwards — Claude edits the file, you fix a word — the post drops back to review on its own. You never post something you did not read.

A post also cannot be approved while a fact is still marked *to check*, a slide has a `[placeholder]` in it, or text does not fit its box.

## Where things are

```
content/
  config.json          handle, pillars, the 3-week plan, the follower goal
  posts/<id>.json      one file per post — this is the content, tracked in git
  media/               your photos and clips for photo slides
brand/
  trilyt.tokens.json   colours, type, spacing, radii — extracted from Figma
  icons.json           73 brand icons as SVG
  fonts/               Manrope, static weights for the renderer
src/
  app/                 pages and API routes
  lib/render/          the slide renderer (Satori → SVG → PNG)
  lib/store.ts         the file store, with etags so edits never collide
docs/                  workflow, video pipeline, roadmap
```

## Commands

```bash
npm run dev        # the app
npm run validate   # schema, review issues and text overflow for every post
npm run render     # render every post's slides into renders/ to eyeball them
npm run typecheck
npm run build
```

## Working with Claude

Point Claude at this repo and ask for what you want — "draft the Oct 27 packing carousel", "make slide 4 shorter", "re-sync the Trilyt tokens from Figma". It edits the JSON; you refresh the app and review. `CLAUDE.md` holds the rules it follows, including the one that matters most: it never marks anything approved or posted.

## Publishing

Right now you export the pack and post it yourself. Direct publishing needs a Meta app of your own; the steps and the current state are on the Publishing page, and your credentials belong in `.env.local`, which is git-ignored — they stay on your machine and never go into a chat.
