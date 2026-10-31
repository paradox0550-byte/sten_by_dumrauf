import { describe, expect, it } from 'vitest';
import { createImportBatch, parseLocalizedNumber } from '../normalize';

describe('labor import normalization', () => {
  it('uses content digest rather than file name as import identity', () => {
    const input = { source: 'iiko' as const, fileName: 'sales.xlsx', importedAt: new Date('2026-10-30T10:00:00Z'),
      rowCount: 10, acceptedRows: 9, rejectedRows: 1, dates: ['2026-10-27'], contentFingerprint: 'sha256:abc' };
    expect(createImportBatch(input).id).toBe('iiko:sha256:abc');
    expect(createImportBatch({ ...input, fileName: 'renamed.xlsx' }).id).toBe('iiko:sha256:abc');
  });

  it('parses Russian and European money formats', () => {
    expect(parseLocalizedNumber('1 200,50')).toBe(1200.5);
    expect(parseLocalizedNumber('1.234,50')).toBe(1234.5);
    expect(parseLocalizedNumber('1,234.50')).toBe(1234.5);
    expect(parseLocalizedNumber('—')).toBeNull();
  });

  it('refuses to invent a file digest', () => {
    expect(() => createImportBatch({ source: 'csv', fileName: 'report.csv', rowCount: 0, acceptedRows: 0,
      rejectedRows: 0, dates: [], contentFingerprint: '' })).toThrow('отпечаток содержимого');
  });
});
