import tokens from "../../brand/trilyt.tokens.json";

/**
 * Trilyt design tokens, read from brand/trilyt.tokens.json (the single source of truth,
 * extracted from the Figma file). The UI, the slide renderer and the brand page all go
 * through here so nothing hard-codes a hex value.
 */

export type Mode = "light" | "dark";

type SemanticEntry = { light: string; dark: string };
const primitives = tokens.color.primitive as Record<string, string>;
const semantics = tokens.color.semantic as Record<string, SemanticEntry>;

export function primitive(name: string): string {
  const value = primitives[name];
  if (!value) throw new Error(`Unknown primitive colour token: ${name}`);
  return value;
}

export function semantic(name: string, mode: Mode = "light"): string {
  const entry = semantics[name];
  if (!entry) throw new Error(`Unknown semantic colour token: ${name}`);
  return primitive(entry[mode]);
}

/** Resolve "#hex", "rgba(...)", a semantic token ("Text/Primary") or a primitive ("Orange/500"). */
export function color(ref: string, mode: Mode = "light"): string {
  if (ref.startsWith("#") || ref.startsWith("rgb")) return ref;
  if (ref in semantics) return semantic(ref, mode);
  return primitive(ref);
}

export const gradient = {
  from: primitive(tokens.gradient.brand.from),
  to: primitive(tokens.gradient.brand.to),
  css: `linear-gradient(180deg, ${primitive(tokens.gradient.brand.from)} 0%, ${primitive(tokens.gradient.brand.to)} 100%)`,
};

export const typography = tokens.typography;
export const social = tokens.social;
export const radius = tokens.radius as Record<string, number>;
export const spacing = tokens.spacing;
export const shadow = tokens.shadow;
export const meta = tokens.meta;

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** All tokens as CSS custom properties for the app UI. */
export function cssVariables(mode: Mode = "light"): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(primitives)) lines.push(`--${slug(name)}:${value};`);
  for (const [name, entry] of Object.entries(semantics)) lines.push(`--${slug(name)}:${primitive(entry[mode])};`);
  for (const [name, value] of Object.entries(tokens.spacing.scale)) lines.push(`--scale-${slug(name)}:${value}px;`);
  for (const [name, value] of Object.entries(tokens.radius)) lines.push(`--radius-${slug(name)}:${value === 50 ? 999 : value}px;`);
  for (const [name, value] of Object.entries(tokens.typography.fontSize)) lines.push(`--font-size-${slug(name)}:${value}px;`);
  lines.push(`--gradient-brand:${gradient.css};`);
  lines.push(`--gradient-brand-from:${gradient.from};--gradient-brand-to:${gradient.to};`);
  const cardShadow = tokens.shadow.Card.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`).join(", ");
  lines.push(`--shadow-card:${cardShadow};`);
  const med = tokens.shadow.Medium.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`).join(", ");
  lines.push(`--shadow-medium:${med};`);
  const lg = tokens.shadow.Large.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`).join(", ");
  lines.push(`--shadow-large:${lg};`);
  return `:root{${lines.join("")}}`;
}

export type ToneName = "light" | "sun" | "ink";

export interface TonePalette {
  name: ToneName;
  /** CSS background value (colour or gradient) */
  background: string;
  isGradient: boolean;
  text: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  /** solid colour that reads as the background (used for contrast cut-outs) */
  surface: string;
  /** fill for pills and cards sitting on this tone */
  chip: string;
  chipText: string;
  chipBorder: string;
}

export function tonePalette(name: ToneName): TonePalette {
  const t = tokens.social.tones[name];
  const isGradient = t.background === "gradient.brand";
  const text = color(t.text);
  const muted = color(t.muted);
  const faint = color(t.faint);
  const line = color(t.line);
  const accent = color(t.accent);
  const surface = isGradient ? gradient.from : color(t.background);
  if (name === "light") {
    return {
      name,
      background: surface,
      isGradient,
      text,
      muted,
      faint,
      line,
      accent,
      surface,
      chip: primitive("Orange/50"),
      chipText: text,
      chipBorder: primitive("Orange/100"),
    };
  }
  if (name === "sun") {
    return {
      name,
      background: gradient.css,
      isGradient,
      text,
      muted,
      faint,
      line,
      accent,
      surface,
      chip: "#fafafa",
      chipText: text,
      chipBorder: "#fafafa",
    };
  }
  return {
    name,
    background: surface,
    isGradient,
    text,
    muted,
    faint,
    line,
    accent,
    surface,
    chip: primitive("Neutral/900"),
    chipText: text,
    chipBorder: primitive("Neutral/800"),
  };
}
