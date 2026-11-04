import { describe, expect, it } from 'vitest';
import { calculateEBITDA, calculateKPISafely, calculatePnlVarianceSignal, calculateVarianceSignal } from './financialCalculations';

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


describe('calculatePnlVarianceSignal', () => {
  it('marks a revenue shortfall as unfavorable', () => {
    expect(calculatePnlVarianceSignal(1_000_000, 800_000, 'revenue')).toBe('overrun');
  });

  it('marks positive expense growth as unfavorable', () => {
    expect(calculatePnlVarianceSignal(300_000, 350_000, 'expense')).toBe('overrun');
  });

  it('marks a more-negative signed expense as unfavorable', () => {
    expect(calculatePnlVarianceSignal(-300_000, -350_000, 'expense')).toBe('overrun');
  });

  it('recognizes savings in both positive and signed expense formats', () => {
    expect(calculatePnlVarianceSignal(300_000, 250_000, 'expense')).toBe('saving');
    expect(calculatePnlVarianceSignal(-300_000, -250_000, 'expense')).toBe('saving');
  });

  it('does not guess for mixed-sign or unknown rows', () => {
    expect(calculatePnlVarianceSignal(300_000, -250_000, 'expense')).toBe('insufficient_data');
    expect(calculatePnlVarianceSignal(100, 80, 'unknown')).toBe('insufficient_data');
  });

  it('preserves missing values and neutral rows', () => {
    expect(calculatePnlVarianceSignal(null, 80, 'revenue')).toBe('insufficient_data');
    expect(calculatePnlVarianceSignal(80, 80, 'revenue')).toBe('neutral');
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
