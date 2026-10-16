import { metricsFor } from "./fonts";

/**
 * Text fitting. Slide copy comes from a writer, not a designer, so every headline is a
 * different length. These helpers measure the real Manrope advance widths and pick the
 * largest size in the scale's range that still fits the box — so nothing overflows and
 * short lines still fill the slide.
 */

export interface TypeScale {
  weight: number;
  /** largest size to try, in px */
  max: number;
  /** smallest acceptable size, in px */
  min: number;
  /** multiple of the font size */
  lineHeight: number;
  /** fraction of the font size (em) */
  letterSpacing: number;
}

export function advance(text: string, size: number, weight: number, letterSpacing = 0): number {
  if (!text) return 0;
  const font = metricsFor(weight);
  const base = font.getAdvanceWidth(text, size, { kerning: true });
  return base + letterSpacing * size * Math.max(0, text.length - 1);
}

/** Greedy word wrap against a real measured width. Long single words are left long (CSS would break them). */
export function wrap(text: string, size: number, weight: number, maxWidth: number, letterSpacing = 0): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (advance(candidate, size, weight, letterSpacing) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FitResult {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  weight: number;
  lines: string[];
  width: number;
  height: number;
  /** true when even the minimum size overflows the box */
  overflow: boolean;
}

export interface FitOptions {
  /** hard cap on lines; overflow is reported if the text needs more */
  maxLines?: number;
  /** box height in px; overflow is reported if the wrapped text is taller */
  maxHeight?: number;
  /** step down in px while searching */
  step?: number;
}

/** Largest size in [min, max] whose wrapped text fits both maxLines and maxHeight. */
export function fitText(text: string, boxWidth: number, scale: TypeScale, options: FitOptions = {}): FitResult {
  const { maxLines, maxHeight, step = 2 } = options;
  const ls = scale.letterSpacing;
  const clean = text.replace(/\s+\n/g, "\n").trim();
  let last: FitResult | null = null;
  for (let size = Math.round(scale.max); size >= scale.min; size -= step) {
    const lines = wrap(clean, size, scale.weight, boxWidth, ls);
    const height = lines.length * size * scale.lineHeight;
    const widest = lines.reduce((w, l) => Math.max(w, advance(l, size, scale.weight, ls)), 0);
    const result: FitResult = {
      fontSize: size,
      lineHeight: scale.lineHeight,
      letterSpacing: ls,
      weight: scale.weight,
      lines,
      width: widest,
      height,
      overflow: false,
    };
    last = result;
    const linesOk = maxLines === undefined || lines.length <= maxLines;
    const heightOk = maxHeight === undefined || height <= maxHeight;
    if (linesOk && heightOk) return result;
  }
  const fallback = last ?? {
    fontSize: scale.min,
    lineHeight: scale.lineHeight,
    letterSpacing: ls,
    weight: scale.weight,
    lines: [clean],
    width: advance(clean, scale.min, scale.weight, ls),
    height: scale.min * scale.lineHeight,
    overflow: true,
  };
  return { ...fallback, overflow: true };
}

/** CSS-ready values for a fitted block: Satori wants px letterSpacing, not em. */
export function fitStyle(fit: FitResult): {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
} {
  return {
    fontSize: fit.fontSize,
    fontWeight: fit.weight,
    lineHeight: fit.lineHeight,
    letterSpacing: Math.round(fit.letterSpacing * fit.fontSize * 100) / 100,
  };
}

/** Height a block of body text needs at a fixed size (for laying out stacked blocks). */
export function blockHeight(text: string, size: number, weight: number, boxWidth: number, lineHeight: number, letterSpacing = 0): number {
  return wrap(text, size, weight, boxWidth, letterSpacing).length * size * lineHeight;
}
