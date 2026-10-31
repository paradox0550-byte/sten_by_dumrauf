import { describe, expect, it } from 'vitest';
import { mapSemanticRows, recognizeSemanticReport } from '../semanticSchema';

describe('vendor-neutral semantic import', () => {
 it('finds a reordered labor header after metadata rows and preserves unknown columns',()=>{
  const matrix=[['Экспорт создан','система'],['Должность','Отработано часов','ФИО сотрудника','Дата смены','Неизвестный показатель'],['Повар',8,'Иванов Иван','01.10.2026',123]];
  const preview=recognizeSemanticReport(matrix);
  expect(preview.headerRowIndex).toBe(1);expect(preview.family).toBe('labor_schedule');
  expect(preview.preservedUnknownColumns).toContain('Неизвестный показатель');
  const rows=mapSemanticRows(matrix,preview);
  expect(rows[0].values.positionName).toBe('Повар');expect(rows[0].values.hours).toBe(8);
  expect(rows[0].extra['Неизвестный показатель']).toBe(123);
 });
 it('recognizes real-world iiko terms including accounting day and closing hour',()=>{
  const preview=recognizeSemanticReport([['Учетный день','Час закрытия','Блюдо','Количество','Сумма со скидкой'],['01.10.2026','13','Рамен',3,1500]]);
  expect(preview.columns.find(c=>c.sourceLabel==='Учетный день')?.field).toBe('businessDate');
  expect(preview.columns.find(c=>c.sourceLabel==='Час закрытия')?.field).toBe('hourOfDay');
  expect(preview.columns.find(c=>c.sourceLabel==='Блюдо')?.field).toBe('itemName');
  expect(preview.columns.find(c=>c.sourceLabel==='Количество')?.field).toBe('quantity');
  expect(preview.columns.find(c=>c.sourceLabel==='Сумма со скидкой')?.field).toBe('revenue');
  expect(preview.family).toBe('sales_hourly');
 });
 it('asks for confirmation on ambiguous labels instead of guessing',()=>{
  const preview=recognizeSemanticReport([['Дата','Сумма','Количество','Группа'],['01.10.2026',1000,2,'Бар']]);
  expect(preview.columns.find(c=>c.sourceLabel==='Сумма')?.field).toBe('unknown');
  expect(preview.needsConfirmation).toBe(true);
 });
 it('forward-fills grouped dates and marks total rows',()=>{
  const matrix=[['Учетный день','Час закрытия','Сумма со скидкой'],['01.10.2026','12',1000],['','13',1500],['Итого за день','',2500]];
  const preview=recognizeSemanticReport(matrix),rows=mapSemanticRows(matrix,preview);
  expect(rows[1].values.businessDate).toBe('01.10.2026');expect(rows[2].isTotalRow).toBe(true);
 });
});
