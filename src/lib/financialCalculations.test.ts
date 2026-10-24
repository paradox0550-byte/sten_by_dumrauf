import { describe, expect, it } from 'vitest';
import { calculateEBITDA, calculateKPISafely, calculateVarianceSignal } from './financialCalculations';

describe('calculateEBITDA', () => {
  it('adds negative expense values to revenue', () => {
    expect(calculateEBITDA(1_000_000, [-300_000, -200_000, -100_000])).toBe(400_000);
  });

  it('supports an empty expense list', () => {
    expect(calculateEBITDA(1_000, [])).toBe(1_000);
  });
});

describe('calculateVarianceSignal', () => {
  it('marks a more-negative expense fact as overrun', () => {
    expect(calculateVarianceSignal(-100_000, -120_000)).toBe('overrun');
  });

  it('marks a less-negative expense fact as saving', () => {
    expect(calculateVarianceSignal(-100_000, -80_000)).toBe('saving');
  });

  it('marks equal plan and fact as neutral', () => {
    expect(calculateVarianceSignal(-100_000, -100_000)).toBe('neutral');
  });
});

describe('calculateKPISafely', () => {
  it('uses the absolute value of signed expenses', () => {
    expect(calculateKPISafely(-25, 100)).toBe(25);
  });

  it('returns null for missing, invalid, or non-positive denominator data', () => {
    expect(calculateKPISafely(null, 100)).toBeNull();
    expect(calculateKPISafely(Number.NaN, 100)).toBeNull();
    expect(calculateKPISafely(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(calculateKPISafely(10, 0)).toBeNull();
    expect(calculateKPISafely(10, -100)).toBeNull();
  });
});
