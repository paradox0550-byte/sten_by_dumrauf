import * as XLSX from 'xlsx';
import { mapSemanticRows, recognizeSemanticReport, type CanonicalRecord, type SemanticImportPreview } from './semanticSchema';

export type SemanticSheetPreview = {
  sheetName: string;
  preview: SemanticImportPreview;
  records: CanonicalRecord[];
  sourceRows: number;
};
export type SemanticFilePreview = {
  sheets: SemanticSheetPreview[];
  sourceFormat: 'tabular_file';
  warnings: string[];
};

/**
 * File-format adapter only. Semantic meaning comes from column content, never
 * from file name, extension, worksheet name or a fixed column position.
 */
export function parseSemanticFile(buffer: ArrayBuffer): SemanticFilePreview {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true, codepage: 65001 });
  if (!workbook.SheetNames.length) throw new Error('В файле не найдено таблиц с данными.');
  const sheets: SemanticSheetPreview[] = [];
  const warnings: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
    if (!matrix.length) continue;
    const preview = recognizeSemanticReport(matrix);
    const records = mapSemanticRows(matrix, preview);
    sheets.push({ sheetName, preview, records, sourceRows: matrix.length });
    if (preview.needsConfirmation) warnings.push(`Лист «${sheetName}»: требуется проверить сопоставление полей.`);
  }
  if (!sheets.length) throw new Error('Не удалось извлечь строки из файла.');
  return {
    sheets,
    sourceFormat: 'tabular_file',
    warnings,
  };
}
