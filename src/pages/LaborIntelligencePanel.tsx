import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react';
import { parseIikoSalesFile } from '../domain/labor/iiko/parse';
import { iikoRowsToSalesLines } from '../domain/labor/iiko/toSalesLines';
import type { IikoParsedRow, ZoneId } from '../domain/labor/iiko/schema';
import { calculateLabor } from '../domain/labor/calc/laborCalc';
import { forecastHourlyDemand } from '../domain/labor/forecast/demandForecast';
import { recommendHourlyStaffing } from '../domain/labor/forecast/recommendSchedule';
import { parseShiftFile } from '../domain/labor/imports/parseShiftFile';
import type { SalesLine, ShiftLine } from '../domain/labor/imports/schema';
import type { LaborConfiguration, RolePassport, ZoneDemandNorm } from '../domain/labor/roles/schema';
import './LaborIntelligencePanel.css';

type Zone = Exclude<ZoneId, 'unknown'>;
type Props = { period: string; scopeKey: string };
type Stored = { version: 1; roles: RolePassport[]; norms: ZoneDemandNorm[]; effortByCategory: Record<string, number>; zoneByCategory: Record<string, Zone>; coverageMinHoursByRole: Record<string, number> };
const STORAGE = 'sten_labor_intelligence_v1:';
const ZONES: Array<{ id: Zone; label: string }> = [
  { id: 'hot', label: 'Горячий цех' }, { id: 'cold', label: 'Холодный цех' },
  { id: 'bar', label: 'Бар' }, { id: 'prep', label: 'Заготовка' }, { id: 'dessert', label: 'Десерты' },
];
const emptyStored = (): Stored => ({ version: 1, roles: [], norms: ZONES.map(zone => ({ zoneId: zone.id, unitsPerLaborHour: null })), effortByCategory: {}, zoneByCategory: {}, coverageMinHoursByRole: {} });
const readStored = (key: string): Stored => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyStored();
    const value = JSON.parse(raw) as Stored;
    return value?.version === 1 ? { ...emptyStored(), ...value } : emptyStored();
  } catch { return emptyStored(); }
};
const fmt = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
const rub = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);

export default function LaborIntelligencePanel({ period, scopeKey }: Props) {
  const storageKey = STORAGE + scopeKey;
  const [stored, setStored] = useState<Stored>(() => readStored(storageKey));
  const [loadedFor, setLoadedFor] = useState(storageKey);
  const [sales, setSales] = useState<SalesLine[]>([]);
  const [shifts, setShifts] = useState<ShiftLine[]>([]);
  const [salesReport, setSalesReport] = useState<{ fileName: string; totalRows: number; validRows: number; unmappedRows: number; invalidRows: number; skippedRows: number; unmappedCategories: Array<{ category: string; rows: number; revenue: number }>; errors: Array<{ row: number; reason: string }> } | null>(null);
  const [shiftReport, setShiftReport] = useState<{ fileName: string; totalRows: number; acceptedRows: number; rejectedRows: number; issues: Array<{ row: number; reason: string }> } | null>(null);
  const [salesError, setSalesError] = useState('');
  const [shiftError, setShiftError] = useState('');
  const [busy, setBusy] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleZone, setRoleZone] = useState<Zone>('hot');
  const [roleRate, setRoleRate] = useState('');
  const [roleCoverage, setRoleCoverage] = useState('');
  const [normInputs, setNormInputs] = useState<Record<string, string>>({});
  const [effortInputs, setEffortInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(true);

  useEffect(() => { setStored(readStored(storageKey)); setLoadedFor(storageKey); setSales([]); setShifts([]); setSalesReport(null); setShiftReport(null); setNormInputs({}); setEffortInputs({}); }, [storageKey]);
  useEffect(() => { if (loadedFor === storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(stored)); } catch { /* Keep the active configuration in memory if browser storage is full. */ } } }, [storageKey, loadedFor, stored]);

  const categories = useMemo(() => [...new Set(salesReport?.unmappedCategories.map(item => item.category) ?? [])], [salesReport]);
  const knownCategories = useMemo(() => [...new Set(sales.map(line => line.categoryName))].sort((a, b) => a.localeCompare(b, 'ru')), [sales]);
  const allCategories = useMemo(() => [...new Set([...knownCategories, ...categories])].sort((a, b) => a.localeCompare(b, 'ru')), [knownCategories, categories]);

  const configuration: LaborConfiguration = useMemo(() => ({
    roles: stored.roles,
    zoneDemandNorms: stored.norms,
    coverageMinHoursByRole: stored.coverageMinHoursByRole,
  }), [stored.roles, stored.norms, stored.coverageMinHoursByRole]);

  async function importSales(file?: File) {
    if (!file) return;
    setBusy('sales'); setSalesError(''); setSales([]); setSalesReport(null);
    try {
      const parsed = await parseIikoSalesFile(await file.arrayBuffer());
      const categoriesWithNoZone = parsed.report.unmappedCategories;
      const allRows: IikoParsedRow[] = [
        ...parsed.data,
        ...parsed.unmappedData.map(row => ({ ...row, zone: stored.zoneByCategory[row.category] ?? 'unknown' as const })),
      ];
      const effort = Object.fromEntries(Object.entries(stored.effortByCategory).filter(([, value]) => Number.isFinite(value) && value > 0));
      const lines = iikoRowsToSalesLines(allRows, effort);
      setSales(lines);
      setSalesReport({ fileName: file.name, ...parsed.report, unmappedCategories: categoriesWithNoZone });
      if (!lines.length) setSalesError('В файле нет строк, которые можно использовать в расчёте. Проверьте лист и структуру отчёта.');
    } catch (error) {
      setSalesError(error instanceof Error ? error.message : 'Не удалось прочитать экспорт iiko.');
    } finally { setBusy(''); }
  }

  async function importShifts(file?: File) {
    if (!file) return;
    setBusy('shifts'); setShiftError(''); setShifts([]); setShiftReport(null);
    try {
      const parsed = await parseShiftFile(await file.arrayBuffer());
      setShifts(parsed.data);
      setShiftReport({ fileName: file.name, ...parsed.report });
      if (!parsed.data.length) setShiftError('Не найдено ни одной корректной строки табеля.');
    } catch (error) {
      setShiftError(error instanceof Error ? error.message : 'Не удалось прочитать табель.');
    } finally { setBusy(''); }
  }

  function setZone(category: string, zone: Zone) {
    setStored(prev => ({ ...prev, zoneByCategory: { ...prev.zoneByCategory, [category]: zone } }));
    setSales(current => current.map(line => line.categoryName === category ? { ...line, zoneId: zone } : line));
  }
  function setEffort(category: string, raw: string) {
    setEffortInputs(prev => ({ ...prev, [category]: raw }));
    const value = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    setStored(prev => {
      const next = { ...prev.effortByCategory };
      if (value == null) delete next[category]; else if (Number.isFinite(value) && value > 0) next[category] = value;
      return { ...prev, effortByCategory: next };
    });
    setSales(current => current.map(line => line.categoryName === category
      ? { ...line, effortUnits: value != null && Number.isFinite(value) && value > 0 ? line.quantity * value : null }
      : line));
  }

  function addRole() {
    const name = roleName.trim().replace(/\s+/g, ' ');
    const rate = roleRate.trim() === '' ? null : Number(roleRate.replace(',', '.'));
    const coverage = roleCoverage.trim() === '' ? null : Number(roleCoverage.replace(',', '.'));
    if (!name) return;
    if (stored.roles.some(role => role.positionName.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return;
    if ((rate != null && (!Number.isFinite(rate) || rate < 0)) || (coverage != null && (!Number.isFinite(coverage) || coverage < 0))) return;
    const role: RolePassport = { id: crypto.randomUUID(), positionName: name, workMode: 'mixed', zoneIds: [roleZone], unitName: 'час', minimumShiftHours: null, fixedHoursPerDay: null, hourlyRate: rate, salaryPerShift: null, monthlySalary: null, productivityUnitsPerHour: null, effortCoefficient: null, active: true };
    setStored(prev => ({ ...prev, roles: [...prev.roles, role], coverageMinHoursByRole: { ...prev.coverageMinHoursByRole, ...(coverage == null ? {} : { [name]: coverage }) } }));
    setRoleName(''); setRoleRate(''); setRoleCoverage('');
  }

  const periodSales = sales.filter(line => line.businessDate.startsWith(period));
  const periodShifts = shifts.filter(line => line.businessDate.startsWith(period));
  const calculation = useMemo(() => periodSales.length && periodShifts.length && stored.roles.length
    ? calculateLabor({ sales: periodSales, shifts: periodShifts, config: configuration })
    : null, [periodSales, periodShifts, configuration, stored.roles.length]);
  const forecast = useMemo(() => forecastHourlyDemand(sales), [sales]);
  const recommendations = useMemo(() => recommendHourlyStaffing(forecast.cells, Object.fromEntries(stored.norms.map(norm => [norm.zoneId, norm.unitsPerLaborHour]))), [forecast, stored.norms]);
  const salesRevenue = periodSales.length ? periodSales.reduce((sum, line) => sum + line.revenue, 0) : null;
  const actualHours = calculation?.actualHours ?? null;

  return <section className="fot-section li-panel">
    <div className="fot-section-heading"><div><span className="eyebrow">STEN LABOR INTELLIGENCE</span><h2>Загрузка команды и потребность в часах</h2><p>Продажи, табель, нормы и рекомендации собраны в одном контуре. Все настройки привязаны к текущему рабочему пространству.</p></div><button type="button" className="secondary-button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Свернуть' : 'Открыть расчёт'}</button></div>
    {expanded && <>
      <div className="li-import-grid">
        <div className="li-import-card"><b><FileSpreadsheet size={16} /> Продажи iiko</b><p>Экспорт OLAP в XLSX или CSV. Для почасового анализа нужны дата, час, блюдо, категория, количество и сумма.</p><label className="li-upload"><UploadCloud size={16} />{busy === 'sales' ? 'Читаем файл…' : 'Загрузить продажи'}<input type="file" accept=".xlsx,.xls,.csv" disabled={!!busy} onChange={event => void importSales(event.target.files?.[0])} /></label>{salesReport && <small>{salesReport.fileName}: принято {salesReport.validRows}, нераспознано {salesReport.unmappedRows}, ошибок {salesReport.invalidRows}, пропущено {salesReport.skippedRows}</small>}{salesError && <span className="li-error" role="alert">{salesError}</span>}</div>
        <div className="li-import-card"><b><FileSpreadsheet size={16} /> Табель / график</b><p>Файл XLSX/CSV с датой, сотрудником, должностью и часами. Время начала/окончания и ставка уточняют расчёт.</p><label className="li-upload"><UploadCloud size={16} />{busy === 'shifts' ? 'Читаем файл…' : 'Загрузить табель'}<input type="file" accept=".xlsx,.xls,.csv" disabled={!!busy} onChange={event => void importShifts(event.target.files?.[0])} /></label>{shiftReport && <small>{shiftReport.fileName}: принято {shiftReport.acceptedRows} из {shiftReport.totalRows}, ошибок {shiftReport.rejectedRows}</small>}{shiftError && <span className="li-error" role="alert">{shiftError}</span>}</div>
      </div>
      {salesReport && salesReport.unmappedCategories.length > 0 && <div className="li-config"><h3>Сопоставьте категории с рабочими зонами</h3><p>Категория без зоны не попадёт в расчёт потребности. Выберите реальную зону ресторана.</p>{salesReport.unmappedCategories.map(item => <div className="li-config-row" key={item.category}><span>{item.category} · {item.rows} строк · {rub(item.revenue)}</span><select value={stored.zoneByCategory[item.category] ?? ''} onChange={event => { if (event.target.value) setZone(item.category, event.target.value as Zone); }}><option value="">Не сопоставлена</option>{ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></div>)}</div>}
      {allCategories.length > 0 && <div className="li-config"><h3>Трудоёмкость блюд и категорий</h3><p>Коэффициент задаётся владельцем ресторана: трудоёмкие единицы на одну проданную позицию. Количество блюд само по себе не считается трудозатратами.</p>{allCategories.map(category => <div className="li-config-row" key={category}><span>{category}</span><label>Ед./блюдо<input type="number" min="0.001" step="0.1" placeholder="Не задано" value={effortInputs[category] ?? (stored.effortByCategory[category]?.toString() ?? '')} onChange={event => setEffort(category, event.target.value)} /></label></div>)}</div>}
      <div className="li-config"><h3>Паспорта должностей</h3><p>Укажите фактические должности, зоны и ставки. Нормы и минимальное покрытие не подставляются автоматически.</p><div className="li-role-form"><input aria-label="Должность" placeholder="Название должности" value={roleName} onChange={event => setRoleName(event.target.value)} /><select value={roleZone} onChange={event => setRoleZone(event.target.value as Zone)}>{ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select><input aria-label="Ставка в час" type="number" min="0" placeholder="₽ / час" value={roleRate} onChange={event => setRoleRate(event.target.value)} /><input aria-label="Минимум часов покрытия" type="number" min="0" placeholder="Мин. часов покрытия" value={roleCoverage} onChange={event => setRoleCoverage(event.target.value)} /><button type="button" className="secondary-button" onClick={addRole} disabled={!roleName.trim()}>Добавить</button></div>
        {stored.roles.length > 0 ? <div className="li-role-list">{stored.roles.map(role => <div className="li-config-row" key={role.id}><span><b>{role.positionName}</b><small>{role.zoneIds.map(zone => ZONES.find(item => item.id === zone)?.label ?? zone).join(', ')} · {role.hourlyRate == null ? 'ставка не задана' : rub(role.hourlyRate)} · минимум покрытия {fmt(stored.coverageMinHoursByRole[role.positionName] ?? null)} ч</small></span><button type="button" className="li-remove" onClick={() => setStored(prev => ({ ...prev, roles: prev.roles.filter(item => item.id !== role.id), coverageMinHoursByRole: Object.fromEntries(Object.entries(prev.coverageMinHoursByRole).filter(([name]) => name !== role.positionName)) }))}>Удалить</button></div>)}</div> : <div className="li-empty">Паспорта должностей ещё не настроены.</div>}
      </div>
      <div className="li-config"><h3>Нормы производительности по зонам</h3><p>Сколько трудоёмких единиц зона обрабатывает за один человеко-час. Заполняйте по хронометражу или подтверждённой статистике.</p><div className="li-norm-grid">{stored.norms.map(norm => <label key={norm.zoneId}>{ZONES.find(zone => zone.id === norm.zoneId)?.label ?? norm.zoneId}<input type="number" min="0.001" step="0.1" placeholder="Ед. / человеко-час" value={normInputs[norm.zoneId] ?? (norm.unitsPerLaborHour?.toString() ?? '')} onChange={event => { const raw = event.target.value; setNormInputs(prev => ({ ...prev, [norm.zoneId]: raw })); const value = raw.trim() === '' ? null : Number(raw.replace(',', '.')); setStored(prev => ({ ...prev, norms: prev.norms.map(item => item.zoneId === norm.zoneId ? { ...item, unitsPerLaborHour: value != null && Number.isFinite(value) && value > 0 ? value : null } : item) })); }} /></label>)}</div></div>
      <div className="li-results">
        <div className="li-result-head"><h3>Фактическая загрузка · {period}</h3><button type="button" className="secondary-button" onClick={() => { setSales([]); setShifts([]); setSalesReport(null); setShiftReport(null); }}><RefreshCw size={14} /> Очистить импорт</button></div>
        <div className="li-kpis"><article><small>Продажи за период</small><strong>{periodSales.length ? fmt(periodSales.length, 0) + ' строк' : '—'}</strong></article><article><small>Выручка импорта</small><strong>{rub(salesRevenue)}</strong></article><article><small>Часы по табелю</small><strong>{periodShifts.length ? fmt(periodShifts.reduce((sum, line) => sum + line.hours, 0)) : '—'}</strong></article><article><small>Часы по расчёту</small><strong>{fmt(actualHours)}</strong></article></div>
        {!calculation ? <div className="li-empty"><AlertTriangle size={16} /> Для расчёта загрузите продажи и табель, настройте должности и коэффициенты трудоёмкости.</div> : <>
          <div className="li-status"><b>{calculation.status === 'complete' ? 'Расчёт выполнен' : calculation.status === 'partial' ? 'Расчёт частичный' : 'Расчёт недоступен'}</b>{calculation.reasons.map(reason => <span key={reason}>{reason}</span>)}</div>
          <div className="li-kpis"><article><small>Требуемые часы</small><strong>{fmt(calculation.requiredHours)}</strong></article><article><small>Избыточные часы</small><strong>{fmt(calculation.excessHours)}</strong></article><article><small>Фактический ФОТ по ставкам</small><strong>{rub(calculation.actualLaborCost)}</strong></article><article><small>Стоимость избытка</small><strong>{rub(calculation.excessLaborCost)}</strong></article></div>
          <div className="li-table-wrap"><table><thead><tr><th>Зона</th><th>Факт, ч</th><th>Потребность, ч</th><th>Избыток, ч</th></tr></thead><tbody>{calculation.byZone.map(row => <tr key={row.zoneId}><td>{ZONES.find(zone => zone.id === row.zoneId)?.label ?? row.zoneId}</td><td>{fmt(row.actualHours)}</td><td>{fmt(row.requiredHours)}</td><td>{fmt(row.excessHours)}</td></tr>)}</tbody></table></div>
          <div className="li-table-wrap"><table><thead><tr><th>Должность</th><th>Факт, ч</th><th>Минимум покрытия, ч</th><th>Недостаток, ч</th></tr></thead><tbody>{calculation.byRole.map(row => <tr key={row.positionName}><td>{row.positionName}</td><td>{fmt(row.actualHours)}</td><td>{fmt(row.minimumHours)}</td><td>{fmt(row.coverageGapHours)}</td></tr>)}</tbody></table></div>
        </>}
      </div>
      <div className="li-config"><h3>Прогноз спроса и потребность в смене</h3><p>Медиана сопоставимых дней недели, часа и зоны по истории до 8 недель. Нужно не менее 4 календарных недель с заданной трудоёмкостью.</p>{forecast.status !== 'ready' ? <div className="li-empty">{forecast.reason}</div> : <><div className="li-status"><b>История достаточна для предварительного прогноза</b><span>Слоты прогноза: {forecast.cells.length}. Это потребность в часах, не готовый график сотрудников.</span></div><div className="li-table-wrap"><table><thead><tr><th>День недели</th><th>Час</th><th>Зона</th><th>Нагрузка</th><th>Часы</th><th>Сотрудники, минимум</th></tr></thead><tbody>{recommendations.slice(0, 80).map((row, index) => <tr key={row.weekday + ':' + row.hour + ':' + row.zoneId + ':' + index}><td>{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][row.weekday]}</td><td>{String(row.hour).padStart(2, '0')}:00</td><td>{ZONES.find(zone => zone.id === row.zoneId)?.label ?? row.zoneId}</td><td>{fmt(row.workloadUnits)}</td><td>{fmt(row.requiredLaborHours)}</td><td>{fmt(row.requiredPeople, 0)}</td></tr>)}</tbody></table></div></>}</div>
      <p className="li-footnote">Настройки сохраняются локально для выбранного рабочего контура. Импортированные строки доступны до обновления страницы; данные не отправляются на сервер и не синхронизируются между устройствами. Перед утверждением графика проверьте доступность сотрудников, трудовое законодательство и минимальное покрытие каждой зоны.</p>
    </>}
  </section>;
}
