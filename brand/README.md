# Trilyt brand files

Everything the app and the slide renderer know about the brand lives in this folder. Nothing hard-codes a colour anywhere else.

| File | What it is |
|---|---|
| `trilyt.tokens.json` | Colour primitives and semantic tokens (light and dark), the gradient, Manrope's type scale and all 24 text styles, spacing, radii, shadows, component defaults, and the social canvas sizes and type scale the slides use. |
| `icons.json` | 73 icons from the Figma "icon & avatars" section as raw SVG bodies — 24 px grid, 1.5 stroke, round caps and joins — plus two filled glyphs (rupee, flashlight). |
| `fonts/` | Manrope, instanced to static TTFs at 400/500/600/700/800. Satori cannot read WOFF2 or variable axes, so these are the files that render the slides and the app UI. `OFL.txt` is the licence. |

Source: [the Trilyt Figma file](https://www.figma.com/design/r2yheI0iL4FlQ1sNkCW3Go/Trilyt), page "Design system", extracted 2026-10-17.

## Re-syncing from Figma

Figma's Variables REST API is Enterprise-only, so this is not something the app can fetch. It is a Claude job:

> Re-sync the Trilyt tokens from Figma.

Claude reads the variable collections through the Figma MCP connection and rewrites `trilyt.tokens.json` and `icons.json`. The git diff is the review — look at it before committing, because a token change moves every slide.

Two things worth knowing if you do it by hand instead:

- `get_variable_defs` needs a concrete node selected; pointing it at a page returns nothing.
- Icon exports come back as SVG strings through the plugin API; the asset URLs Figma hands out are not reachable from a sandbox.

## How the tokens become slides

`social.type` extends the mobile type scale to a 1080 px canvas: each level has a maximum and a minimum size, and the renderer measures the real text with `opentype.js` and picks the largest size that fits its box. That is why slides hold together whether a headline is four words or fourteen.

`social.tones` defines the three looks a slide can take:

- **light** — paper (`Background/Card`), ink type, hairline rules. The default inside a carousel.
- **sun** — the orange→yellow brand gradient with near-black type. Covers and closing cards only; it is the thing that stops a thumb, and it stops working if every slide uses it.
- **ink** — near-black with light type. For a single statement slide, used sparingly.

There is no Trilyt logo in the Figma file, so the slides sign off with the handle instead. Do not invent a mark.
