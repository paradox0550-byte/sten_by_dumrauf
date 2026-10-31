import { describe, expect, it } from 'vitest';
import { toCanonicalSalesLines, toCanonicalShiftLines } from '../toCanonicalRecords';
import type { CanonicalRecord } from '../semanticSchema';

const row=(values:CanonicalRecord['values'],sourceRow:number,isTotalRow=false):CanonicalRecord=>({values,extra:{},sourceRow,isTotalRow});

describe('semantic records to canonical labor facts',()=>{
 it('converts shift rows and leaves missing hours unavailable',()=>{
  const result=toCanonicalShiftLines([
   row({businessDate:'2026-10-01',employeeName:'Иванов',positionName:'Повар',startTime:'20:00',endTime:'04:00'},2),
   row({businessDate:'2026-10-01',employeeName:'Петров',positionName:'Официант'},3),
   row({businessDate:'2026-10-01',employeeName:'Итого',positionName:'Повар',hours:8},4,true),
  ]);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({hours:8,startTime:'20:00',endTime:'04:00',sourceRow:2});
  expect(result.skippedRows).toBe(2);
  expect(result.issues[0].row).toBe(3);
 });
 it('does not fabricate sales zone or effort when mapping is absent',()=>{
  const result=toCanonicalSalesLines([
   row({businessDate:'2026-10-01',hourOfDay:12,itemName:'Паста',categoryName:'Основные блюда',quantity:2,revenue:1800},8),
   row({businessDate:'2026-10-01',hourOfDay:12,itemName:'Итого',categoryName:'Основные блюда',quantity:2,revenue:1800},9,true),
  ]);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({zoneId:null,effortUnits:null,quantity:2,revenue:1800});
  expect(result.skippedRows).toBe(1);
 });
});
