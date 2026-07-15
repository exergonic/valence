import type { Molecule } from './types';

export function parseMolBlock(molBlock: string): Molecule {
  return { atoms: [], bonds: [] };
}
