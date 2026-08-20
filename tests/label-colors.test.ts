import { describe, it, expect } from 'vitest';
import { isLightBackground, labelPaletteFor, DARK_BG_LABELS, LIGHT_BG_LABELS } from '../src/utils/label-colors';

// Standard WCAG relative-luminance / contrast helpers, implemented here
// independently so the test verifies the palette against the spec rather
// than re-running the module's own luminance code.
function hexLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff);
}

function contrast(a: string, b: string): number {
  const la = hexLuminance(a);
  const lb = hexLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('isLightBackground', () => {
  it('treats white and light grays as light', () => {
    expect(isLightBackground('#ffffff')).toBe(true);
    expect(isLightBackground('#cccccc')).toBe(true);
    expect(isLightBackground('ffffff')).toBe(true); // leading # is optional
  });

  it('treats the dark presets as dark', () => {
    expect(isLightBackground('#111118')).toBe(false);
    expect(isLightBackground('#1a1a2e')).toBe(false);
    expect(isLightBackground('#2d2d2d')).toBe(false);
  });

  it('defaults to dark (the safe choice) for malformed input', () => {
    expect(isLightBackground('')).toBe(false);
    expect(isLightBackground('nope')).toBe(false);
    expect(isLightBackground('#fff')).toBe(false); // 3-digit shorthand unsupported — falls dark
  });
});

describe('labelPaletteFor', () => {
  it('picks the pale palette on the dark presets', () => {
    for (const bg of ['#111118', '#1a1a2e', '#2d2d2d']) {
      expect(labelPaletteFor(bg)).toBe(DARK_BG_LABELS);
    }
  });

  it('picks the darkened palette on light backgrounds', () => {
    for (const bg of ['#ffffff', '#cccccc']) {
      expect(labelPaletteFor(bg)).toBe(LIGHT_BG_LABELS);
    }
  });
});

describe('label contrast against the target background', () => {
  // Small text needs the WCAG AA 4.5:1 ratio. Each palette is paired with
  // the background it was chosen for.
  it('light palette keeps every label ≥ 4.5:1 against white', () => {
    for (const hex of Object.values(LIGHT_BG_LABELS)) {
      expect(contrast(hex, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('dark palette keeps every label ≥ 4.5:1 against the default navy', () => {
    for (const hex of Object.values(DARK_BG_LABELS)) {
      expect(contrast(hex, '#1a1a2e')).toBeGreaterThanOrEqual(4.5);
    }
  });
});