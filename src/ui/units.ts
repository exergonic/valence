/**
 * The units the panel reads in.
 *
 * The solver works in electron volts — that is what the Alvarez and ICON8
 * parameters are published in, and what YAeHMOP prints — but orbital energies
 * are read beside bond energies and conformational gaps, and a chemist's unit
 * for those is kcal/mol. So the calculation keeps eV and the panel converts,
 * once, here.
 *
 * 1 eV = 23.060549 kcal/mol (CODATA, 1 eV = 96.485332 kJ/mol ÷ 4.184).
 */
export const KCAL_PER_EV = 23.060549;

/** An orbital energy in kcal/mol, to the tenth — finer than the three decimals
 *  the panel used to show in eV, and past the model's own precision either way. */
export function formatEnergy(eV: number): string {
  return (eV * KCAL_PER_EV).toFixed(1);
}

/** The unit those numbers are in, for the places that have to say it. */
export const ENERGY_UNIT = 'kcal/mol';
