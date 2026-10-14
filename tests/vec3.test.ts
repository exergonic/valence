import { describe, expect, it } from 'vitest';
import { dihedralAngle, type Vec3 } from '../src/utils/vec3';

const degrees = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => (dihedralAngle(a, b, c, d) * 180) / Math.PI;

describe('dihedralAngle', () => {
  // Looking down b→c (+z), a sits at +x and d at +y: turning a onto d is a
  // quarter turn clockwise, which IUPAC counts positive. The measuring tool
  // once reported this −90°.
  it('is positive for a clockwise turn, the IUPAC sign', () => {
    expect(degrees([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1])).toBeCloseTo(90, 9);
    expect(degrees([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, -1, 1])).toBeCloseTo(-90, 9);
  });

  it('reads anti as 180° and syn as 0°', () => {
    expect(Math.abs(degrees([1, 0, 0], [0, 0, 0], [0, 0, 1.5], [-1, 0, 1.5]))).toBeCloseTo(180, 9);
    expect(degrees([1, 0, 0], [0, 0, 0], [0, 0, 1.5], [1, 0, 1.5])).toBeCloseTo(0, 9);
  });
});
