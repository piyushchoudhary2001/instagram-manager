import path from "node:path";
import { primitive } from "../brand";
import { fitText } from "../render/measure";
import { WEIGHT_FILES } from "../render/fonts";

/**
 * Burned-in captions, in the same Manrope and the same rhythm as the slides.
 *
 * Most people watch muted, so the words are the video. Each line is drawn as its own
 * box — the stacked-pill look — which stays readable over any footage and matches the
 * pills on the carousels.
 */

export const REEL = { width: 1080, height: 1920 } as const;
export const SIDE_MARGIN = 88;
/** Instagram's own UI covers the bottom of the frame; nothing readable goes below this. */
export const BOTTOM_SAFE = 1460;
const TEXT_WIDTH = REEL.width - SIDE_MARGIN * 2;

export type CaptionStyle = "hook" | "beat";

export interface CaptionLine {
  text: string;
  fontSize: number;
  fontFile: string;
  x: "center";
  y: number;
  color: string;
  boxColor: string;
  boxPadding: number;
}

export interface CaptionBlock {
  lines: CaptionLine[];
  overflow: boolean;
}

const fontPath = (weight: number): string => path.join(process.cwd(), "brand", "fonts", WEIGHT_FILES[weight]);

/**
 * A hook fills the middle of the frame; a beat caption sits in the lower third, above
 * Instagram's own controls. Both auto-fit, so a long line shrinks instead of spilling.
 */
export function layoutCaption(text: string, style: CaptionStyle): CaptionBlock {
  const clean = text.trim();
  if (!clean) return { lines: [], overflow: false };

  const scale =
    style === "hook"
      ? { weight: 800, max: 112, min: 56, lineHeight: 1.1, letterSpacing: -0.02 }
      : { weight: 800, max: 76, min: 40, lineHeight: 1.14, letterSpacing: -0.015 };

  const fit = fitText(clean, TEXT_WIDTH, scale, { maxLines: style === "hook" ? 5 : 4 });
  const lineHeight = Math.round(fit.fontSize * scale.lineHeight);
  const gap = Math.round(fit.fontSize * 0.22);
  const step = lineHeight + gap;
  const blockHeight = fit.lines.length * step - gap;

  const top =
    style === "hook"
      ? Math.round(REEL.height * 0.42 - blockHeight / 2)
      : Math.round(BOTTOM_SAFE - blockHeight);

  const boxPadding = Math.round(fit.fontSize * 0.3);

  return {
    overflow: fit.overflow,
    lines: fit.lines.map((line, i) => ({
      text: line,
      fontSize: fit.fontSize,
      fontFile: fontPath(scale.weight),
      x: "center" as const,
      y: top + i * step,
      color: primitive("Neutral/50"),
      boxColor: `${primitive("Neutral/950")}@0.82`,
      boxPadding,
    })),
  };
}

/** The handle, bottom left, same as the slides sign off. */
export function handleLine(handle: string): CaptionLine {
  return {
    text: handle,
    fontSize: 30,
    fontFile: fontPath(600),
    x: "center",
    y: BOTTOM_SAFE + 120,
    color: `${primitive("Neutral/50")}@0.72`,
    boxColor: "black@0.0",
    boxPadding: 0,
  };
}

/** ffmpeg filter arguments need their own escaping; the text itself goes in a file. */
export function escapeFilterPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function drawtextFilter(line: CaptionLine, textFile: string): string {
  const parts = [
    `fontfile=${escapeFilterPath(line.fontFile)}`,
    `textfile=${escapeFilterPath(textFile)}`,
    `fontsize=${line.fontSize}`,
    `fontcolor=${line.color}`,
    "x=(w-text_w)/2",
    `y=${line.y}`,
    "line_spacing=0",
  ];
  if (line.boxPadding > 0) {
    parts.push("box=1", `boxcolor=${line.boxColor}`, `boxborderw=${line.boxPadding}`);
  }
  return `drawtext=${parts.join(":")}`;
}
