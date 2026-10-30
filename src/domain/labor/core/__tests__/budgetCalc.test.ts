import { describe, expect, it } from 'vitest';
import { calculateLaborBudget } from '../budgetCalc';
import type { LaborPlanRow } from '../schema';

const makeRow = (overrides: Partial<LaborPlanRow> = {}): LaborPlanRow => ({
  recordType: 'shift', id: 'plan-1', businessDate: '2026-10-02', employeeId: 'e1', employeeName: 'Иван Иванов',
  positionName: 'Повар', departmentId: 'kitchen', departmentName: 'Кухня',
  startTime: '20:00', endTime: '04:00', hours: null,
  pay: { model: 'hourly', hourlyRate: 500, shiftRate: null, monthlySalary: null, approvedAllowances: null, currency: 'RUB' },
  status: 'planned', source: 'test', sourceRow: null, ...overrides,
});

describe('calculateLaborBudget', () => {
  it('calculates overnight hours and cost without sales', () => {
    const result = calculateLaborBudget({ rows: [makeRow(), makeRow({ id: 'fact-1', status: 'actual' })], periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(result.plannedHours.value).toBe(8); expect(result.actualHours.value).toBe(8);
    expect(result.plannedCost.value).toBe(4000); expect(result.costVariance.value).toBe(0);
  });
  it('does not allocate monthly salary to shifts without an explicit rule', () => {
    const result = calculateLaborBudget({ rows: [makeRow({ pay: { model: 'monthly_salary', hourlyRate: null, shiftRate: null, monthlySalary: 90000, approvedAllowances: null, currency: 'RUB' } })], periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(result.plannedCost.value).toBeNull(); expect(result.plannedCost.status).toBe('unavailable');
  });
  it('keeps absent hours and rate unknown rather than zero', () => {
    const result = calculateLaborBudget({ rows: [makeRow({ startTime: null, endTime: null, pay: { model: 'hourly', hourlyRate: null, shiftRate: null, monthlySalary: null, approvedAllowances: null, currency: 'RUB' } })], periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(result.plannedHours.value).toBeNull(); expect(result.plannedCost.value).toBeNull();
  });
  it('counts an explicit monthly salary row once without inventing shift hours', () => {
    const result = calculateLaborBudget({ rows: [makeRow({ recordType: 'period_salary', startTime: null, endTime: null, hours: null, pay: { model: 'monthly_salary', hourlyRate: null, shiftRate: null, monthlySalary: 90000, approvedAllowances: 5000, currency: 'RUB' } })], periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(result.plannedCost.value).toBe(95000);
    expect(result.plannedHours.value).toBeNull();
  });
  it('excludes rows outside the requested period', () => {
    const result = calculateLaborBudget({ rows: [makeRow({ businessDate: '2026-09-30' })], periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(result.includedRows).toBe(0); expect(result.excludedRows).toBe(1);
  });
});
