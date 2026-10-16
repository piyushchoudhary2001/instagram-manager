/**
 * opentype.js ships JavaScript only. The slide renderer uses one call from it —
 * measuring a string's advance width — so this is the slice of the API we rely on.
 */
declare module "opentype.js" {
  export interface Font {
    unitsPerEm: number;
    getAdvanceWidth(text: string, fontSize: number, options?: { kerning?: boolean; letterSpacing?: number }): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const _default: { parse(buffer: ArrayBuffer): Font };
  export default _default;
}
