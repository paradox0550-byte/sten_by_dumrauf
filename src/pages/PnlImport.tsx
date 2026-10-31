import { useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, FileSpreadsheet, Save, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { writePnlAndVerify } from '../lib/saveVerify';
import { saveUserTemplate } from '../lib/pnlTemplate';
import { useScope } from '../lib/useScope';
import {
  buildPnlImportRows,
  guessPnlColumns,
  parsePnlAmount,
  parsePnlWorkbook,
  type PnlColumnMap,
  type PnlExcelSheet,
  type PnlImportedRow,
  type PnlExcelWorkbook,
} from '../lib/pnlExcelImport';

const columnName = (index: number) => {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
};
const headerLabel = (sheet: PnlExcelSheet, headerRow: number, index: number) => {
  const value = sheet.rows[headerRow]?.[index];
  return `${columnName(index)} · ${String(value ?? '').trim() || 'Без названия'}`;
};
const blockingWarnings = (row: PnlImportedRow) => row.warnings.filter(warning =>
  warning !== 'Похоже на итоговую строку — исключена из импорта во избежание двойного счёта'
  && warning !== 'Похоже на итоговую строку — включена вручную; проверьте, что она не дублирует составляющие'
);

export default function PnLImport() {
  const nav = useNavigate();
  const [scope] = useScope();
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<PnlExcelWorkbook | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<PnlColumnMap>({ article: -1, plan: null, fact: null });
  const [rows, setRows] = useState<PnlImportedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'ok' | 'warn'>('info');

  const selectedSheet = useMemo(
    () => workbook?.sheets.find(sheet => sheet.name === sheetName) ?? null,
    [workbook, sheetName],
  );
  const usableRows = rows.filter(row => !row.skipped);
  const blockers = usableRows.flatMap(row => blockingWarnings(row).map(warning => `${row.source}: ${warning}`));
  const emptyAmountRows = usableRows.filter(row => row.plan === null && row.fact === null);
  const canSave = usableRows.length > 0 && !saving && confirmed && blockers.length === 0 && emptyAmountRows.length === 0;

  function setNotice(text: string, kind: 'info' | 'ok' | 'warn' = 'info') {
    setMessage(text);
    setMessageKind(kind);
  }

  async function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(nextFile.name)) {
      setNotice('Выберите Excel-файл XLS, XLSX или XLSM.', 'warn');
      return;
    }
    if (nextFile.size > 15 * 1024 * 1024) {
      setNotice('Файл больше 15 МБ. Разделите его на части и повторите импорт.', 'warn');
      return;
    }
    try {
      const parsed = parsePnlWorkbook(await nextFile.arrayBuffer());
      const first = parsed.sheets.find(sheet => sheet.rows.length > 0);
      if (!first) throw new Error('В книге нет листов с читаемыми ячейками.');
      const detectedHeader = first.headerRow >= 0 ? first.headerRow : 0;
      setFile(nextFile);
      setWorkbook(parsed);
      setSheetName(first.name);
      setHeaderRow(detectedHeader);
      setColumns(guessPnlColumns(first.rows[detectedHeader] ?? []));
      setRows([]);
      setConfirmed(false);
      setNotice(`Книга прочитана: листов ${parsed.sheets.length}. Выберите лист, строку заголовков и проверьте столбцы до импорта.`);
    } catch (error) {
      setFile(null);
      setWorkbook(null);
      setRows([]);
      setNotice(error instanceof Error ? error.message : 'Не удалось прочитать Excel.', 'warn');
    }
  }

  function changeSheet(name: string) {
    if (!workbook) return;
    const next = workbook.sheets.find(sheet => sheet.name === name);
    if (!next) return;
    const nextHeader = next.headerRow >= 0 ? next.headerRow : 0;
    setSheetName(name);
    setHeaderRow(nextHeader);
    setColumns(guessPnlColumns(next.rows[nextHeader] ?? []));
    setRows([]);
    setConfirmed(false);
  }

  function changeHeaderRow(value: number) {
    if (!selectedSheet) return;
    setHeaderRow(value);
    setColumns(guessPnlColumns(selectedSheet.rows[value] ?? []));
    setRows([]);
    setConfirmed(false);
  }

  function prepareRows() {
    if (!selectedSheet) return;
    try {
      const parsed = buildPnlImportRows(selectedSheet, headerRow, columns);
      setRows(parsed);
      setConfirmed(false);
      const excluded = parsed.filter(row => row.skipped).length;
      const warnings = parsed.filter(row => !row.skipped && blockingWarnings(row).length > 0).length;
      setNotice(
        `Подготовлено ${parsed.length} строк; итоговые строки исключены: ${excluded}; требуют исправления: ${warnings}. Исходные названия статей сохранены.`,
        warnings ? 'warn' : 'info',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось подготовить строки.', 'warn');
    }
  }

  function updateRow(id: string, patch: Partial<PnlImportedRow>) {
    setRows(previous => previous.map(row => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      const warnings = next.warnings.filter(warning => {
        if (warning === 'Нет названия статьи' && next.article.trim()) return false;
        if (warning === 'Не удалось прочитать сумму План/Факт' && (next.plan !== null || next.fact !== null)) return false;
        if (warning === 'Формула План не содержит сохранённого результата' && patch.plan !== undefined) return false;
        if (warning === 'Формула Факт не содержит сохранённого результата' && patch.fact !== undefined) return false;
        if (warning.startsWith('Похоже на итоговую строку')) return false;
        return true;
      });
      if (!next.article.trim()) warnings.push('Нет названия статьи');
      if (next.plan === null && next.fact === null
        && !warnings.some(warning => warning.includes('Формула'))) warnings.push('Не удалось прочитать сумму План/Факт');
      if (/^(?:итого|всего|общий итог|итог|total|grand total|subtotal|промежуточный итог)(?:\s|$|[:—-])/iu.test(next.article.trim())) {
        warnings.push(next.skipped
          ? 'Похоже на итоговую строку — исключена из импорта во избежание двойного счёта'
          : 'Похоже на итоговую строку — включена вручную; проверьте, что она не дублирует составляющие');
      }
      return { ...next, warnings };
    }));
    setConfirmed(false);
  }

  function useAsTemplate() {
    const articles = usableRows.map(row => row.article.trim()).filter(Boolean);
    if (!articles.length) {
      setNotice('Нет названий статей для шаблона.', 'warn');
      return;
    }
    try {
      saveUserTemplate(articles);
      setNotice(`Сохранено названий статей: ${articles.length}. Шаблон доступен в P&L.`, 'ok');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить шаблон.', 'warn');
    }
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setNotice('Сохраняем и проверяем данные на сервере…');
    try {
      const result = await writePnlAndVerify(scope, usableRows.map(row => ({
        article: row.article.trim(),
        plan: row.plan,
        fact: row.fact,
      })));
      setNotice(result.message, result.ok ? 'ok' : 'warn');
      if (result.ok) setConfirmed(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">ФИНАНСЫ · P&amp;L</span>
          <h1>Импорт финансового отчёта</h1>
          <p>Excel → проверка структуры и сумм → подтверждение → запись → проверка сохранения.</p>
        </div>
        <button className="secondary-button" onClick={() => nav('/pnl')}><ArrowLeft size={16} /> К P&amp;L</button>
      </header>

      <section className="panel import-panel">
        <div className="import-icon"><FileSpreadsheet size={28} /></div>
        <h2>{file?.name ?? 'Загрузить Excel'}</h2>
        <p>STEN не будет придумывать статью или подменять отсутствующую сумму нулём.</p>
        <label className="upload-box">
          <UploadCloud size={24} />
          <b>Выбрать файл</b>
          <small>XLS, XLSX или XLSM · до 15 МБ</small>
          <input hidden type="file" accept=".xlsx,.xls,.xlsm" onChange={event => {
            void chooseFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }} />
        </label>

        {workbook && selectedSheet && (
          <div className="pnl-import-config" style={{ display: 'grid', gap: 14, marginTop: 20 }}>
            <div className="panel-title"><CheckCircle2 size={17} /> Структура книги <span>{workbook.sheets.length} листов</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
              <label className="settings-label">Лист Excel
                <select className="settings-field" value={sheetName} onChange={event => changeSheet(event.target.value)}>
                  {workbook.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </label>
              <label className="settings-label">Строка заголовков
                <select className="settings-field" value={headerRow} onChange={event => changeHeaderRow(Number(event.target.value))}>
                  {selectedSheet.rows.slice(0, 50).map((row, index) => (
                    <option key={index} value={index}>Строка {index + 1}: {row.slice(0, 4).map(cell => String(cell ?? '').trim()).filter(Boolean).join(' · ').slice(0, 70) || 'пустая'}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="panel-title">Сопоставление столбцов</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
              <label className="settings-label">Название статьи *
                <select className="settings-field" value={columns.article} onChange={event => { setColumns(current => ({ ...current, article: Number(event.target.value) })); setRows([]); setConfirmed(false); }}>
                  {selectedSheet.rows[headerRow]?.map((_, index) => <option key={index} value={index}>{headerLabel(selectedSheet, headerRow, index)}</option>)}
                </select>
              </label>
              <label className="settings-label">План
                <select className="settings-field" value={columns.plan ?? -1} onChange={event => { setColumns(current => ({ ...current, plan: Number(event.target.value) < 0 ? null : Number(event.target.value) })); setRows([]); setConfirmed(false); }}>
                  <option value={-1}>Не использовать</option>
                  {selectedSheet.rows[headerRow]?.map((_, index) => <option key={index} value={index}>{headerLabel(selectedSheet, headerRow, index)}</option>)}
                </select>
              </label>
              <label className="settings-label">Факт
                <select className="settings-field" value={columns.fact ?? -1} onChange={event => { setColumns(current => ({ ...current, fact: Number(event.target.value) < 0 ? null : Number(event.target.value) })); setRows([]); setConfirmed(false); }}>
                  <option value={-1}>Не использовать</option>
                  {selectedSheet.rows[headerRow]?.map((_, index) => <option key={index} value={index}>{headerLabel(selectedSheet, headerRow, index)}</option>)}
                </select>
              </label>
            </div>

            <div className="table-scroll">
              <table>
                <thead><tr>{(selectedSheet.rows[headerRow] ?? []).slice(0, 12).map((cell, index) => <th key={index}>{columnName(index)} · {String(cell ?? '—')}</th>)}</tr></thead>
                <tbody>{selectedSheet.rows.slice(headerRow + 1, headerRow + 6).map((row, index) => (
                  <tr key={index}>{(selectedSheet.rows[headerRow] ?? []).slice(0, 12).map((_, col) => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <button className="primary-button wide" onClick={prepareRows}>Распознать строки для P&amp;L</button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="import-mapping" style={{ marginTop: 22 }}>
            <div className="panel-title"><CheckCircle2 size={17} /> Проверка перед записью <span>{usableRows.length} строк к импорту</span></div>
            <p>Исходные названия сохраняются. Измените название или суммы только если проверили исходную ячейку.</p>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Включить</th><th>Статья из Excel</th><th>План</th><th>Факт</th><th>Источник и предупреждения</th></tr></thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} style={{ opacity: row.skipped ? 0.55 : 1 }}>
                      <td><input type="checkbox" checked={!row.skipped} aria-label={`Включить ${row.article || row.source}`} onChange={event => updateRow(row.id, { skipped: !event.target.checked })} /></td>
                      <td style={{ minWidth: 190 }}>
                        <input className="settings-field" value={row.article} aria-label="Название статьи" onChange={event => updateRow(row.id, { article: event.target.value })} />
                        <small>{row.source}</small>
                      </td>
                      <td><input className="settings-field" type="number" step="any" value={row.plan ?? ''} aria-label={`План ${row.article}`} onChange={event => updateRow(row.id, { plan: event.target.value === '' || !Number.isFinite(Number(event.target.value)) ? null : Number(event.target.value) })} /></td>
                      <td><input className="settings-field" type="number" step="any" value={row.fact ?? ''} aria-label={`Факт ${row.article}`} onChange={event => updateRow(row.id, { fact: event.target.value === '' || !Number.isFinite(Number(event.target.value)) ? null : Number(event.target.value) })} /></td>
                      <td style={{ minWidth: 230 }}>
                        <small>{row.sourceCellPlan ? `План: ${row.sourceCellPlan}` : 'План: не выбран'} · {row.sourceCellFact ? `Факт: ${row.sourceCellFact}` : 'Факт: не выбран'}</small>
                        {row.warnings.filter(warning => warning !== 'Похоже на итоговую строку — исключена из импорта во избежание двойного счёта').map(warning => <small key={warning} style={{ display: 'block', color: 'var(--sten-risk, #A62D2D)' }}>{warning}</small>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {blockers.length > 0 && <div className="import-result warn"><AlertTriangle size={16} />Нужно исправить обязательные ошибки: {blockers.length}. Суммы без результата формулы не заменяются нулём.</div>}
            <label className="import-confirmation">
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
              <span><b>Я проверил статьи и суммы</b><small>Будут записаны только включённые строки. Итоговые строки исключены по умолчанию.</small></span>
            </label>
            <button className="primary-button wide" disabled={!canSave} onClick={() => void save()}>
              <Save size={16} /> {saving ? 'Сохраняем…' : 'Подтвердить и записать в P&amp;L'}
            </button>
            <button className="secondary-button wide" onClick={useAsTemplate}>Сохранить названия статей как шаблон</button>
          </div>
        )}

        {message && <div className={`import-result ${messageKind === 'warn' ? 'warn' : messageKind === 'ok' ? 'ok' : ''}`}>
          {messageKind !== 'ok' && <AlertTriangle size={16} />}{message}
        </div>}
      </section>
    </main>
  );
}
