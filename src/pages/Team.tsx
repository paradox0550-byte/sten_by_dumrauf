import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarClock, ChefHat, ClipboardList, Download, RefreshCw, Users, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { scopeQuery } from '../lib/scope';
import { useScope } from '../lib/useScope';
import { formatMoney } from '../lib/format';
import FotScheduleImport from './FotScheduleImport';
import './Team.css';

type PayrollRecord = { department?: string | null; hours?: number | string | null; amount?: number | string | null; period?: string };
type Pnl = {
  rows?: Array<{ article?: string; plan?: number | null; fact?: number | null }>;
  calculated?: { fact?: { revenue?: number | null; labor?: number | null; cogs?: number | null }; plan?: { revenue?: number | null; labor?: number | null; cogs?: number | null } };
};
type PayrollResponse = { records?: PayrollRecord[] };
type DepartmentTotals = { department: string; hours: number | null; amount: number | null; rows: number; incomplete: boolean };
type PositionPlan = { headcount: string; hoursPerPerson: string; hourlyRate: string };
type PositionPlanMap = Record<string, PositionPlan>;
type CustomPosition = { id: string; department: string; position: string };
type CustomPositionMap = Record<string, CustomPosition>;
const emptyPlan = (): PositionPlan => ({ headcount: '', hoursPerPerson: '', hourlyRate: '' });
const planNumber = (value: string) => value.trim() === '' ? null : n(value.replace(',', '.'));
const positionKey = (department: string, position: string) => department + '::' + position;\nconst CUSTOM_DEPARTMENT_OPTIONS = DEPARTMENT_TEMPLATE.map(dept => dept.name);
function readPositionPlan(key: string): PositionPlanMap {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as PositionPlanMap : {}; } catch { return {}; }
}
const n = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const fmt = (value: number | null, digits = 1) => value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
const money = (value: number | null) => value == null ? 'Нет данных' : formatMoney(value);
const pct = (value: number | null) => value == null ? 'Нет данных' : fmt(value, 1) + ' %';
const ratio = (numerator: number | null, denominator: number | null) => numerator == null || denominator == null || denominator <= 0 ? null : numerator / denominator;
const percent = (numerator: number | null, denominator: number | null) => { const r = ratio(numerator, denominator); return r == null ? null : r * 100; };
const DEPARTMENT_TEMPLATE = [
  { name: 'Управление', description: 'Управление результатом и сменой', positions: ['Управляющий рестораном', 'Заместитель управляющего / операционный менеджер', 'Менеджер смены / администратор'] },
  { name: 'Кухня', description: 'Производство, качество и себестоимость', positions: ['Шеф-повар', 'Су-шеф', 'Повар горячего цеха', 'Повар холодного цеха', 'Повар-заготовщик', 'Повар универсал', 'Кондитер (если есть направление)', 'Посудомойщик кухни'] },
  { name: 'Зал и сервис', description: 'Гостевой опыт и скорость обслуживания', positions: ['Менеджер зала', 'Официант', 'Раннер / помощник официанта', 'Хостес / встречающий гостей', 'Гардеробщик (сезонно / при необходимости)'] },
  { name: 'Бар', description: 'Напитки, списания и барная выручка', positions: ['Шеф-бармен / старший бармен', 'Бармен', 'Бариста (если есть кофейное направление)'] },
  { name: 'Мойка и чистота', description: 'Санитарное состояние и готовность зон', positions: ['Посудомойщик зала', 'Уборщик производственных и гостевых зон'] },
  { name: 'Склад и приёмка', description: 'Приёмка, хранение и движение запасов', positions: ['Кладовщик / товаровед', 'Приёмщик товара (может совмещаться)'] },
] as const;

export default function Team() {
  const [scope] = useScope();
  const { user } = useAuth();
  const planStorageKey = 'sten_fot_plan_v1:' + [user?.organizationId || 'no-org', user?.id || 'no-user', scope.period, scope.projectId || 'all-projects', scope.branchId || 'all-branches', scope.restaurantId || 'all-restaurants', scope.departmentId || 'all-departments'].join(':');
  const [positionPlan, setPositionPlan] = useState<PositionPlanMap>(() => readPositionPlan(planStorageKey));
  const [planLoadedFor, setPlanLoadedFor] = useState(planStorageKey);
  const customStorageKey = 'sten_fot_custom_positions_v1:' + [user?.organizationId || 'no-org', user?.id || 'no-user', scope.projectId || 'all-projects', scope.branchId || 'all-branches', scope.restaurantId || 'all-restaurants', scope.departmentId || 'all-departments'].join(':');
  const [customPositions, setCustomPositions] = useState<CustomPositionMap>(() => {
    try { const value = localStorage.getItem(customStorageKey); return value ? JSON.parse(value) as CustomPositionMap : {}; } catch { return {}; }
  });
  const [customDepartment, setCustomDepartment] = useState<string>(CUSTOM_DEPARTMENT_OPTIONS[0]);
  const [customPositionName, setCustomPositionName] = useState('');
  const [customPositionError, setCustomPositionError] = useState('');
  useEffect(() => {
    try { const value = localStorage.getItem(customStorageKey); setCustomPositions(value ? JSON.parse(value) as CustomPositionMap : {}); }
    catch { setCustomPositions({}); }
  }, [customStorageKey]);
  useEffect(() => {
    try { localStorage.setItem(customStorageKey, JSON.stringify(customPositions)); } catch { /* custom roles remain in memory for this session */ }
  }, [customStorageKey, customPositions]);
  useEffect(() => { const next = readPositionPlan(planStorageKey); setPositionPlan(next); setPlanLoadedFor(planStorageKey); }, [planStorageKey]);
  useEffect(() => { if (planLoadedFor === planStorageKey) { try { localStorage.setItem(planStorageKey, JSON.stringify(positionPlan)); } catch { /* local planning draft remains in memory */ } } }, [planStorageKey, planLoadedFor, positionPlan]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pnlError, setPnlError] = useState('');
  const [scopeUnavailable, setScopeUnavailable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showStructure, setShowStructure] = useState(true);

  async function load() {
    setLoading(true); setError(''); setPnlError(''); setScopeUnavailable(false);
    const query = scopeQuery(scope);
    const [fotResult, pnlResult] = await Promise.allSettled([
      api.get<PayrollResponse>('/fot-analytics?' + query),
      api.get<Pnl>('/api/pnl?' + query),
    ]);
    if (fotResult.status === 'fulfilled') {
      const result = fotResult.value;
      setRecords(Array.isArray(result?.records) ? result.records.filter(row => row.period === scope.period) : []);
      setUpdatedAt(new Date().toISOString());
    } else {
      const e = fotResult.reason;
      if (e instanceof ApiError && (e.code === 'FOT_SCOPE_NOT_IMPLEMENTED' || e.status === 501)) {
        setScopeUnavailable(true);
        setRecords([]);
      } else {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить подтверждённый ФОТ.');
        setRecords([]);
      }
    }
    if (pnlResult.status === 'fulfilled') setPnl(pnlResult.value);
    else { setPnl(null); setPnlError(pnlResult.reason instanceof Error ? pnlResult.reason.message : 'Не удалось загрузить P&L.'); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  const departments = useMemo<DepartmentTotals[]>(() => {
    const map = new Map<string, PayrollRecord[]>();
    for (const row of records) {
      const key = row.department?.trim() || 'Подразделение не указано';
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].map(([department, rows]) => {
      const hours = rows.map(row => n(row.hours));
      const amounts = rows.map(row => n(row.amount));
      const completeHours = hours.every(value => value !== null);
      const completeAmounts = amounts.every(value => value !== null);
      return {
        department,
        hours: completeHours ? hours.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
        amount: completeAmounts ? amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
        rows: rows.length,
        incomplete: !completeHours || !completeAmounts,
      };
    }).sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity));
  }, [records]);

  const totalHours = records.length && records.every(row => n(row.hours) !== null) ? records.reduce((sum, row) => sum + (n(row.hours) ?? 0), 0) : null;
  const totalAmount = records.length && records.every(row => n(row.amount) !== null) ? records.reduce((sum, row) => sum + (n(row.amount) ?? 0), 0) : null;
  const revenue = n(pnl?.calculated?.fact?.revenue);
  const pnlLaborFact = n(pnl?.calculated?.fact?.labor);
  const pnlLaborPlan = n(pnl?.calculated?.plan?.labor);
  const revenuePlan = n(pnl?.calculated?.plan?.revenue);
  const cogs = n(pnl?.calculated?.fact?.cogs);
  const revenuePerHour = ratio(revenue, totalHours);
  const costPerHour = ratio(totalAmount, totalHours);
  const laborPercent = percent(pnlLaborFact ?? totalAmount, revenue);
  const primeCost = percent(cogs == null || (pnlLaborFact ?? totalAmount) == null ? null : cogs + (pnlLaborFact ?? totalAmount)!, revenue);
  const laborGap = pnlLaborFact != null && pnlLaborPlan != null ? pnlLaborFact - pnlLaborPlan : null;
  const forecastLaborPercent = percent(pnlLaborPlan, revenuePlan);
  const hasPayroll = records.length > 0;
  const planRows = useMemo(() => [
    ...DEPARTMENT_TEMPLATE.flatMap(dept => dept.positions.map(position => ({ department: dept.name, position }))),
    ...Object.values(customPositions).map(item => ({ department: item.department, position: item.position })),
  ].map(({ department, position }) => {
    const key = positionKey(department, position);
    const input = positionPlan[key] ?? emptyPlan();
    const headcount = planNumber(input.headcount);
    const hoursPerPerson = planNumber(input.hoursPerPerson);
    const hourlyRate = planNumber(input.hourlyRate);
    const validHeadcount = headcount != null && headcount >= 0 && headcount <= 1000;
    const validHours = hoursPerPerson != null && hoursPerPerson >= 0 && hoursPerPerson <= 744;
    const validRate = hourlyRate != null && hourlyRate >= 0;
    const complete = validHeadcount && validHours && validRate;
    return { key, department, position, input, headcount, hoursPerPerson, hourlyRate, complete, plannedHours: complete ? headcount! * hoursPerPerson! : null, plannedCost: complete ? headcount! * hoursPerPerson! * hourlyRate! : null };
  }), [positionPlan, customPositions]);
  const completePlanRows = planRows.filter(row => row.complete);
  const plannedHours = completePlanRows.length ? completePlanRows.reduce((sum, row) => sum + (row.plannedHours ?? 0), 0) : null;
  const plannedCost = completePlanRows.length ? completePlanRows.reduce((sum, row) => sum + (row.plannedCost ?? 0), 0) : null;
  const headcountRows = planRows.filter(row => row.headcount != null && row.headcount >= 0);
  const plannedHeadcount = headcountRows.length ? headcountRows.reduce((sum, row) => sum + (row.headcount ?? 0), 0) : null;
  const planComplete = completePlanRows.length === planRows.length;
  const hasScope = Boolean(scope.projectId || scope.branchId || scope.restaurantId || scope.departmentId);

  function exportPositionPlan() {
    const escapeCell = (value: string | number | null) => {
      const text = value == null ? '' : String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [
      ['Период', scope.period, 'Контур', scope.restaurantId || scope.branchId || scope.projectId || 'Организация'],
      ['Подразделение', 'Должность', 'Ставки', 'Часов на ставку в месяц', 'Стоимость часа, ₽', 'План часов', 'Прогноз ФОТ, ₽'],
      ...planRows.map(row => [
        row.department, row.position, row.headcount, row.hoursPerPerson, row.hourlyRate,
        row.plannedHours, row.plannedCost,
      ]),
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(value => escapeCell(value)).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sten-shtatny-plan-' + scope.period + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <div className="page analytics-page team-page fot-page">
    <header className="page-head fot-page-head">
      <div>
        <span className="eyebrow"><Users size={12} /> ОПЕРАЦИИ · ФОТ</span>
        <h1>Команда и фонд оплаты труда</h1>
        <p>Штатная структура, экономика рабочего времени и прогноз затрат. Фактические значения — только из подключённых источников.</p>
      </div>
      <div className="fot-head-actions">
        <span className="fot-period">{scope.period}</span>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Обновить</button>
      </div>
    </header>

    <FotScheduleImport period={scope.period} historyScope={[user?.organizationId || 'no-org', user?.id || 'anonymous', scope.projectId || 'all', scope.branchId || 'all', scope.restaurantId || 'all', scope.departmentId || 'all'].join(':')} />

    {(error || pnlError) && <div className="fot-alert" role="alert"><AlertTriangle size={17} /><div><b>{error ? 'Не удалось загрузить ФОТ' : 'Часть аналитики недоступна'}</b><span>{[error, pnlError].filter(Boolean).join(' ')}</span></div></div>}
    {scopeUnavailable && <div className="fot-alert" role="status"><AlertTriangle size={17} /><div><b>ФОТ доступен только на уровне организации</b><span>Сервер пока не фильтрует payroll по выбранному ресторану, филиалу или подразделению. Чтобы не показать чужие данные, показатели ФОТ для этого контура скрыты.</span></div></div>}

    <section className="fot-kpi-grid" aria-label="Ключевые показатели ФОТ">
      <article className="fot-kpi"><span className="fot-kpi-icon"><Wallet size={17} /></span><small>ФОТ, факт</small><strong>{loading ? '…' : scopeUnavailable ? '—' : money(totalAmount)}</strong><span>{hasPayroll ? 'Из payroll-источника' : 'Нет подтверждённых начислений'}</span></article>
      <article className="fot-kpi"><span className="fot-kpi-icon"><CalendarClock size={17} /></span><small>Часы, факт</small><strong>{loading ? '…' : scopeUnavailable ? '—' : fmt(totalHours)}</strong><span>{totalHours == null ? 'Нет полного табеля' : 'Подтверждённые часы за месяц'}</span></article>
      <article className="fot-kpi"><span className="fot-kpi-icon"><BarChart3 size={17} /></span><small>Выручка / час</small><strong>{loading ? '…' : scopeUnavailable ? '—' : money(revenuePerHour)}</strong><span>Выручка P&L ÷ часы ФОТ</span></article>
      <article className="fot-kpi"><span className="fot-kpi-icon"><Wallet size={17} /></span><small>Стоимость часа</small><strong>{loading ? '…' : scopeUnavailable ? '—' : money(costPerHour)}</strong><span>ФОТ из payroll ÷ часы</span></article>
      <article className="fot-kpi"><span className="fot-kpi-icon"><BarChart3 size={17} /></span><small>ФОТ / выручка</small><strong>{loading ? '…' : pct(laborPercent)}</strong><span>Начисления ÷ выручка</span></article>
    </section>

    <section className="fot-section">
      <div className="fot-section-heading"><div><span className="eyebrow">ФАКТИЧЕСКИЕ ДАННЫЕ</span><h2>ФОТ по подразделениям</h2><p>Сумма и часы берутся из payroll_records. Неполные значения не подменяются нулями.</p></div><span className="fot-source-tag">Источник: /fot-analytics</span></div>
      {loading ? <div className="fot-empty">Загружаем данные…</div> : scopeUnavailable ? <div className="fot-empty"><b>Нет данных в выбранном контуре</b><span>Нужна безопасная фильтрация ФОТ по ресторану и подразделению на стороне источника.</span></div> : !hasPayroll ? <div className="fot-empty"><b>Нет подтверждённого ФОТ за {scope.period}</b><span>Загрузите данные payroll или табель. STEN не будет придумывать часы, суммы и численность.</span></div> :
      <div className="fot-table-wrap"><table className="fot-table"><thead><tr><th>Подразделение</th><th>Записей</th><th>Часы за месяц</th><th>ФОТ, ₽</th><th>₽ / час</th></tr></thead><tbody>{departments.map(row => <tr key={row.department}><td><b>{row.department}</b>{row.incomplete && <small>Есть неполные данные</small>}</td><td>{row.rows}</td><td>{fmt(row.hours)}</td><td>{money(row.amount)}</td><td>{money(ratio(row.amount, row.hours))}</td></tr>)}</tbody><tfoot><tr><td>Итого по полученным записям</td><td>{records.length}</td><td>{fmt(totalHours)}</td><td>{money(totalAmount)}</td><td>{money(costPerHour)}</td></tr></tfoot></table></div>}
    </section>

    <section className="fot-section">
      <div className="fot-section-heading"><div><span className="eyebrow">ШТАТНАЯ МОДЕЛЬ</span><h2>Подразделения и должности</h2><p>Стартовый справочник структуры ресторана. Это шаблон для адаптации под формат заведения, а не фактический штат вашей компании.</p></div><button className="secondary-button" onClick={() => setShowStructure(value => !value)}>{showStructure ? 'Свернуть' : 'Показать структуру'}</button></div>
      {showStructure && <div className="fot-department-grid">{DEPARTMENT_TEMPLATE.map(dept => <article className="fot-department-card" key={dept.name}><div className="fot-department-title"><span><ChefHat size={17} /></span><div><h3>{dept.name}</h3><p>{dept.description}</p></div></div><div className="fot-position-list">{dept.positions.map(position => <div className="fot-position" key={position}><span>{position}</span><small>Штат: не задан</small></div>)}</div></article>)}</div>}
      <div className="fot-custom-position-form">
        <div><b>Добавить должность под ваш ресторан</b><p>Пользовательские должности сохраняются в этом браузере и доступны в планировании ниже.</p></div>
        <label>Подразделение<select value={customDepartment} onChange={event => setCustomDepartment(event.target.value)}>{CUSTOM_DEPARTMENT_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Название должности<input value={customPositionName} maxLength={100} onChange={event => { setCustomPositionName(event.target.value); setCustomPositionError(''); }} placeholder="Например, су-шеф ночной смены" /></label>
        <button className="secondary-button" type="button" onClick={() => {
          const name = customPositionName.trim().replace(/\\s+/g, ' ');
          if (!name) { setCustomPositionError('Введите название должности.'); return; }
          const duplicate = [...DEPARTMENT_TEMPLATE.flatMap(dept => dept.positions.map(position => ({ department: dept.name, position }))), ...Object.values(customPositions)].some(item => item.department === customDepartment && item.position.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'));
          if (duplicate) { setCustomPositionError('Такая должность уже есть в выбранном подразделении.'); return; }
          const id = customDepartment + '::custom::' + name.toLocaleLowerCase('ru-RU');
          setCustomPositions(prev => ({ ...prev, [id]: { id, department: customDepartment, position: name } }));
          setCustomPositionName('');
          setCustomPositionError('');
        }}>Добавить должность</button>
        {customPositionError && <span className="fot-custom-position-error" role="alert">{customPositionError}</span>}
      </div>
      <div className="fot-note"><ClipboardList size={16} /><span><b>Численность, ставки и графики пока не подключены.</b> В текущем API нет справочника сотрудников/должностей, штатного расписания и сменного графика. Поэтому количество ставок и плановые часы показаны как незаданные, а не как ноль.</span></div>
    </section>

    <section className="fot-section">
      <div className="fot-section-heading"><div><span className="eyebrow">ПЛАНИРОВАНИЕ ШТАТА</span><h2>Штат, часы и прогноз стоимости</h2><p>Заполните план по должностям. STEN рассчитает штатную численность, месячные часы и прогноз ФОТ только по строкам с тремя введёнными параметрами.</p></div><div className="fot-planner-heading-actions"><span className="fot-source-tag">Локальный сценарий</span><button type="button" className="secondary-button" onClick={exportPositionPlan}><Download size={14} /> Экспорт плана CSV</button></div></div>
      <div className="fot-planner-summary">
        <article><small>Плановая численность, ставки</small><strong>{fmt(plannedHeadcount)}</strong></article>
        <article><small>План часов за месяц</small><strong>{fmt(plannedHours)}</strong></article>
        <article><small>Прогноз ФОТ, ₽</small><strong>{money(plannedCost)}</strong></article>
        <article><small>Заполнено должностей</small><strong>{completePlanRows.length} / {planRows.length}</strong></article>
      </div>
      <div className="fot-note"><ClipboardList size={16} /><span><b>Это плановый сценарий, не фактические данные.</b> Черновик сохраняется локально в этом браузере для текущего пользователя, организации, периода и контура. Он не отправляется на сервер и не синхронизируется с другими устройствами.</span></div>
      <div className="fot-table-wrap">
        <table className="fot-table fot-planner-table"><thead><tr><th>Подразделение / должность</th><th>Ставки</th><th>Часов на ставку / мес.</th><th>Стоимость часа, ₽</th><th>Часы, план</th><th>ФОТ, прогноз</th></tr></thead>
          <tbody>{planRows.map(row => <tr key={row.key}><td><b>{row.position}</b><small>{row.department}</small></td>
            <td><input aria-label={row.position + ': количество ставок'} type="number" min="0" max="1000" step="0.25" value={row.input.headcount} onChange={event => setPositionPlan(prev => ({ ...prev, [row.key]: { ...(prev[row.key] ?? emptyPlan()), headcount: event.target.value } }))} /></td>
            <td><input aria-label={row.position + ': часов на ставку в месяц'} type="number" min="0" max="744" step="1" value={row.input.hoursPerPerson} onChange={event => setPositionPlan(prev => ({ ...prev, [row.key]: { ...(prev[row.key] ?? emptyPlan()), hoursPerPerson: event.target.value } }))} /></td>
            <td><input aria-label={row.position + ': стоимость часа'} type="number" min="0" step="1" value={row.input.hourlyRate} onChange={event => setPositionPlan(prev => ({ ...prev, [row.key]: { ...(prev[row.key] ?? emptyPlan()), hourlyRate: event.target.value } }))} /></td>
            <td>{fmt(row.plannedHours)}</td><td>{money(row.plannedCost)}</td></tr>)}</tbody>
        </table>
      </div>
      {!planComplete && <p className="fot-method-note">Прогноз суммирует только полностью заполненные строки. Пустые должности исключены из сценария и не считаются нулевыми ставками.</p>}
      <div className="fot-planner-actions"><button className="secondary-button" onClick={() => { setPositionPlan({}); }}>Очистить план</button><button className="secondary-button" onClick={() => { setCustomPositions({}); }}>Сбросить пользовательские должности</button></div>
    </section>

    <section className="fot-section">
      <div className="fot-section-heading"><div><span className="eyebrow">ПРОГНОЗ И ОТКЛОНЕНИЯ</span><h2>План / факт и прогноз ФОТ</h2><p>Плановые значения доступны только там, где они уже заданы в P&L. Прогноз часов требует утверждённого графика смен.</p></div><span className="fot-source-tag">Источник: /api/pnl</span></div>
      <div className="fot-forecast-grid">
        <article className="fot-forecast-card"><small>ФОТ по плану P&L</small><strong>{money(pnlLaborPlan)}</strong><span>Плановая сумма за {scope.period}</span></article>
        <article className="fot-forecast-card"><small>Отклонение ФОТ</small><strong className={laborGap == null ? '' : laborGap > 0 ? 'is-negative' : laborGap < 0 ? 'is-positive' : ''}>{money(laborGap)}</strong><span>Факт P&L − план P&L; плюс означает перерасход</span></article>
        <article className="fot-forecast-card"><small>План ФОТ / план выручки</small><strong>{pct(forecastLaborPercent)}</strong><span>Плановый ФОТ ÷ плановая выручка</span></article>
        <article className="fot-forecast-card"><small>Prime Cost, факт</small><strong>{pct(primeCost)}</strong><span>(Себестоимость + ФОТ) ÷ выручка</span></article>
      </div>
      <div className="fot-forecast-missing"><AlertTriangle size={17} /><div><b>Прогноз по часам и численности не рассчитан</b><span>Нет утверждённых ставок, норм часов по должностям, календаря смен и прогноза выручки по дням/частям дня. Для точного прогноза STEN нужны эти источники; подставлять условные 168 часов или предполагаемый штат в финансовый прогноз нельзя.</span></div></div>
      {pnlError && <p className="fot-muted">Показатели план/факт P&L недоступны: {pnlError}</p>}
    </section>

    <section className="fot-section fot-analysis-section">
      <div className="fot-section-heading"><div><span className="eyebrow">УПРАВЛЕНЧЕСКАЯ АНАЛИТИКА</span><h2>Что контролировать руководителю</h2><p>Правила расчёта, без фиктивных оценок и автоматических выводов при недостатке данных.</p></div></div>
      <div className="fot-analysis-grid">
        <article><b>Производительность труда</b><strong>{money(revenuePerHour)}</strong><span>Выручка P&L ÷ подтверждённые часы</span></article>
        <article><b>Стоимость рабочего часа</b><strong>{money(costPerHour)}</strong><span>ФОТ payroll ÷ подтверждённые часы</span></article>
        <article><b>Доля ФОТ в выручке</b><strong>{pct(laborPercent)}</strong><span>ФОТ ÷ выручка; источник суммы отмечен выше</span></article>
        <article><b>Prime Cost</b><strong>{pct(primeCost)}</strong><span>(COGS + Labor) ÷ выручка; требует обеих статей</span></article>
      </div>
      <p className="fot-method-note">Важно: доля ФОТ 25% и ориентиры Prime Cost 60–65% — управленческие ориентиры, а не универсальная норма для каждого формата. Сравнивайте с утверждённым бюджетом, концепцией и историей конкретного ресторана.</p>
    </section>

    <footer className="fot-page-footer">{updatedAt ? 'Последнее получение источников: ' + new Date(updatedAt).toLocaleString('ru-RU') : 'Источники ещё не загружены'} · Контур: {hasScope ? 'выбранный ресторан / подразделение' : 'организация'}</footer>
  </div>;
}
