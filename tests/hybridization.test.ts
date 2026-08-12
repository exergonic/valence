import { describe, it, expect } from 'vitest';
import { assignHybridization } from '../src/chem/hybridize';

// Topology-first hybridization: the inputs are σ-bond count and π-bond
// count, never measured angles. See hybridize.ts for why.
describe('assignHybridization (topology-first)', () => {
  it('should return sp3 for tetrahedral carbon (4 σ bonds)', () => {
    const result = assignHybridization('C', 4);
    expect(result.hybridization).toBe('sp3');
    expect(result.geometry).toBe('tetrahedral');
  });

  it('should return sp3 for cyclopropane carbon (4 σ bonds, strained angle)', () => {
    // CH₂ in a 3-ring: 2 ring σ + 2 C–H σ = 4 domains. The 60° ring angle
    // is strain, not a domain change — topology ignores it.
    const result = assignHybridization('C', 4);
    expect(result.hybridization).toBe('sp3');
  });

  it('should return sp3d for phosphorus pentachloride (5 σ bonds)', () => {
    // PCl₅: P valence 5, 5 σ, 0 π → 0 lone pairs → 5 domains → sp³d.
    const result = assignHybridization('P', 5);
    expect(result.hybridization).toBe('sp3d');
    expect(result.geometry).toBe('trigonal_bipyramidal');
  });

  it('should return sp3d2 for sulfur hexafluoride (6 σ bonds)', () => {
    // SF₆: S valence 6, 6 σ → 0 lone pairs → 6 domains → sp³d².
    const result = assignHybridization('S', 6);
    expect(result.hybridization).toBe('sp3d2');
    expect(result.geometry).toBe('octahedral');
  });

  it('should return sp2 for trigonal carbon (3 σ bonds)', () => {
    const result = assignHybridization('C', 3);
    expect(result.hybridization).toBe('sp2');
    expect(result.geometry).toBe('trigonal_planar');
  });

  it('should return sp for linear carbon (2 σ + 2 π, e.g. CO₂)', () => {
    const result = assignHybridization('C', 2, 2);
    expect(result.hybridization).toBe('sp');
    expect(result.geometry).toBe('linear');
  });

  it('should return sp3 for amine nitrogen (3 σ bonds)', () => {
    const result = assignHybridization('N', 3);
    expect(result.hybridization).toBe('sp3');
  });

  it('should return sp2 for pyridine-like nitrogen (2 σ + 1 π)', () => {
    const result = assignHybridization('N', 2, 1);
    expect(result.hybridization).toBe('sp2');
  });

  it('should return sp for nitrile nitrogen (1 σ + 2 π)', () => {
    const result = assignHybridization('N', 1, 2);
    expect(result.hybridization).toBe('sp');
  });

  it('should return sp2 for nitro nitrogen (3 σ + 1 π) — the floor() pin', () => {
    // 5 − 3 σ − 1 π = 1 electron → 0.5 per lone pair. floor() keeps 0
    // lone pairs and sp²; round() would inflate the steric number to sp³.
    const result = assignHybridization('N', 3, 1);
    expect(result.hybridization).toBe('sp2');
  });

  it('should return sp3 for two-coordinate oxygen — any angle', () => {
    // Regression (2026-08-06): the angle-based version cut at 110°, and
    // the MMFF94 C–O–C equilibrium of dimethyl ether is 111.7°, so every
    // refined ether O classified sp² and rendered a pure p orbital
    // instead of two equivalent sp³ lone pairs. Topology: 2 σ bonds →
    // 2 lone pairs → 4 domains → sp³, whatever the refined geometry
    // (water 104.5°, alcohols ~108°, ethers ~112°).
    const result = assignHybridization('O', 2);
    expect(result.hybridization).toBe('sp3');
  });

  it('should return sp2 for carbonyl oxygen (1 σ + 1 π)', () => {
    const result = assignHybridization('O', 1, 1);
    expect(result.hybridization).toBe('sp2');
  });

  it('should return sp2 for carboxylate oxygen (1 σ) — the floor() pin', () => {
    // 6 − 1 = 5 electrons → 2.5 per lone pair. floor() keeps 2 lone
    // pairs and the sp² resonance structure; round() would give 3 and
    // sp³. Formal charge would make this exact (6 − 1 − charge).
    const result = assignHybridization('O', 1);
    expect(result.hybridization).toBe('sp2');
  });

  it('should return sp3 for a halide (1 σ bond)', () => {
    const result = assignHybridization('F', 1);
    expect(result.hybridization).toBe('sp3');
  });
});
