import { describe, expect, it } from 'vitest';
import { buildDemandScheduleDraft } from '../buildDemandScheduleDraft';
import type { CanonicalRecord } from '../../imports/semanticSchema';

const sales=(date:string,sourceRow:number,isTotalRow=false):CanonicalRecord=>({
 values:{businessDate:date,hourOfDay:12,itemName:'Паста',categoryName:'Основные блюда',departmentName:'Зал',quantity:10,revenue:9000},
 extra:{},sourceRow,isTotalRow,
});

describe('sales to demand forecast to staffing draft',()=>{
 it('uses imported sales history, excludes totals and produces a staffing demand draft',()=>{
  const result=buildDemandScheduleDraft({
   records:[sales('2026-09-28',2),sales('2026-10-05',3),sales('2026-10-12',4),sales('2026-10-19',5),sales('2026-10-26',6),sales('2026-10-26',7,true)],
   zoneByDepartment:{Зал:'hall'},effortUnitsByItem:{Паста:2},
   productivityUnitsPerHourByZone:{hall:4},asOf:'2026-10-26',minimumWeeks:4,historyWeeks:8,
  });
  expect(result.salesLines).toHaveLength(5);
  expect(result.skippedRows).toBe(1);
  expect(result.forecast.status).toBe('ready');
  expect(result.staffing[0]).toMatchObject({zoneId:'hall',workloadUnits:20,requiredLaborHours:5,requiredPeople:5,status:'calculated'});
 });
 it('does not invent a staffing norm when zone productivity is missing',()=>{
  const result=buildDemandScheduleDraft({
   records:[sales('2026-09-28',2),sales('2026-10-05',3),sales('2026-10-12',4),sales('2026-10-19',5)],
   zoneByDepartment:{Зал:'hall'},effortUnitsByItem:{Паста:2},productivityUnitsPerHourByZone:{hall:null},
   asOf:'2026-10-19',minimumWeeks:4,historyWeeks:8,
  });
  expect(result.forecast.status).toBe('ready');
  expect(result.staffing[0]).toMatchObject({requiredLaborHours:null,requiredPeople:null,status:'missing_productivity_norm'});
 });
});
