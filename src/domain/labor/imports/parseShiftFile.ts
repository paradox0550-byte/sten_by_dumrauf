import * as XLSX from 'xlsx';
import { ShiftLineSchema, type NormalizationReport, type ShiftLine } from './schema';
import { normalizeHeader, parseLocalizedNumber } from './normalize';

const ALIASES = {
  date: ['дата', 'день', 'рабочая дата', 'дата смены', 'date'],
  employee: ['сотрудник', 'фио', 'работник', 'имя сотрудника', 'employee'],
  position: ['должность', 'позиция', 'роль', 'position'],
  hours: ['часы', 'отработано часов', 'количество часов', 'часов за смену', 'hours'],
  rate: ['ставка', 'ставка в час', 'руб/час', 'оплата за час', 'hourly rate'],
  zone: ['зона', 'цех', 'участок', 'подразделение', 'zone'],
  start: ['начало', 'начало смены', 'время начала', 'start'],
  end: ['окончание', 'конец смены', 'время окончания', 'end'],
} as const;

function column(headers: unknown[], key: keyof typeof ALIASES): number {
  const accepted = ALIASES[key].map(normalizeHeader);
  return headers.findIndex(value => accepted.includes(normalizeHeader(value)));
}

function parseDate(value: unknown): string | null {
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts?.y && parts.m && parts.d) return isoDate(parts.y, parts.m, parts.d);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  return match ? isoDate(Number(match[3]), Number(match[2]), Number(match[1])) : null;
}
function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-') : null;
}
function parseTime(value: unknown): string | null {
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = String(value ?? '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

export type ShiftParseResult = { data: ShiftLine[]; report: NormalizationReport; sheetName: string };

export async function parseShiftFile(buffer: ArrayBuffer, options: { sheetName?: string } = {}): Promise<ShiftParseResult> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error('В файле не найден лист с графиком или табелем.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
  if (!rows.length) throw new Error('Файл пустой.');
  const headers = rows[0];
  const columns = {
    date: column(headers, 'date'), employee: column(headers, 'employee'), position: column(headers, 'position'),
    hours: column(headers, 'hours'), rate: column(headers, 'rate'), zone: column(headers, 'zone'),
    start: column(headers, 'start'), end: column(headers, 'end'),
  };
  const required: Array<keyof typeof columns> = ['date', 'employee', 'position', 'hours'];
  const missing = required.filter(key => columns[key] < 0);
  if (missing.length) throw new Error('Не найдены обязательные поля: ' + missing.map(key => ALIASES[key][0]).join(', '));

  const data: ShiftLine[] = [];
  const issues: NormalizationReport['issues'] = [];
  let skippedRows = 0;
  let totalRows = 0;
  rows.slice(1).forEach((row, index) => {
    if (!row.some(value => value != null && String(value).trim() !== '')) { skippedRows++; return; }
    totalRows++;
    const businessDate = parseDate(row[columns.date]);
    const employeeName = String(row[columns.employee] ?? '').trim();
    const positionName = String(row[columns.position] ?? '').trim();
    const hours = parseLocalizedNumber(row[columns.hours]);
    const hourlyRate = columns.rate < 0 || row[columns.rate] == null ? null : parseLocalizedNumber(row[columns.rate]);
    const rawStart = columns.start < 0 ? null : row[columns.start];
    const rawEnd = columns.end < 0 ? null : row[columns.end];
    const startTime = rawStart == null || String(rawStart).trim() === '' ? null : parseTime(rawStart);
    const endTime = rawEnd == null || String(rawEnd).trim() === '' ? null : parseTime(rawEnd);
    const candidate = {
      businessDate: businessDate ?? '',
      employeeName, positionName,
      zoneId: columns.zone < 0 ? null : String(row[columns.zone] ?? '').trim() || null,
      hours: hours ?? -1, hourlyRate,
      startTime, endTime, sourceRow: index + 2,
    };
    const parsed = ShiftLineSchema.safeParse(candidate);
    if ((rawStart != null && String(rawStart).trim() !== '' && startTime == null) ||
        (rawEnd != null && String(rawEnd).trim() !== '' && endTime == null)) {
      issues.push({ row: index + 2, reason: 'Некорректное время начала или окончания смены' });
      return;
    }
    if (!parsed.success) {
      issues.push({ row: index + 2, reason: [
        ...(!businessDate ? ['Некорректная дата'] : []),
        ...parsed.error.issues.map(issue => issue.message),
      ].join('; ') });
      return;
    }
    data.push(parsed.data);
  });
  return {
    data, sheetName,
    report: { totalRows, acceptedRows: data.length, rejectedRows: totalRows - data.length, skippedRows, issues: issues.slice(0, 100) },
  };
}
