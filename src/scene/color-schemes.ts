import type { ColorScheme } from './setup';

export interface SchemeColors {
  sigma: number;  // hex number
  pi: number;
  lonePair: number;
}

export function hsvToHex(h: number, s: number, v: number): number {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

export function hexToHsv(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

// Preset color schemes — each defines sigma, pi, and lone pair as HSV values [h, s, v]
export const COLOR_PRESETS: Record<string, { sigma: [number,number,number]; pi: [number,number,number]; lonePair: [number,number,number] }> = {
  element:         { sigma: [0, 0, 1], pi: [0.58, 0.7, 1],   lonePair: [0.1, 0.7, 1] },
  monochrome:      { sigma: [0.58, 0.7, 1], pi: [0.58, 0.7, 1], lonePair: [0.58, 0.7, 1] },
  pedagogical:     { sigma: [0.05, 0.7, 0.85], pi: [0.58, 0.7, 1], lonePair: [0.45, 0.55, 0.8] },
  complementary:   { sigma: [0.58, 0.7, 1], pi: [0.05, 0.7, 1], lonePair: [0.45, 0.55, 0.8] },
  cool:            { sigma: [0.62, 0.4, 0.8], pi: [0.55, 0.6, 0.85], lonePair: [0.68, 0.3, 0.85] },
  warm:            { sigma: [0.04, 0.6, 0.85], pi: [0.1, 0.6, 0.85], lonePair: [0.07, 0.4, 0.8] },
  highcontrast:    { sigma: [0, 0, 1], pi: [0, 1, 1], lonePair: [0.33, 1, 1] },
  custom:          { sigma: [0.58, 0.7, 1], pi: [0.58, 0.7, 1], lonePair: [0.58, 0.7, 1] },
};

export function getSchemeColors(scheme: ColorScheme): SchemeColors {
  const p = COLOR_PRESETS[scheme];
  return {
    sigma: hsvToHex(p.sigma[0], p.sigma[1], p.sigma[2]),
    pi: hsvToHex(p.pi[0], p.pi[1], p.pi[2]),
    lonePair: hsvToHex(p.lonePair[0], p.lonePair[1], p.lonePair[2]),
  };
}
