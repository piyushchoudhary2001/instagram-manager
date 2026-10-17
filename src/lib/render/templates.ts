import { social, tonePalette, primitive, gradient, type ToneName } from "../brand";
import { CANVAS, type Item, type Slide } from "../schema";
import { FONT_FAMILY } from "./fonts";
import { iconUriSafe } from "./icons";
import { fitStyle, fitText, type TypeScale } from "./measure";

/**
 * Slide templates.
 *
 * The visual language is a field card: near-black Manrope set tight, warm neutral paper,
 * hairline rules instead of boxes, and one orange route line that only appears when the
 * content is actually a sequence. The brand gradient is kept for the two slides that have
 * to stop a thumb — the cover and the closing card — so it still means something.
 *
 * Trees are plain objects rather than JSX so a slide can be assembled from data.
 */

type Style = Record<string, string | number | undefined>;
interface Node {
  type: string;
  props: { style?: Style; children?: unknown; [key: string]: unknown };
}

const h = (type: string, style: Style, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

const row = (style: Style, children: unknown[]): Node => h("div", { display: "flex", flexDirection: "row", ...style }, children);
const col = (style: Style, children: unknown[]): Node => h("div", { display: "flex", flexDirection: "column", ...style }, children);

const MARGIN = social.margin;
const SCALES = social.type as unknown as Record<string, TypeScale>;

function scaleOf(name: keyof typeof SCALES | string, overrides: Partial<TypeScale> = {}): TypeScale {
  const base = SCALES[name as string];
  if (!base) throw new Error(`Unknown type scale: ${String(name)}`);
  return { ...base, ...overrides };
}

export interface RenderContext {
  handle: string;
  index: number;
  total: number;
  /** slide.image reference → data URI */
  images?: Record<string, string>;
  /** filled in by the templates when text had to be shrunk past its minimum */
  overflow?: string[];
}

function note(ctx: RenderContext, message: string): void {
  if (ctx.overflow) ctx.overflow.push(message);
}

/** A fitted block of text rendered one line per div, so the break matches what was measured. */
function fitted(
  text: string,
  width: number,
  scale: TypeScale,
  color: string,
  ctx: RenderContext,
  options: { maxLines?: number; maxHeight?: number; label?: string; align?: string; marginTop?: number } = {},
): Node {
  const fit = fitText(text, width, scale, { maxLines: options.maxLines, maxHeight: options.maxHeight });
  if (fit.overflow) note(ctx, `${options.label ?? "Text"} on slide ${ctx.index + 1} does not fit: "${text.slice(0, 48)}…"`);
  const style = fitStyle(fit);
  return col(
    {
      width,
      color,
      marginTop: options.marginTop,
      alignItems: options.align === "center" ? "center" : "flex-start",
    },
    fit.lines.map((line, i) =>
      h(
        "div",
        {
          display: "flex",
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineHeight,
          height: Math.round(style.fontSize * style.lineHeight),
          alignItems: "center",
        },
        line || " ",
        { key: i },
      ),
    ),
  );
}

function iconImg(name: string | undefined, size: number, color: string, style: Style = {}, stroke = 1.5): Node | null {
  const src = iconUriSafe(name, { size, color, stroke });
  if (!src) return null;
  return { type: "img", props: { src, width: size, height: size, style: { ...style } } };
}

/** The small pill that labels the topic. Solid ink on light paper, paper on the gradient. */
function kickerPill(text: string, tone: ToneName): Node {
  const p = tonePalette(tone);
  // The pill is always the inverse of the paper it sits on.
  const onDark = tone === "ink";
  const onGradient = tone === "sun";
  const bg = onGradient || onDark ? primitive("Neutral/50") : primitive("Neutral/950");
  const fg = onGradient || onDark ? primitive("Neutral/950") : primitive("Neutral/50");
  return row(
    {
      alignItems: "center",
      backgroundColor: bg,
      color: fg,
      borderRadius: 999,
      padding: "12px 26px 14px",
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: 0.2,
      border: onGradient ? `2px solid ${p.surface}` : "none",
    },
    [text],
  );
}

/** Top chrome: topic pill on the left, slide counter on the right. */
function header(slide: Slide, tone: ToneName, ctx: RenderContext, width = CONTENT): Node {
  const p = tonePalette(tone);
  const counter = ctx.total > 1 ? `${String(ctx.index + 1).padStart(2, "0")} / ${String(ctx.total).padStart(2, "0")}` : "";
  return row({ alignItems: "center", justifyContent: "space-between", width, height: 64 }, [
    slide.kicker ? kickerPill(slide.kicker, tone) : h("div", { display: "flex" }, ""),
    counter
      ? h("div", { display: "flex", fontSize: 26, fontWeight: 600, color: p.faint, letterSpacing: 1 }, counter)
      : h("div", { display: "flex" }, ""),
  ]);
}

/** Bottom chrome: the handle, plus a swipe cue on the cover and an arrow elsewhere. */
function footer(tone: ToneName, ctx: RenderContext, cue: "swipe" | "arrow" | "none" = "arrow", width = CONTENT): Node {
  const p = tonePalette(tone);
  const cueColor = tone === "sun" ? primitive("Neutral/950") : p.muted;
  const items: unknown[] = [h("div", { display: "flex", fontSize: 26, fontWeight: 600, color: p.faint, letterSpacing: 0.4 }, ctx.handle)];
  if (cue === "swipe") {
    items.push(
      row(
        {
          alignItems: "center",
          border: `2px solid ${tone === "sun" ? primitive("Neutral/950") : p.line}`,
          borderRadius: 999,
          padding: "10px 22px 12px",
        },
        [
          h("div", { display: "flex", fontSize: 26, fontWeight: 600, color: cueColor, marginRight: 12 }, "Swipe"),
          iconImg("arrow-right", 28, cueColor),
        ],
      ),
    );
  } else if (cue === "arrow") {
    items.push(iconImg("arrow-right", 32, p.faint));
  }
  return row({ alignItems: "center", justifyContent: "space-between", width, height: 56 }, items);
}

/** The slide shell: background, safe margins, header and footer. */
function frame(
  tone: ToneName,
  ctx: RenderContext,
  body: unknown[],
  options: {
    width?: number;
    height?: number;
    cue?: "swipe" | "arrow" | "none";
    header?: Node | null;
    decoration?: unknown[];
    /** where the body sits between the header and the footer */
    align?: "center" | "flex-start" | "flex-end";
    /** extra space below the footer — the part of a reel cover the grid crops away */
    bottomInset?: number;
    /** a photograph as the slide's background, with the scrim that goes over it */
    photo?: { src: string; scrim: string };
  } = {},
): Node {
  const p = tonePalette(tone);
  const width = options.width ?? CANVAS.carousel.width;
  const height = options.height ?? CANVAS.carousel.height;
  const inner = width - MARGIN * 2;
  const base: Style = {
    position: "relative",
    width,
    height,
    padding: MARGIN,
    paddingBottom: MARGIN + (options.bottomInset ?? 0),
    boxSizing: "border-box",
    fontFamily: FONT_FAMILY,
    color: p.text,
    justifyContent: "space-between",
    overflow: "hidden",
  };
  if (options.photo) {
    // The scrim is the first layer, so it sits over the photograph and under everything else.
    base.backgroundImage = `${options.photo.scrim}, url(${options.photo.src})`;
    base.backgroundSize = "cover, cover";
    base.backgroundPosition = "center, center";
  } else if (p.isGradient) base.backgroundImage = gradient.css;
  else base.backgroundColor = p.background;
  return col(base, [
    ...(options.decoration ?? []),
    options.header === null ? h("div", { display: "flex", height: 0 }, "") : (options.header ?? h("div", { display: "flex" }, "")),
    col({ display: "flex", flexGrow: 1, justifyContent: options.align ?? "center", width: inner }, body),
    footer(tone, ctx, options.cue, inner),
  ]);
}

/** Concentric rings — the sun motif. Only on the gradient slides. */
function rings(): unknown[] {
  const stroke = "rgba(20,20,20,0.16)";
  return [
    h("div", { position: "absolute", right: -340, bottom: -340, width: 980, height: 980, borderRadius: 490, border: `3px solid ${stroke}` }, ""),
    h("div", { position: "absolute", right: -200, bottom: -200, width: 700, height: 700, borderRadius: 350, border: `3px solid ${stroke}` }, ""),
  ];
}

/** A large icon bled off the edge, very low contrast — texture, not decoration. */
function watermark(name: string | undefined, tone: ToneName): unknown[] {
  // On paper the type and the hairlines carry the slide; a ghosted icon there is just noise.
  if (!name || tone === "light") return [];
  const color = tone === "ink" ? "rgba(250,250,250,0.10)" : "rgba(20,20,20,0.12)";
  const img = iconImg(name, 580, color, { position: "absolute", right: -110, bottom: -100 }, 1.2);
  return img ? [img] : [];
}

/** On a cover the icon sits in the top corner, where it never fights the headline. */
function cornerMark(name: string | undefined, tone: ToneName): unknown[] {
  if (!name) return [];
  const color = tone === "ink" ? "rgba(250,250,250,0.14)" : tone === "sun" ? "rgba(20,20,20,0.18)" : "rgba(20,20,20,0.07)";
  const img = iconImg(name, 340, color, { position: "absolute", right: 56, top: 44 }, 1.4);
  return img ? [img] : [];
}

const CONTENT = CANVAS.carousel.width - MARGIN * 2;

/* ---------------------------------------------------------------- templates */

/**
 * A photograph behind the words.
 *
 * Both the picture and the scrim over it are background layers on the frame itself rather
 * than elements inside it. Satori paints images and absolutely positioned children after
 * the text, so a backdrop built from elements ends up on top of the headline; a background
 * is painted first, as a background should be. The scrim is heavier where the type sits so
 * the words hold up against whatever the photo is doing, and a slide on a photo switches
 * its chrome to the dark tone to keep the pill and the handle legible.
 */
interface PhotoBackdrop {
  photo?: { src: string; scrim: string };
  onPhoto: boolean;
}

function photoBackdrop(slide: Slide, ctx: RenderContext, weight: "bottom" | "even" = "bottom"): PhotoBackdrop {
  const src = slide.image ? ctx.images?.[slide.image] : undefined;
  if (!src) {
    if (slide.image) note(ctx, `Slide ${ctx.index + 1} refers to an image that is not in the post's media folder (${slide.image})`);
    return { onPhoto: false };
  }
  const scrim =
    weight === "bottom"
      ? "linear-gradient(180deg, rgba(15,15,15,0.42) 0%, rgba(15,15,15,0.18) 30%, rgba(15,15,15,0.72) 62%, rgba(15,15,15,0.94) 100%)"
      : "linear-gradient(180deg, rgba(15,15,15,0.70) 0%, rgba(15,15,15,0.78) 100%)";
  return { photo: { src, scrim }, onPhoto: true };
}

function coverSlide(
  slide: Slide,
  tone: ToneName,
  ctx: RenderContext,
  size: { width: number; height: number } = CANVAS.carousel,
  bottomInset = 0,
): Node {
  const photo = photoBackdrop(slide, ctx, "bottom");
  const chromeTone: ToneName = photo.onPhoto ? "ink" : tone;
  const p = tonePalette(chromeTone);
  const tall = size.height - bottomInset > 1500;
  const width = size.width - MARGIN * 2;
  const body: unknown[] = [];
  if (slide.title) {
    body.push(
      fitted(slide.title, width, scaleOf("display", { max: tall ? 150 : 128, min: 68 }), p.text, ctx, {
        maxLines: 5,
        maxHeight: tall ? 760 : 620,
        label: "Headline",
      }),
    );
  }
  if (slide.body) {
    body.push(
      fitted(slide.body, Math.round(width * 0.86), scaleOf("lead", { max: 46, min: 32 }), photo.onPhoto ? "rgba(250,250,250,0.88)" : p.muted, ctx, {
        maxLines: 4,
        label: "Subtitle",
        marginTop: 36,
      }),
    );
  }
  body.push(h("div", { display: "flex", height: 56 }, ""));
  return frame(chromeTone, ctx, body, {
    width: size.width,
    height: size.height,
    bottomInset,
    cue: "swipe",
    align: "flex-end",
    photo: photo.photo,
    header: header(slide, chromeTone, { ...ctx, total: 1 }, width),
    decoration: photo.onPhoto ? [] : [...(tone === "sun" ? rings() : []), ...cornerMark(slide.icon ?? "mountain", tone)],
  });
}

function statementSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const photo = photoBackdrop(slide, ctx, "even");
  const chromeTone: ToneName = photo.onPhoto ? "ink" : tone;
  const p = tonePalette(chromeTone);
  const body: unknown[] = [
    h("div", { display: "flex", width: 140, height: 8, backgroundColor: p.accent, borderRadius: 4, marginBottom: 48 }, ""),
  ];
  if (slide.title) {
    body.push(fitted(slide.title, CONTENT, scaleOf("title", { max: 104, min: 58 }), p.text, ctx, { maxLines: 6, maxHeight: 700, label: "Statement" }));
  }
  if (slide.body) {
    body.push(fitted(slide.body, Math.round(CONTENT * 0.9), scaleOf("body", { max: 40, min: 28 }), p.muted, ctx, { maxLines: 5, label: "Body", marginTop: 40 }));
  }
  return frame(chromeTone, ctx, body, {
    photo: photo.photo,
    header: header(slide, chromeTone, ctx),
    decoration: photo.onPhoto ? [] : watermark(slide.icon, tone),
  });
}

function pointSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const p = tonePalette(tone);
  const hasStep = Boolean(slide.step);
  const gutter = hasStep ? 150 : 0;
  const textWidth = CONTENT - gutter;
  const right: unknown[] = [];
  if (slide.title) {
    right.push(fitted(slide.title, textWidth, scaleOf("heading", { max: 78, min: 44 }), p.text, ctx, { maxLines: 5, maxHeight: 420, label: "Point" }));
  }
  if (slide.body) {
    right.push(fitted(slide.body, textWidth, scaleOf("body", { max: 38, min: 28 }), p.muted, ctx, { maxLines: 7, label: "Body", marginTop: 32 }));
  }
  if (slide.callout) {
    right.push(
      row(
        {
          marginTop: 44,
          width: textWidth,
          backgroundColor: tone === "ink" ? primitive("Neutral/900") : primitive("Orange/50"),
          border: `2px solid ${tone === "ink" ? primitive("Neutral/800") : primitive("Orange/100")}`,
          borderLeft: `10px solid ${primitive("Orange/500")}`,
          borderRadius: 20,
          padding: "30px 34px",
        },
        [
          col({ width: textWidth - 110 }, [
            ...(slide.callout.label
              ? [h("div", { display: "flex", fontSize: 24, fontWeight: 700, color: primitive("Orange/700"), marginBottom: 10 }, slide.callout.label)]
              : []),
            fitted(slide.callout.text, textWidth - 120, scaleOf("body", { max: 34, min: 26 }), p.text, ctx, { maxLines: 4, label: "Callout" }),
          ]),
        ],
      ),
    );
  }

  const stepColumn = hasStep
    ? col({ width: gutter, alignItems: "flex-start" }, [
        row(
          {
            width: 96,
            height: 96,
            borderRadius: 48,
            border: `4px solid ${p.accent}`,
            alignItems: "center",
            justifyContent: "center",
          },
          [h("div", { display: "flex", fontSize: 48, fontWeight: 800, color: p.text, letterSpacing: -1 }, slide.step ?? "")],
        ),
        h("div", { display: "flex", width: 4, flexGrow: 1, marginLeft: 46, marginTop: 20, backgroundColor: p.line }, ""),
      ])
    : null;

  const body = [row({ width: CONTENT, alignItems: "stretch" }, [...(stepColumn ? [stepColumn] : []), col({ width: textWidth }, right)])];
  return frame(tone, ctx, body, { header: header(slide, tone, ctx), decoration: watermark(slide.icon, tone) });
}

function bulletsSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const p = tonePalette(tone);
  const items: Item[] = (slide.items ?? []).slice(0, 6);
  const style = slide.listStyle ?? "icons";
  const body: unknown[] = [];
  if (slide.title) {
    body.push(fitted(slide.title, CONTENT, scaleOf("heading", { max: 68, min: 42 }), p.text, ctx, { maxLines: 3, maxHeight: 250, label: "Title", marginTop: 80 }));
  }
  const dense = items.length >= 5;
  const titleScale = scaleOf("lead", { max: dense ? 38 : 44, min: 28, weight: 700 });
  const detailScale = scaleOf("body", { max: dense ? 30 : 34, min: 24 });
  const markSize = dense ? 72 : 84;
  const textWidth = CONTENT - markSize - 32;

  const rowsNode = col({ width: CONTENT, marginTop: 48 }, [
    ...items.map((item, i) => {
      const mark =
        style === "numbers"
          ? row(
              { width: markSize, height: markSize, borderRadius: markSize / 2, border: `3px solid ${p.accent}`, alignItems: "center", justifyContent: "center" },
              [h("div", { display: "flex", fontSize: dense ? 32 : 38, fontWeight: 800, color: p.text }, String(i + 1))],
            )
          : row(
              {
                width: markSize,
                height: markSize,
                borderRadius: 20,
                backgroundColor: tone === "ink" ? primitive("Neutral/900") : primitive("Orange/100"),
                alignItems: "center",
                justifyContent: "center",
              },
              [iconImg(style === "checks" ? "check" : (item.icon ?? "chevron-right"), dense ? 38 : 44, primitive("Orange/700"), {}, 2.2)],
            );
      return row(
        {
          width: CONTENT,
          alignItems: "flex-start",
          paddingTop: i === 0 ? 0 : dense ? 26 : 32,
          paddingBottom: dense ? 26 : 32,
          borderBottom: i === items.length - 1 ? "none" : `2px solid ${p.line}`,
        },
        [
          mark,
          col({ width: textWidth, marginLeft: 32 }, [
            fitted(item.title, textWidth, titleScale, p.text, ctx, { maxLines: 2, label: `Item ${i + 1}` }),
            ...(item.detail
              ? [fitted(item.detail, textWidth, detailScale, p.muted, ctx, { maxLines: 3, label: `Item ${i + 1} detail`, marginTop: 8 })]
              : []),
          ]),
        ],
      );
    }),
  ]);
  body.push(rowsNode);
  if (slide.footnote) {
    body.push(h("div", { display: "flex", marginTop: 36, fontSize: 26, fontWeight: 500, color: p.faint }, slide.footnote));
  }
  return frame(tone, ctx, body, { align: "flex-start", header: header(slide, tone, ctx) });
}

function compareSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const p = tonePalette(tone);
  const body: unknown[] = [];
  if (slide.title) {
    body.push(fitted(slide.title, CONTENT, scaleOf("heading", { max: 64, min: 40 }), p.text, ctx, { maxLines: 3, maxHeight: 230, label: "Title", marginTop: 80 }));
  }
  const colWidth = Math.floor((CONTENT - 32) / 2);
  const sides = [
    { side: slide.left, kind: "left" as const },
    { side: slide.right, kind: "right" as const },
  ].filter((s) => s.side);

  const sideNode = (side: NonNullable<Slide["left"]>, kind: "left" | "right") => {
    const warm = kind === "right";
    const bg = tone === "ink" ? primitive("Neutral/900") : warm ? primitive("Green/50") : primitive("Red/50");
    const line = tone === "ink" ? primitive("Neutral/800") : warm ? primitive("Green/100") : primitive("Red/100");
    const markColor = warm ? primitive("Green/700") : primitive("Red/700");
    const inner = colWidth - 68;
    return col(
      { width: colWidth, backgroundColor: bg, border: `2px solid ${line}`, borderRadius: 24, padding: 32 },
      [
        row({ alignItems: "center", marginBottom: 26 }, [
          iconImg(side.icon ?? (warm ? "check-circle" : "x-circle"), 44, markColor, { marginRight: 14 }, 2),
          h("div", { display: "flex", fontSize: 36, fontWeight: 700, color: p.text }, side.heading),
        ]),
        ...side.items.slice(0, 5).map((t, i) =>
          row({ width: inner, alignItems: "flex-start", marginTop: i === 0 ? 0 : 20 }, [
            h("div", { display: "flex", width: 10, height: 10, borderRadius: 5, backgroundColor: markColor, marginTop: 14, marginRight: 16 }, ""),
            fitted(t, inner - 26, scaleOf("body", { max: 30, min: 24 }), p.muted, ctx, { maxLines: 3, label: `Compare item ${i + 1}` }),
          ]),
        ),
      ],
    );
  };

  body.push(
    row({ width: CONTENT, marginTop: 44, alignItems: "stretch", justifyContent: "space-between" }, sides.map((s) => sideNode(s.side!, s.kind))),
  );
  if (slide.footnote) body.push(h("div", { display: "flex", marginTop: 32, fontSize: 26, fontWeight: 500, color: p.faint }, slide.footnote));
  return frame(tone, ctx, body, { align: "flex-start", header: header(slide, tone, ctx) });
}

function statSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const p = tonePalette(tone);
  const body: unknown[] = [];
  const value = slide.stat?.value ?? slide.title ?? "";
  body.push(fitted(value, CONTENT, scaleOf("display", { max: 230, min: 96 }), p.text, ctx, { maxLines: 2, maxHeight: 520, label: "Stat" }));
  if (slide.stat?.label) {
    body.push(fitted(slide.stat.label, CONTENT, scaleOf("heading", { max: 54, min: 36 }), p.accent === p.text ? p.muted : primitive("Orange/700"), ctx, { maxLines: 2, label: "Stat label", marginTop: 20 }));
  }
  if (slide.body) {
    body.push(fitted(slide.body, Math.round(CONTENT * 0.92), scaleOf("body", { max: 36, min: 26 }), p.muted, ctx, { maxLines: 5, label: "Body", marginTop: 40 }));
  }
  if (slide.footnote) body.push(h("div", { display: "flex", marginTop: 28, fontSize: 24, fontWeight: 500, color: p.faint }, slide.footnote));
  return frame(tone, ctx, body, { header: header(slide, tone, ctx), decoration: watermark(slide.icon, tone) });
}

function photoSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const photo = photoBackdrop(slide, ctx, "bottom");
  const chromeTone: ToneName = photo.onPhoto ? "ink" : tone;
  const p = tonePalette(chromeTone);
  const textColor = photo.onPhoto ? primitive("Neutral/50") : p.text;
  const mutedColor = photo.onPhoto ? "rgba(250,250,250,0.86)" : p.muted;

  const body: unknown[] = [h("div", { display: "flex", flexGrow: 1 }, "")];
  if (slide.title) {
    body.push(fitted(slide.title, CONTENT, scaleOf("title", { max: 92, min: 52 }), textColor, ctx, { maxLines: 4, maxHeight: 420, label: "Caption" }));
  }
  if (slide.body) {
    body.push(
      fitted(slide.body, Math.round(CONTENT * 0.88), scaleOf("body", { max: 36, min: 26 }), mutedColor, ctx, {
        maxLines: 4,
        label: "Body",
        marginTop: 24,
      }),
    );
  }
  return frame(chromeTone, ctx, body, {
    photo: photo.photo,
    header: header(slide, chromeTone, ctx),
  });
}

function ctaSlide(slide: Slide, tone: ToneName, ctx: RenderContext): Node {
  const photo = photoBackdrop(slide, ctx, "even");
  const chromeTone: ToneName = photo.onPhoto ? "ink" : tone;
  const p = tonePalette(chromeTone);
  const body: unknown[] = [];
  if (slide.title) {
    body.push(fitted(slide.title, CONTENT, scaleOf("title", { max: 104, min: 58 }), p.text, ctx, { maxLines: 4, maxHeight: 460, label: "CTA" }));
  }
  if (slide.body) {
    body.push(fitted(slide.body, Math.round(CONTENT * 0.86), scaleOf("lead", { max: 42, min: 30 }), p.muted, ctx, { maxLines: 3, label: "Body", marginTop: 32 }));
  }
  const actions = slide.actions ?? [];
  if (actions.length) {
    body.push(
      col(
        { width: CONTENT, marginTop: 56 },
        actions.slice(0, 3).map((action, i) =>
          row({ alignItems: "center", marginTop: i === 0 ? 0 : 26 }, [
            row(
              {
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: tone === "sun" ? "#fafafa" : tone === "ink" ? primitive("Neutral/900") : primitive("Orange/50"),
                alignItems: "center",
                justifyContent: "center",
                marginRight: 26,
              },
              [iconImg(action.icon ?? "bookmark", 40, tone === "sun" ? primitive("Neutral/950") : primitive("Orange/600"), {}, 2)],
            ),
            h("div", { display: "flex", fontSize: 40, fontWeight: 600, color: p.text }, action.label),
          ]),
        ),
      ),
    );
  }
  return frame(chromeTone, ctx, body, {
    cue: "none",
    photo: photo.photo,
    header: header(slide, chromeTone, ctx),
    decoration: photo.onPhoto ? [] : tone === "sun" ? rings() : watermark(slide.icon, tone),
  });
}

/* ---------------------------------------------------------------- dispatch */

/** Default tone per template, honouring the light palette unless the slide says otherwise. */
export function toneFor(slide: Slide): ToneName {
  if (slide.tone) return slide.tone;
  if (slide.template === "cover" || slide.template === "cta") return "sun";
  return "light";
}

export function buildSlide(slide: Slide, ctx: RenderContext): Node {
  const tone = toneFor(slide);
  switch (slide.template) {
    case "cover":
      return coverSlide(slide, tone, ctx);
    case "statement":
      return statementSlide(slide, tone, ctx);
    case "point":
      return pointSlide(slide, tone, ctx);
    case "bullets":
      return bulletsSlide(slide, tone, ctx);
    case "compare":
      return compareSlide(slide, tone, ctx);
    case "stat":
      return statSlide(slide, tone, ctx);
    case "photo":
      return photoSlide(slide, tone, ctx);
    case "cta":
      return ctaSlide(slide, tone, ctx);
    default:
      return statementSlide(slide, tone, ctx);
  }
}

/**
 * Reel cover: 1080×1920, with the headline held inside the top 1440px so the profile
 * grid crop never cuts it.
 */
export function buildReelCover(slide: Slide, ctx: RenderContext): Node {
  const tone = toneFor({ ...slide, template: "cover" });
  return coverSlide(
    { ...slide, template: "cover" },
    tone,
    { ...ctx, total: 1 },
    { width: CANVAS.reelCover.width, height: CANVAS.reelCover.height },
    CANVAS.reelCover.height - CANVAS.reelCover.gridSafeHeight,
  );
}

export { CONTENT as CONTENT_WIDTH, MARGIN as SAFE_MARGIN };
