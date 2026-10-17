import satori from "satori";
import { primitive } from "../brand";
import { loadFonts, FONT_FAMILY } from "../render/fonts";
import { fitStyle, fitText } from "../render/measure";
import { svgToPng } from "../render/render";

/**
 * Captions.
 *
 * They are drawn with the same engine as the slides — Manrope, auto-fitted, stacked as
 * boxed lines — and rendered to a transparent PNG that ffmpeg composites over the footage.
 *
 * Doing it this way rather than with ffmpeg's drawtext matters twice over: the words come
 * out in the brand's own type instead of whatever the filter can manage, and the cut no
 * longer needs an ffmpeg built with libfreetype, which many installs are not.
 */

export const REEL = { width: 1080, height: 1920 } as const;
export const SIDE_MARGIN = 88;
/** Instagram's own buttons cover the bottom of the frame; nothing readable goes below this. */
export const BOTTOM_SAFE = 1460;
const TEXT_WIDTH = REEL.width - SIDE_MARGIN * 2;

export type CaptionStyle = "hook" | "beat";

type Style = Record<string, string | number | undefined>;
interface Node {
  type: string;
  props: { style?: Style; children?: unknown };
}

const h = (type: string, style: Style, children?: unknown): Node => ({ type, props: { style, children } });

const SCALES = {
  hook: { weight: 800, max: 112, min: 56, lineHeight: 1.1, letterSpacing: -0.02 },
  beat: { weight: 800, max: 76, min: 40, lineHeight: 1.14, letterSpacing: -0.015 },
} as const;

export interface CaptionLayout {
  lines: string[];
  fontSize: number;
  top: number;
  overflow: boolean;
}

/** A hook fills the middle of the frame; a beat caption sits above Instagram's controls. */
export function layoutCaption(text: string, style: CaptionStyle): CaptionLayout {
  const clean = text.trim();
  if (!clean) return { lines: [], fontSize: 0, top: 0, overflow: false };

  const scale = SCALES[style];
  const fit = fitText(clean, TEXT_WIDTH, scale, { maxLines: style === "hook" ? 5 : 4 });
  const step = Math.round(fit.fontSize * scale.lineHeight) + Math.round(fit.fontSize * 0.2);
  const blockHeight = fit.lines.length * step;
  const top = style === "hook" ? Math.round(REEL.height * 0.42 - blockHeight / 2) : Math.round(BOTTOM_SAFE - blockHeight);

  return { lines: fit.lines, fontSize: fit.fontSize, top, overflow: fit.overflow };
}

function lineBlock(layout: CaptionLayout, style: CaptionStyle): Node {
  const scale = SCALES[style];
  const pad = Math.round(layout.fontSize * 0.3);
  const gap = Math.round(layout.fontSize * 0.2);
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: REEL.width,
      position: "absolute",
      left: 0,
      top: layout.top,
    },
    layout.lines.map((line, i) =>
      h(
        "div",
        {
          display: "flex",
          marginTop: i === 0 ? 0 : gap,
          padding: `${Math.round(pad * 0.45)}px ${pad}px ${Math.round(pad * 0.62)}px`,
          borderRadius: 12,
          backgroundColor: "rgba(15,15,15,0.82)",
          color: primitive("Neutral/50"),
          fontSize: layout.fontSize,
          fontWeight: scale.weight,
          lineHeight: scale.lineHeight,
          letterSpacing: Math.round(scale.letterSpacing * layout.fontSize * 100) / 100,
        },
        line,
      ),
    ),
  );
}

export interface OverlayRequest {
  text: string;
  style: CaptionStyle;
  /** sign off with the handle, for the last beat */
  handle?: string;
}

/** The caption layer for one beat: transparent everywhere the words are not. */
export async function captionOverlayPng(request: OverlayRequest): Promise<{ png: Buffer; overflow: boolean } | null> {
  const layout = layoutCaption(request.text, request.style);
  if (layout.lines.length === 0 && !request.handle) return null;

  const children: Node[] = [];
  if (layout.lines.length > 0) children.push(lineBlock(layout, request.style));
  if (request.handle) {
    children.push(
      h(
        "div",
        {
          display: "flex",
          position: "absolute",
          left: 0,
          top: BOTTOM_SAFE + 120,
          width: REEL.width,
          justifyContent: "center",
          fontSize: 30,
          fontWeight: 600,
          color: "rgba(250,250,250,0.78)",
        },
        request.handle,
      ),
    );
  }

  const tree = h(
    "div",
    { display: "flex", position: "relative", width: REEL.width, height: REEL.height, fontFamily: FONT_FAMILY },
    children,
  );

  const svg = await satori(tree as never, { width: REEL.width, height: REEL.height, fonts: loadFonts() });
  return { png: svgToPng(svg, REEL.width), overflow: layout.overflow };
}
