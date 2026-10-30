import { ImportBatchSchema, type ImportBatch, type ImportSource } from './schema';

export function createImportBatch(input: {
  source: ImportSource;
  fileName: string;
  importedAt?: Date;
  rowCount: number;
  acceptedRows: number;
  rejectedRows: number;
  dates: string[];
}): ImportBatch {
  const sortedDates = [...input.dates].sort();
  const canonical = [input.source, input.fileName, ...sortedDates, input.rowCount, input.acceptedRows, input.rejectedRows].join('|');
  // Stable content-independent identity is deliberately not used for deduplication.
  // Adapters should provide a content digest when persistent ingestion is introduced.
  const fingerprint = hashText(canonical);
  return ImportBatchSchema.parse({
    id: fingerprint,
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

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
