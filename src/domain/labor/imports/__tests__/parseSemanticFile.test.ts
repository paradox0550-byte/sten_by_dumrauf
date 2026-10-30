import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSemanticFile } from '../parseSemanticFile';

describe('parseSemanticFile', () => {
 it('reads a workbook and infers fields from the data table, not the sheet name',()=>{
  const workbook=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([
   ['Организация','Ресторан X'],['Период','октябрь'],
   ['Учетный день','Час закрытия','Блюдо','Количество','Сумма со скидкой'],
   ['01.10.2026','12','Рамен',2,1000],
  ]);
  XLSX.utils.book_append_sheet(workbook,sheet,'Лист1');
  const buffer=XLSX.write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
  const parsed=parseSemanticFile(buffer);
  expect(parsed.sheets).toHaveLength(1);
  expect(parsed.sheets[0].preview.family).toBe('sales_hourly');
  expect(parsed.sheets[0].records[0].values.itemName).toBe('Рамен');
  expect(parsed.sheets[0].records[0].values.revenue).toBe(1000);
 });
});
