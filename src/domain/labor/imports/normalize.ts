import { ImportBatchSchema, type ImportBatch, type ImportSource } from './schema';

export function createImportBatch(input: {
  source: ImportSource;
  fileName: string;
  importedAt?: Date;
  rowCount: number;
  acceptedRows: number;
  rejectedRows: number;
  dates: string[];
  contentFingerprint: string;
}): ImportBatch {
  const sortedDates = [...input.dates].sort();
  // The caller must pass a digest of the original file bytes. File name and row counts
  // are not sufficient to identify content safely or prevent accidental collisions.
  const fingerprint = input.contentFingerprint.trim();
  if (!fingerprint) throw new Error('Для идентификации импорта нужен отпечаток содержимого файла.');
  return ImportBatchSchema.parse({
    id: `${input.source}:${fingerprint}`,
    source: input.source,
    fileName: input.fileName,
    importedAt: (input.importedAt ?? new Date()).toISOString(),
    periodStart: sortedDates[0] ?? null,
    periodEnd: sortedDates.at(-1) ?? null,
    rowCount: input.rowCount,
    acceptedRows: input.acceptedRows,
    rejectedRows: input.rejectedRows,
    fingerprint,
  });
}


export function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/^\uFEFF/, '').normalize('NFKC')
    .replace(/[\s\u00a0]+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

export function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/[\s\u00a0₽]/g, '').replace(/руб\.?/gi, '');
  if (!text) return null;
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  else if (text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  else if (text.includes(',') && text.includes('.')) text = text.replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
