import { describe, expect, it } from 'vitest';
import { parseScheduleMatrix } from '../parseScheduleMatrix';

describe('matrix schedule adapter',()=>{
 it('expands date columns into employee/date records regardless of date column order',()=>{
  const result=parseScheduleMatrix([
   ['Сотрудник','Должность','01.10.2026','02.10.2026'],
   ['Иванов Иван','Повар',8,'В'],
   ['Петрова Анна','Официант','12:00–20:00',10],
  ]);
  expect(result).not.toBeNull();
  expect(result?.rows).toHaveLength(3);
  expect(result?.rows[0]).toMatchObject({businessDate:'2026-10-01',employeeName:'Иванов Иван',positionName:'Повар',rawValue:8});
  expect(result?.rows[1]).toMatchObject({businessDate:'2026-10-02',employeeName:'Петрова Анна',rawValue:10});
 });
 it('returns null when a table is not a matrix-style schedule',()=>{
  expect(parseScheduleMatrix([['Дата','Выручка'],['01.10.2026',1000]])).toBeNull();
 });
});
