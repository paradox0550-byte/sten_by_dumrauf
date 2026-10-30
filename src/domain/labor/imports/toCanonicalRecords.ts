import { parseLocalizedNumber } from './normalize';
import { ShiftLineSchema, SalesLineSchema, type ShiftLine, type SalesLine, type ImportIssue } from './schema';
import type { CanonicalRecord, SemanticImportPreview, SemanticField } from './semanticSchema';

export type CanonicalAdapterResult<T> = {
  records: T[];
  issues: ImportIssue[];
  skippedRows: number;
};

function text(value: unknown): string | null {
  if (value == null) return null;
  const result = String(value).trim();
  return result ? result : null;
}

function time(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/(?:^|\\s)([01]?\\d|2[0-3]):([0-5]\\d)(?:$|\\s)/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function date(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  }
  const raw = text(value);
  if (!raw) return null;
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return parsed.getUTCFullYear() === Number(y) && parsed.getUTCMonth() === Number(m) - 1 && parsed.getUTCDate() === Number(d)
    ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null;
}

function number(value: unknown): number | null {
  return parseLocalizedNumber(value);
}

function get(record: CanonicalRecord, field: SemanticField): unknown {
  return record.values[field];
}

function dateValue(record: CanonicalRecord): string | null {
  return date(get(record, 'businessDate'));
}

/** Converts confirmed semantic records into canonical shift facts. Totals and incomplete rows never enter calculations. */
export function toCanonicalShiftLines(
  records: CanonicalRecord[],
  options: { confirmedFields?: SemanticField[]; defaultPosition?: string } = {},
): CanonicalAdapterResult<ShiftLine> {
  const confirmed = new Set(options.confirmedFields ?? []);
  const result: ShiftLine[] = [], issues: ImportIssue[] = [];
  let skippedRows = 0;
  for (const record of records) {
    if (record.isTotalRow) { skippedRows++; continue; }
    const businessDate = dateValue(record);
    const employeeName = text(get(record, 'employeeName'));
    const positionName = text(get(record, 'positionName')) ?? options.defaultPosition ?? null;
    const rawHours = number(get(record, 'hours'));
    const startTime = time(get(record, 'startTime'));
    const endTime = time(get(record, 'endTime'));
    let hours = rawHours;
    if (hours == null && startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number), [eh, em] = endTime.split(':').map(Number);
      let duration = eh * 60 + em - (sh * 60 + sm);
      if (duration <= 0) duration += 1440;
      hours = duration / 60;
    }
    if (!businessDate || !employeeName || !positionName || hours == null) {
      issues.push({ row: record.sourceRow, reason: 'Для смены нужны подтверждённые дата, сотрудник, должность и часы либо интервал времени.' });
      skippedRows++;
      continue;
    }
    const candidate = {
      businessDate, employeeName, positionName, zoneId: text(get(record, 'departmentName')),
      hours, hourlyRate: number(get(record, 'hourlyRate')), startTime, endTime, sourceRow: record.sourceRow,
    };
    const parsed = ShiftLineSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({ row: record.sourceRow, reason: parsed.error.issues.map(issue => issue.message).join('; ') });
      skippedRows++;
      continue;
    }
    result.push(parsed.data);
  }
  return { records: result, issues, skippedRows };
}

/** Converts confirmed hourly sales rows. Zone and effort are never fabricated; without them forecast readiness remains limited. */
export function toCanonicalSalesLines(
  records: CanonicalRecord[],
  options: { zoneByDepartment?: Readonly<Record<string, string>>; effortUnitsByItem?: Readonly<Record<string, number>> } = {},
): CanonicalAdapterResult<SalesLine> {
  const result: SalesLine[] = [], issues: ImportIssue[] = [];
  let skippedRows = 0;
  for (const record of records) {
    if (record.isTotalRow) { skippedRows++; continue; }
    const businessDate = dateValue(record);
    const hourValue = number(get(record, 'hourOfDay'));
    const itemName = text(get(record, 'itemName'));
    const categoryName = text(get(record, 'categoryName'));
    const quantity = number(get(record, 'quantity'));
    const revenue = number(get(record, 'revenue'));
    const department = text(get(record, 'departmentName'));
    const zoneId = department ? options.zoneByDepartment?.[department] ?? null : null;
    const effortPerItem = itemName ? options.effortUnitsByItem?.[itemName] : undefined;
    if (!businessDate || hourValue == null || !Number.isInteger(hourValue) || !itemName || !categoryName || quantity == null || revenue == null) {
      issues.push({ row: record.sourceRow, reason: 'Для почасовой продажи нужны дата, час, блюдо/товар, категория, количество и выручка.' });
      skippedRows++;
      continue;
    }
    const parsed = SalesLineSchema.safeParse({
      businessDate, hour: hourValue, itemName, categoryName, zoneId, quantity, revenue,
      effortUnits: effortPerItem == null ? null : effortPerItem * quantity, sourceRow: record.sourceRow,
    });
    if (!parsed.success) {
      issues.push({ row: record.sourceRow, reason: parsed.error.issues.map(issue => issue.message).join('; ') });
      skippedRows++;
      continue;
    }
    result.push(parsed.data);
  }
  return { records: result, issues, skippedRows };
}
