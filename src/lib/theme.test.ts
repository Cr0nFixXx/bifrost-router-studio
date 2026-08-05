import { describe, it, expect } from 'vitest';
import { hslToRgb } from './theme';

describe('hslToRgb', () => {
  it('maps primary hues to expected RGB', () => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]);
    expect(hslToRgb(60, 100, 50)).toEqual([255, 255, 0]);
  });

  it('respects saturation/lightness scaling', () => {
    const grey = hslToRgb(0, 0, 50);
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    expect(grey.every((c) => c >= 0 && c <= 255)).toBe(true);
  });
});
