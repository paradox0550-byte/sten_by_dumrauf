import { describe, expect, it } from 'vitest';
import { parseScheduleMatrix } from '../parseScheduleMatrix';

describe('matrix schedule adapter',()=>{
 it('expands date columns and parses numeric hours and time ranges',()=>{
  const result=parseScheduleMatrix([
   ['Сотрудник','Должность','01.10.2026','02.10.2026'],
   ['Иванов Иван','Повар',8,'В'],
   ['Петрова Анна','Официант','12:00–20:00',10],
  ]);
  expect(result).not.toBeNull();
  expect(result?.rows).toHaveLength(3);
  expect(result?.rows[0]).toMatchObject({businessDate:'2026-10-01',employeeName:'Иванов Иван',positionName:'Повар',rawValue:8,hours:8});
  expect(result?.rows[1]).toMatchObject({businessDate:'2026-10-01',employeeName:'Петрова Анна',hours:8,startTime:'12:00',endTime:'20:00'});
  expect(result?.rows[2]).toMatchObject({businessDate:'2026-10-02',employeeName:'Петрова Анна',hours:10});
 });
 it('handles overnight shifts and preserves ambiguous values without turning them into zero',()=>{
  const result=parseScheduleMatrix([
   ['ФИО','Должность','03.10.2026','04.10.2026'],
   ['Иванов','Повар','20:00–04:00','по согласованию'],
  ]);
  expect(result?.rows[0]).toMatchObject({hours:8,startTime:'20:00',endTime:'04:00'});
  expect(result?.rows[1]).toMatchObject({hours:null,rawValue:'по согласованию'});
  expect(result?.warnings).toHaveLength(1);
 });
 it('returns null when a table is not a matrix-style schedule',()=>{
  expect(parseScheduleMatrix([['Дата','Выручка'],['01.10.2026',1000]])).toBeNull();
 });
});
