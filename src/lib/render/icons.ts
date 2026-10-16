import iconFile from "../../../brand/icons.json";

/**
 * Trilyt icons for the slide renderer. Satori does not draw <use> or CSS masks, so each
 * icon becomes a standalone SVG string and goes into the tree as a data URI <img> —
 * which also lets the colour and the stroke weight be set per slide.
 */

const strokeIcons = iconFile.icons as Record<string, string>;
const filledIcons = iconFile.filled as Record<string, string>;

export const ICON_NAMES: string[] = [...Object.keys(strokeIcons), ...Object.keys(filledIcons)].sort();

export function hasIcon(name: string): boolean {
  return name in strokeIcons || name in filledIcons;
}

export interface IconOptions {
  /** rendered size in px (the artwork is on a 24px grid) */
  size?: number;
  color?: string;
  /** stroke width on the 24px grid; the design system uses 1.5 */
  stroke?: number;
}

/** A complete, standalone SVG for one icon. */
export function iconSvg(name: string, options: IconOptions = {}): string {
  const { size = 24, color = "currentColor", stroke = 1.5 } = options;
  const filled = filledIcons[name];
  if (filled) {
    const body = filled.replace(/currentColor/g, color);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${body}</svg>`;
  }
  const body = strokeIcons[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  const painted = body.replace(/currentColor/g, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${painted}</svg>`;
}

/** The same icon as a data URI, ready for an <img src> inside a Satori tree. */
export function iconUri(name: string, options: IconOptions = {}): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg(name, options))}`;
}

/** Fall back to a safe icon rather than throwing mid-render on a typo in a draft. */
export function iconUriSafe(name: string | undefined, options: IconOptions = {}): string | null {
  if (!name) return null;
  if (!hasIcon(name)) return hasIcon("compass") ? iconUri("compass", options) : null;
  return iconUri(name, options);
}
