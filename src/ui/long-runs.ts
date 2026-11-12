/**
 * When a calculation the user asked for waits for their go-ahead: the Thermo
 * view's Hessian and the Hartree–Fock single point both estimate their time
 * on this machine first, run unasked at this or less, and otherwise offer a
 * button with the estimate on it.
 */

/** Seconds: half the optimiser's budget, and as long as a lesson can wait
 *  unasked. */
export const ASK_ABOVE_SECONDS = 15;
