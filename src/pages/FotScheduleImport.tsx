import { useRef, useState } from 'react';
import { calculateEmployeeMonth, calculateTotalFOT, inferFotPayType, type FotPayType, type FotEmployeeCalculation } from '../lib/fotCalculator';
import { AlertCircle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';
import './FotScheduleImport.css';

type ShiftCell =
  | { kind: 'hours'; hours: number; raw: string }
  | { kind: 'shift'; isShift: true; defaultHours: 12; raw: string }
  | { kind: 'dayOff'; isDayOff: true; raw: string }
  | { kind: 'salary'; isSalary: true; raw: string }
  | { kind: 'empty'; raw: '' }
  | { kind: 'unknown'; raw: string };

type ScheduleRow = {
  employee: string;
  position: string;
  rate: string;
  sourceRow: number;
  shifts: Array<{ date: string; label: string; value: ShiftCell }>;
};

type ParsedSchedule = {
  fileName: string;
  sheetName: string;
  headers: string[];
  employeeColumn: number;
  positionColumn: number;
  rateColumn: number;
  dateColumns: Array<{ index: number; date: string; label: string }>;
  rows: ScheduleRow[];
};

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('ru-RU');
const headerDate = (value: unknown, period: string): { date: string; label: string } | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { date, label: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(value) };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1 && value <= 31 && Number.isInteger(value) && /^\d{4}-\d{2}$/.test(period)) {
      const [year, month] = period.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, value));
      if (date.getUTCMonth() === month - 1) return { date: date.toISOString().slice(0, 10), label: String(value) };
      return null;
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      const date = [parsed.y, String(parsed.m).padStart(2, '0'), String(parsed.d).padStart(2, '0')].join('-');
      return { date, label: String(parsed.d).padStart(2, '0') + '.' + String(parsed.m).padStart(2, '0') };
    }
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (match) {
    const [yearFromPeriod, monthFromPeriod] = /^\d{4}-\d{2}$/.test(period) ? period.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    const year = match[3] ? Number(match[3].length === 2 ? '20' + match[3] : match[3]) : yearFromPeriod;
    const month = Number(match[2]);
    const day = Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { date: date.toISOString().slice(0, 10), label: day.toString().padStart(2, '0') + '.' + month.toString().padStart(2, '0') };
    }
  }
  match = text.match(/^(\d{1,2})$/);
  if (match && /^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-').map(Number);
    const day = Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() === month - 1) return { date: date.toISOString().slice(0, 10), label: String(day) };
  }
  return null;
};

function parseShift(value: unknown): ShiftCell {
  if (value == null || String(value).trim() === '') return { kind: 'empty', raw: '' };
  const raw = String(value).trim();
  const text = normalize(raw);
  const hours = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:ч|час(?:а|ов)?|h|hours?)$/i);
  if (hours) return { kind: 'hours', hours: Number(hours[1].replace(',', '.')), raw };
  if (/^(в|вых|выходной|выходн|off)$/i.test(text)) return { kind: 'dayOff', isDayOff: true, raw };
  if (/^(оклад|salary)$/i.test(text)) return { kind: 'salary', isSalary: true, raw };
  if (/^(смена|см|shift)$/i.test(text)) return { kind: 'shift', isShift: true, defaultHours: 12, raw };
  return { kind: 'unknown', raw };
}

const findColumn = (headers: string[], words: string[]) =>
  headers.findIndex(header => words.some(word => normalize(header).includes(word)));
const columnLabel = (headers: string[], index: number) => index >= 0 ? headers[index] || 'Столбец ' + (index + 1) : 'Не определён';

export default function FotScheduleImport({ period }: { period: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState<{ employee: number; position: number; rate: number } | null>(null);
  const [normHours, setNormHours] = useState('168');
  const [ndfl, setNdfl] = useState('');
  const [payTypes, setPayTypes] = useState<Record<number, FotPayType | null>>({});
  const [calculations, setCalculations] = useState<FotEmployeeCalculation[] | null>(null);
  const [pending, setPending] = useState<{ fileName: string; sheetName: string; headers: string[]; rows: unknown[][]; dateColumns: Array<{ index: number; date: string; label: string }> } | null>(null);

  const finishParse = (source: NonNullable<typeof pending>, columns: { employee: number; position: number; rate: number }) => {
    if (columns.employee < 0 || columns.position < 0 || columns.rate < 0) {
      setError('Выберите столбцы «Сотрудник», «Должность» и «Ставка». Без них корректный предпросмотр невозможен.');
      return;
    }
    const rows: ScheduleRow[] = source.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => String(row[columns.employee] ?? '').trim() || String(row[columns.position] ?? '').trim())
      .map(({ row, index }) => ({
        employee: String(row[columns.employee] ?? '').trim(),
        position: String(row[columns.position] ?? '').trim(),
        rate: row[columns.rate] == null ? '' : String(row[columns.rate]).trim(),
        sourceRow: index + 2,
        shifts: source.dateColumns.map(column => ({ ...column, value: parseShift(row[column.index]) })),
      }));
    if (!rows.length) {
      setError('Не найдено строк сотрудников. Проверьте выбранные столбцы и строку заголовков.');
      return;
    }
    setParsed({ ...source, ...columns, rows });
    setPayTypes(Object.fromEntries(rows.map(row => [row.sourceRow, inferFotPayType(row.rate)])));
    setCalculations(null);
    setError('');
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setParsed(null);
    setCalculations(null);
    setPayTypes({});
    setPending(null);
    setMapping(null);
    setError('');
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Поддерживаются только файлы Excel .xlsx и .xls.');
      return;
    }
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('В книге нет листов.');
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
      if (!matrix.length || !matrix[0]?.length) throw new Error('Первый лист пустой. Добавьте строку заголовков и график.');
      const headers = matrix[0].map((cell, index) => String(cell ?? '').trim() || 'Столбец ' + (index + 1));
      const dateColumns = matrix[0].flatMap((cell, index) => {
        const date = headerDate(cell, period);
        return date ? [{ index, ...date }] : [];
      });
      if (!dateColumns.length) throw new Error('Не удалось определить столбцы дат в первой строке. Проверьте заголовки дат в Excel.');
      const source = { fileName: file.name, sheetName, headers, rows: matrix.slice(1), dateColumns };
      setPending(source);
      const columns = {
        employee: findColumn(headers, ['сотрудник', 'фио', 'ф.и.о', 'имя', 'employee', 'персонал']),
        position: findColumn(headers, ['должность', 'позиция', 'роль', 'position', 'role']),
        rate: findColumn(headers, ['ставка', 'оклад', 'руб/час', 'руб/смен', 'rate', 'зарплата']),
      };
      setMapping(columns);
      if (Object.values(columns).every(index => index >= 0)) finishParse(source, columns);
      else setError('Часть служебных колонок не распознана автоматически. Выберите их вручную ниже.');
    } catch (e) {
      setError(e instanceof Error ? 'Не удалось прочитать Excel: ' + e.message : 'Не удалось прочитать файл. Проверьте, что он не повреждён.');
    } finally {
      setBusy(false);
    }
  };

  const calculate = () => {
    if (!parsed) return;
    const norm = normHours.trim() === '' ? NaN : Number(normHours.replace(',', '.'));
    if (!Number.isFinite(norm) || norm < 0) {
      setError('Укажите корректную норму часов за месяц (число не меньше нуля).');
      return;
    }
    if (ndfl.trim() !== '' && (!Number.isFinite(Number(ndfl.replace(',', '.'))) || Number(ndfl.replace(',', '.')) < 0)) {
      setError('Укажите корректную сумму НДФЛ: число не меньше нуля или оставьте поле пустым.');
      return;
    }
    const results = parsed.rows.map(row => calculateEmployeeMonth({
      employee: row.employee,
      position: row.position,
      rate: row.rate,
      payType: Object.prototype.hasOwnProperty.call(payTypes, row.sourceRow) ? payTypes[row.sourceRow] : inferFotPayType(row.rate),
      days: row.shifts.map(({ value }) => {
        switch (value.kind) {
          case 'hours': return { kind: 'hours' as const, hours: value.hours, raw: value.raw };
          case 'shift': return { kind: 'shift' as const, defaultHours: value.defaultHours, raw: value.raw };
          case 'dayOff': return { kind: 'dayOff' as const, raw: value.raw };
          case 'salary': return { kind: 'salary' as const, raw: value.raw };
          case 'empty': return { kind: 'empty' as const, raw: value.raw };
          case 'unknown': return { kind: 'unknown' as const, raw: value.raw };
        }
      }),
    }, { normHours: norm }));
    setCalculations(results);
    setError('');
  };
  const totals = calculations ? calculateTotalFOT(calculations, { normHours: Number(normHours.replace(',', '.')) }) : null;
  const manualNdfl = ndfl.trim() === '' ? null : Number(ndfl.replace(',', '.'));
  const moneyLabel = (amount: number | null | undefined) => amount == null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(amount);

  const cellLabel = (cell: ShiftCell) => {
    switch (cell.kind) {
      case 'hours': return cell.hours + ' ч';
      case 'shift': return 'Смена · ' + cell.defaultHours + ' ч по умолчанию';
      case 'dayOff': return 'Выходной';
      case 'salary': return 'Оклад';
      case 'empty': return '—';
      default: return 'Не распознано: ' + cell.raw;
    }
  };

  return <section className="fot-import panel">
    <div className="fot-import-heading"><div><span className="eyebrow">ИМПОРТ ГРАФИКА</span><h2>Загрузить Excel</h2><p>Исходный файл не изменяется. STEN читает первый лист и показывает распознанные смены до любых расчётов.</p></div><FileSpreadsheet size={20} /></div>
    <input ref={inputRef} className="fot-import-file" type="file" accept=".xlsx,.xls" onChange={event => void handleFile(event.target.files?.[0])} />
    <button type="button" className="fot-import-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
      <UploadCloud size={22} /><strong>{busy ? 'Читаем файл…' : 'Выбрать Excel-файл'}</strong><span>Форматы .xlsx и .xls</span>
    </button>
    {error && <div className="fot-import-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
    {pending && mapping && Object.values(mapping).some(index => index < 0) && <div className="fot-column-mapping">
      <strong>Сопоставьте колонки</strong>
      {(['employee', 'position', 'rate'] as const).map(key => <label key={key}>{key === 'employee' ? 'Сотрудник' : key === 'position' ? 'Должность' : 'Ставка'}
        <select value={mapping[key]} onChange={event => setMapping(current => current ? { ...current, [key]: Number(event.target.value) } : current)}>
          <option value={-1}>Выберите колонку</option>
          {pending.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
        </select>
      </label>)}
      <button type="button" className="secondary-button" onClick={() => finishParse(pending, mapping)}>Проверить сопоставление</button>
    </div>}
    {parsed && <div className="fot-import-preview">
      <div className="fot-preview-meta"><strong>{parsed.fileName}</strong><span>Лист: {parsed.sheetName} · Сотрудников: {parsed.rows.length} · Дат: {parsed.dateColumns.length}</span></div>
      <div className="fot-preview-legend"><span><b>12 ч</b> — часы распознаны</span><span><b>Смена</b> — по умолчанию 12 ч</span><span><b>В</b> — выходной</span><span><b>Не распознано</b> — требует проверки</span></div>
      <div className="fot-import-table-wrap"><table className="fot-import-table"><thead><tr><th>Сотрудник</th><th>Должность</th><th>Ставка (как в файле)</th><th>Тип ставки</th><th>Начислено (план)</th>{parsed.dateColumns.map(date => <th key={date.date}>{date.label}</th>)}</tr></thead>
        <tbody>{parsed.rows.map(row => <tr key={row.sourceRow}><td>{row.employee || 'Нет данных'}</td><td>{row.position || 'Нет данных'}</td><td>{row.rate || 'Нет данных'}</td><td><select className="fot-pay-type-select" aria-label={'Тип ставки: ' + row.employee} value={(Object.prototype.hasOwnProperty.call(payTypes, row.sourceRow) ? payTypes[row.sourceRow] : inferFotPayType(row.rate)) ?? ''} onChange={event => { setPayTypes(current => ({ ...current, [row.sourceRow]: event.target.value ? event.target.value as FotPayType : null })); setCalculations(null); }}><option value="">Не определён</option><option value="hourly">Руб./час</option><option value="shift">Руб./смена</option><option value="salary">Оклад</option></select></td><td className="fot-accrued-cell">{calculations ? <span title={calculations[parsed.rows.indexOf(row)]?.breakdown}>{moneyLabel(calculations[parsed.rows.indexOf(row)]?.accrued)}{calculations[parsed.rows.indexOf(row)]?.breakdown && <small className="fot-calculation-breakdown">{calculations[parsed.rows.indexOf(row)]?.breakdown}</small>}{calculations[parsed.rows.indexOf(row)]?.error && <small className="fot-calculation-error">{calculations[parsed.rows.indexOf(row)]?.error}</small>}</span> : '—'}</td>{row.shifts.map(shift => <td key={shift.date} title={shift.value.kind === 'unknown' ? 'Исходное значение: ' + shift.value.raw : shift.value.kind}>{cellLabel(shift.value)}</td>)}</tr>)}</tbody>
      </table></div>
      {parsed.rows.some(row => row.shifts.some(shift => shift.value.kind === 'unknown')) && <p className="fot-import-warning">Некоторые обозначения не распознаны. Они показаны как есть и не будут автоматически превращены в часы или деньги.</p>}
      <p className="fot-import-note">Расчёт выполняется только по распознанным данным. Тип ставки можно уточнить вручную; неизвестные обозначения блокируют расчёт сотрудника до проверки.</p>
      <section className="fot-calculation-panel" aria-label="Параметры расчёта">
        <div className="fot-calculation-heading"><div><span className="eyebrow">РАСЧЁТ ФОТ</span><h3>Параметры расчёта</h3></div><span className="fot-calculation-hint">НДФЛ вводится вручную</span></div>
        <div className="fot-calculation-fields">
          <label>Норма часов за месяц<input type="number" min="0" step="0.5" value={normHours} onChange={event => { setNormHours(event.target.value); setCalculations(null); }} /></label>
          <label>Общий НДФЛ за месяц (руб.)<input type="number" min="0" step="0.01" placeholder="Введите сумму вручную" value={ndfl} onChange={event => { setNdfl(event.target.value); }} /></label>
          <button type="button" className="secondary-button" onClick={calculate}>Рассчитать ФОТ</button>
        </div>
        {calculations && totals && <div className="fot-calculation-results">
          <div className="fot-result-card"><span>Общий плановый ФОТ</span><strong>{moneyLabel(totals.accrued)}</strong><small>{totals.accrued == null ? 'Есть сотрудники с незавершённым расчётом' : 'Сумма начислений по рассчитанным сотрудникам'}</small></div>
          <div className="fot-result-card"><span>Общее количество часов</span><strong>{totals.hours == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(totals.hours) + ' ч'}</strong><small>{totals.hours == null ? 'Есть сотрудники без подтверждённых часов' : 'По распознанному графику'}</small></div>
          <div className={'fot-result-card ' + (totals.overtimeHours != null && totals.overtimeHours > 0 ? 'is-warning' : '')}><span>Переработка</span><strong>{totals.overtimeHours == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(totals.overtimeHours) + ' ч'}</strong><small>{totals.overtimeHours != null && totals.overtimeHours > 0 ? 'Превышение заданной нормы' : totals.overtimeHours == null ? 'Недостаточно данных для полной оценки' : 'Превышения нормы не выявлено'}</small></div>
          <div className="fot-result-card"><span>К выплате после НДФЛ</span><strong>{totals.accrued == null || manualNdfl == null ? '—' : moneyLabel(totals.accrued - manualNdfl)}</strong><small>{manualNdfl == null ? 'Введите общий НДФЛ вручную' : 'Начислено − введённый НДФЛ'}</small></div>
        </div>}
        {calculations && totals && totals.employeesWithErrors > 0 && <p className="fot-calculation-warning">Расчёт требует проверки: {totals.employeesWithErrors} сотрудник(ов) имеют неполные или неоднозначные данные. Общие итоги не подменяются нулями.</p>}
      </section>
    </div>}
  </section>;
}
