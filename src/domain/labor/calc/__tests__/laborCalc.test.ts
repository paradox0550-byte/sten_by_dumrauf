import { describe, expect, it } from 'vitest';
import { calculateLabor } from '../laborCalc';
import type { LaborConfiguration } from '../../roles/schema';
import type { SalesLine, ShiftLine } from '../../imports/schema';

const config: LaborConfiguration = {
  roles: [{ id: 'cook', positionName: 'Повар', workMode: 'flow', zoneIds: ['hot'], unitName: 'условная единица',
    minimumShiftHours: 12, fixedHoursPerDay: null, hourlyRate: 400, salaryPerShift: null, monthlySalary: null,
    productivityUnitsPerHour: 10, effortCoefficient: null, active: true }],
  zoneDemandNorms: [{ zoneId: 'hot', unitsPerLaborHour: 10 }],
  coverageMinHoursByRole: { Повар: 12 },
};
const sales: SalesLine[] = [{ businessDate: '2026-10-27', hour: 19, itemName: 'Паста', categoryName: 'Паста',
  zoneId: 'hot', quantity: 20, revenue: 10000, effortUnits: 20 }];
const shifts: ShiftLine[] = [{ businessDate: '2026-10-27', employeeName: 'Иванов', positionName: 'Повар',
  zoneId: 'hot', hours: 4, hourlyRate: null, startTime: '18:00', endTime: '22:00' }];

describe('calculateLabor', () => {
  it('calculates required hours and cost only from configured norms and rates', () => {
    const result = calculateLabor({ sales, shifts, config });
    expect(result.status).toBe('complete');
    expect(result.requiredHours).toBe(2);
    expect(result.excessHours).toBe(2);
    expect(result.actualLaborCost).toBe(1600);
    expect(result.excessLaborCost).toBe(800);
  });

  it('does not invent effort or productivity norms', () => {
    const result = calculateLabor({ sales: [{ ...sales[0], effortUnits: null }], shifts,
      config: { ...config, zoneDemandNorms: [{ zoneId: 'hot', unitsPerLaborHour: null }] } });
    expect(result.status).toBe('partial');
    expect(result.requiredHours).toBeNull();
    expect(result.excessHours).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('returns unavailable when sales or shifts are absent', () => {
    expect(calculateLabor({ sales: [], shifts, config }).status).toBe('unavailable');
    expect(calculateLabor({ sales, shifts: [], config }).status).toBe('unavailable');
  });
});
