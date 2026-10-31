import { describe, expect, it } from 'vitest';
import { buildLaborPlanRows } from '../rolePlanAdapter';
import { calculateLaborBudget } from '../budgetCalc';
import type { RolePassport } from '../../roles/schema';
import type { ShiftLine } from '../../imports/schema';

const role=(overrides:Partial<RolePassport>={}):RolePassport=>({
 id:'cook',positionName:'Повар',workMode:'flow',zoneIds:['kitchen'],unitName:'блюд',
 minimumShiftHours:null,fixedHoursPerDay:null,hourlyRate:300,salaryPerShift:null,monthlySalary:null,
 productivityUnitsPerHour:10,effortCoefficient:1,active:true,...overrides,
});
const shift=(overrides:Partial<ShiftLine>={}):ShiftLine=>({
 businessDate:'2026-10-01',employeeName:'Иванов',positionName:'Повар',zoneId:'kitchen',hours:8,
 hourlyRate:null,startTime:'09:00',endTime:'17:00',...overrides,
});

describe('role passport to labor budget integration',()=>{
 it('uses role hourly rate and calculates budget without sales data',()=>{
  const adapted=buildLaborPlanRows({shifts:[shift()],rolePassports:[role()],status:'actual',source:'schedule.xlsx',periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  expect(adapted.unmatchedPositions).toEqual([]);
  const summary=calculateLaborBudget({rows:adapted.rows,periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  expect(summary.actualHours.value).toBe(8);
  expect(summary.actualCost.value).toBe(2400);
  expect(summary.actualCost.status).toBe('complete');
 });
 it('counts monthly salary once for the period, not once per shift',()=>{
  const monthly=role({hourlyRate:null,monthlySalary:60000});
  const adapted=buildLaborPlanRows({shifts:[shift(),shift({businessDate:'2026-10-02'})],rolePassports:[monthly],status:'actual',source:'schedule.xlsx',periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  expect(adapted.rows.filter(row=>row.recordType==='period_salary')).toHaveLength(1);
  const summary=calculateLaborBudget({rows:adapted.rows,periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  expect(summary.actualHours.value).toBe(16);
  expect(summary.actualCost.value).toBe(60000);
 });
 it('keeps missing monthly salary unavailable rather than reporting zero',()=>{
  const adapted=buildLaborPlanRows({shifts:[shift()],rolePassports:[role({hourlyRate:null,monthlySalary:null})],status:'actual',source:'schedule.xlsx',periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  const summary=calculateLaborBudget({rows:adapted.rows,periodStart:'2026-10-01',periodEnd:'2026-10-31'});
  expect(summary.actualCost.value).toBeNull();
  expect(summary.actualCost.status).toBe('unavailable');
 });
});
