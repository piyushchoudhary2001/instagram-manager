# Working in this repo

This is Piyush's Instagram content manager for **@build.it01**. You draft; he approves. These are the rules that keep that true.

## The hard rules

1. **Never set a post to `approved` or `posted`.** Those are his. Take a draft as far as `in_review` and stop. The API enforces it; do not work around it by editing JSON.
2. **Never put the marketplace in the content.** Trilyt and the adventure-travel platform are not announced in these three weeks — no waitlist, no "we're building", no teaser. The content earns the audience; the product comes later. Mentioning it in `notes` for him is fine. Content is not.
3. **Never handle Instagram or Meta credentials.** They live in his `.env.local`, which is git-ignored. Do not read it, print it, or ask him to paste a token into a chat.
4. **Facts stay honest.** Any price, season, distance, operator claim or "first/best/only" goes in `facts[]` with `status: "needs_check"` until it is checked against a current source, and then gets the source URL. If something cannot be confirmed, change the slide so the claim is not made — do not soften it and keep it. A post with an unchecked fact cannot be approved, which is the point.
5. **No placeholders in deliverable text.** Anything in `[square brackets]` blocks approval. If you need information from him, put the question in `notes` and leave the post in `drafting`.

## How to draft

- One post per file: `content/posts/<YYYY-MM-DD>-<slug>.json`. The `id` and the file name must match.
- Write real copy, not an outline. Captions in English by default (he has not switched to Hinglish), 3–5 hashtags, alt text on every carousel.
- Slides use the eight templates in `src/lib/schema.ts`. Keep a carousel to 6–9 slides: a `cover`, the body, and a `cta` to close.
- Keep lines short enough to breathe. The renderer auto-fits type, but a headline that shrinks to its minimum is a sign the line is too long — rewrite it rather than letting it get small.
- After drafting, run `npm run validate`. It reports schema problems, review blockers and any text that does not fit. Fix overflow before handing over.
- Set `status: "in_review"` when it is genuinely ready, and add a `history` entry saying what you did.
- Read `history` before picking up a post: when he requests changes, his note is in there.

## Rendering and brand

- Colours, type, spacing and radii come from `brand/trilyt.tokens.json`; icons from `brand/icons.json`. Never hard-code a hex value — add a token or use the semantic name.
- Light mode is the default across the slides and the app. The orange→yellow gradient is for covers and closing cards only; inside the carousel it is paper, ink and hairlines.
- Re-syncing from Figma is a Claude job, not an app feature: Figma's Variables REST API is Enterprise-only, so use the Figma MCP connection to read the variable collections in file `r2yheI0iL4FlQ1sNkCW3Go` and rewrite the two brand files. The git diff is the review.
- There is no Trilyt logo in the Figma file. Do not invent one.

## Checking your own work

```bash
npm run validate     # every post: schema, blockers, text fit
npm run render       # PNGs into renders/ — look at them before saying it is ready
npm run typecheck && npm run build
```

Look at the rendered slides. A carousel that validates can still be ugly, and he should not be the one to find that out.

## Code

- TypeScript strict, no `any`. Zod schemas in `src/lib/schema.ts` are the source of truth for the content model.
- Writes to `content/` go through `src/lib/store.ts` so they stay atomic and etag-checked.
- Keep the renderer deterministic: same JSON in, same pixels out. No network calls, no clock, no randomness in a template.
- Satori is flexbox only — no `grid`, no `position: fixed`, no CSS variables inside a slide tree, and fonts must be TTF/OTF.

## Commits

End every commit message with:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

Commit the content with the code: `content/posts/*.json` is the record of what was published and when.
