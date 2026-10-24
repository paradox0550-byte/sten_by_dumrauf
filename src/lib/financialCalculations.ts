/**
 * Shared calculations for STEN's signed P&L convention:
 * revenue is positive and expenses are already negative.
 */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** EBITDA is the signed sum of revenue and expense rows. */
export function calculateEBITDA(revenue: number, expenses: number[]): number {
  return [revenue, ...expenses].reduce((total, value) => total + value, 0);
}

/**
 * Classifies expense variance using delta = fact - plan.
 * A more-negative fact is an overrun; a less-negative fact is a saving.
 */
export function calculateVarianceSignal(
  plan: number,
  fact: number,
): 'overrun' | 'saving' | 'neutral' {
  if (!finite(plan) || !finite(fact)) return 'neutral';
  const delta = fact - plan;
  if (delta < 0) return 'overrun';
  if (delta > 0) return 'saving';
  return 'neutral';
}

/**
 * Returns a non-negative KPI percentage, or null when inputs are missing,
 * non-finite, or revenue/denominator is not positive.
 * Absolute numerator supports STEN's signed-negative expense convention.
 */
export function calculateKPISafely(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (!finite(numerator) || !finite(denominator) || denominator <= 0) return null;
  const result = Math.abs(numerator) / denominator * 100;
  return Number.isFinite(result) ? result : null;
}
