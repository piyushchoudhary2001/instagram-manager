import fs from "node:fs";
import path from "node:path";
import * as opentypeNs from "opentype.js";

/**
 * Manrope, as static TTFs in brand/fonts (instanced from the variable font so Satori,
 * which cannot read WOFF2 or variable axes, gets one file per weight).
 */

export const WEIGHT_FILES: Record<number, string> = {
  400: "Manrope-Regular.ttf",
  500: "Manrope-Medium.ttf",
  600: "Manrope-SemiBold.ttf",
  700: "Manrope-Bold.ttf",
  800: "Manrope-ExtraBold.ttf",
};

export const FONT_FAMILY = "Manrope";

const fontsDir = (): string => path.join(process.cwd(), "brand", "fonts");

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600 | 700 | 800;
  style: "normal";
}

let satoriFonts: SatoriFont[] | null = null;

export function loadFonts(): SatoriFont[] {
  if (satoriFonts) return satoriFonts;
  satoriFonts = Object.entries(WEIGHT_FILES).map(([weight, file]) => ({
    name: FONT_FAMILY,
    data: fs.readFileSync(path.join(fontsDir(), file)),
    weight: Number(weight) as SatoriFont["weight"],
    style: "normal" as const,
  }));
  return satoriFonts;
}

/** opentype.js ships both a namespace and a default export depending on the bundler. */
type ParsedFont = {
  unitsPerEm: number;
  getAdvanceWidth: (text: string, size: number, options?: { kerning?: boolean }) => number;
};
type OpentypeModule = { parse?: (buffer: ArrayBuffer) => ParsedFont; default?: { parse: (buffer: ArrayBuffer) => ParsedFont } };

const parseFont = (buffer: ArrayBuffer): ParsedFont => {
  const mod = opentypeNs as unknown as OpentypeModule;
  const parse = mod.parse ?? mod.default?.parse;
  if (!parse) throw new Error("opentype.js has no parse()");
  return parse(buffer);
};

const measured = new Map<number, ParsedFont>();

/** The same TTF, parsed for measuring text so templates can auto-fit before rendering. */
export function metricsFor(weight: number): ParsedFont {
  const nearest = nearestWeight(weight);
  const cached = measured.get(nearest);
  if (cached) return cached;
  const buffer = fs.readFileSync(path.join(fontsDir(), WEIGHT_FILES[nearest]));
  const font = parseFont(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  measured.set(nearest, font);
  return font;
}

export function nearestWeight(weight: number): number {
  const available = Object.keys(WEIGHT_FILES).map(Number);
  return available.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), available[0]);
}
