/**
 * Colors for the scene's orbital/hybridization labels, chosen per background
 * so the text stays readable. Pure logic — no Three.js — so it can be
 * unit-tested in isolation (tests/label-colors.test.ts).
 *
 * Dark canvases get pale tints (they read as glows against the navy/charcoal
 * presets); light canvases get the same hues darkened to hold WCAG contrast
 * against white.
 */

export interface LabelPalette {
  sigma: string;
  pi: string;
  lonePair: string;
  hybrid: string;
}

/** Pale tints for the original dark navy/charcoal backgrounds. */
export const DARK_BG_LABELS: LabelPalette = {
  sigma: '#88bbff',
  pi: '#ffaa44',
  lonePair: '#ffdd44',
  hybrid: '#aaffaa',
};

/** Darkened equivalents of the same hues — ≥4.5:1 contrast against white. */
export const LIGHT_BG_LABELS: LabelPalette = {
  sigma: '#1d4ed8',
  pi: '#b45309',
  lonePair: '#a16207',
  hybrid: '#15803d',
};

/** Pick the palette whose colors read on the given background color. */
export function labelPaletteFor(bgHex: string): LabelPalette {
  return isLightBackground(bgHex) ? LIGHT_BG_LABELS : DARK_BG_LABELS;
}

/**
 * Whether a #rrggbb background counts as "light" — sRGB-relative luminance
 * above 0.5 (white = 1, black = 0). Unknown/malformed values fall back to
 * dark, the safer default for pale label text.
 */
export function isLightBackground(bgHex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(bgHex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 0xff);
  const g = lin((n >> 8) & 0xff);
  const b = lin(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}