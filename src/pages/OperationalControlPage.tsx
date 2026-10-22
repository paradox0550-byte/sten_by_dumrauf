import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, Plus, RefreshCw, Save, X } from 'lucide-react';
import { api } from '../lib/api';
import { useScope } from '../lib/useScope';
import { scopeQuery } from '../lib/scope';
import { ReportWriteSchema, type ReportWrite } from '../lib/contracts/reports';
import { PnlTransactionSchema, type PnlTransactionRequest } from '../lib/contracts/pnl';
import FlashIncomeInput from '../components/FlashIncomeInput';
import './OperationalControlPage.css';

type Calc = {
  revenue: number | null; cogs: number | null; labor: number | null;
  personnel: number | null; overtime: number | null;
  primeCostPercent: number | null; foodCostPercent: number | null;
  personnelPercent: number | null; ebitda: number | null;
};
type Report = { date: string; values?: Record<string, number | null>; calculated?: Calc };
type ReportsResponse = { reports: Report[] };
type PnlRow = { article?: string; label?: string; name?: string; fact?: number | null; transaction_total?: number | null; transaction_count?: number | null };
type PnlResponse = { rows?: PnlRow[]; calculated?: { fact?: { revenue?: number | null; cogs?: number | null; labor?: number | null; personnel?: number | null; foodCostPercent?: number | null; personnelPercent?: number | null; primeCostPercent?: number | null } }; summary?: { calculated?: { fact?: { revenue?: number | null; cogs?: number | null; labor?: number | null; personnel?: number | null; foodCostPercent?: number | null; personnelPercent?: number | null; primeCostPercent?: number | null } } } };

const FIELDS = [
  { key: 'revenue', label: 'Выручка, ₽', placeholder: 'Фактическая выручка' },
  { key: 'checks', label: 'Чеков, шт.', placeholder: 'Количество чеков' },
  { key: 'guests', label: 'Гостей, чел.', placeholder: 'Количество гостей' },
  { key: 'cash', label: 'Наличные, ₽', placeholder: 'Сумма наличных' },
  { key: 'card', label: 'Карта, ₽', placeholder: 'Сумма по карте' },
  { key: 'discounts', label: 'Скидки, ₽', placeholder: 'Сумма скидок' },
] as const;
const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const fmt = (v: number | null, p = false) => v === null ? '—' : (p ? v.toFixed(1).replace('.', ',') + ' %' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v));
const localDate = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const articleName = (r: PnlRow) => String(r.article || r.label || r.name || '').trim();

export default function OperationalControlPage() {
  const [date, setDate] = useState(localDate);
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [scope] = useScope();
  const [pnl, setPnl] = useState<PnlResponse | null>(null);
  const [pnlError, setPnlError] = useState('');
  const [txOpen, setTxOpen] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [txDate, setTxDate] = useState(localDate);
  const [txArticle, setTxArticle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txComment, setTxComment] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  async function load() {
    setLoading(true); setError(''); setMessage(''); setPnlError('');
    const q = new URLSearchParams({ date, ...Object.fromEntries(new URLSearchParams(scopeQuery(scope))) });
    try {
      const [reports, pnlData] = await Promise.all([
        api.get<ReportsResponse>('/reports?' + q.toString()),
        api.get<PnlResponse>('/api/pnl?' + scopeQuery({ ...scope, period: date.slice(0, 7) })).catch((e: unknown) => { setPnlError(e instanceof Error ? e.message : 'Не удалось загрузить финансовые данные.'); return null; }),
      ]);
      const found = reports.reports?.find(item => item.date === date) ?? null;
      setR(found);
      setPnl(pnlData);
      const next: Record<string, string> = {};
      for (const f of FIELDS) { const v = found?.values?.[f.key]; next[f.key] = v == null ? '' : String(v); }
      setForm(next);
      setEditing(!found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные дня.');
      setR(null); setPnl(null); setEditing(true);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [date, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  const articles = useMemo(() => {
    const seen = new Set<string>();
    return (pnl?.rows ?? []).map(articleName).filter(name => {
      const key = name.toLocaleLowerCase('ru-RU');
      if (!name || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [pnl]);
  const fact = pnl?.calculated?.fact ?? pnl?.summary?.calculated?.fact;
  const values = r?.values ?? {};
  const calc = r?.calculated;
  const revenue = n(values.revenue) ?? n(fact?.revenue);
  const cogs = n(fact?.cogs);
  const labor = n(fact?.labor) ?? n(fact?.personnel);
  const foodCost = n(calc?.foodCostPercent) ?? n(fact?.foodCostPercent) ?? (cogs !== null && revenue !== null && revenue > 0 ? cogs / revenue * 100 : null);
  const laborPercent = n(calc?.personnelPercent) ?? n(fact?.personnelPercent) ?? (labor !== null && revenue !== null && revenue > 0 ? labor / revenue * 100 : null);
  const prime = n(calc?.primeCostPercent) ?? n(fact?.primeCostPercent) ?? (foodCost !== null && laborPercent !== null ? foodCost + laborPercent : null);
  const checks = n(values.checks);
  const avgCheck = checks !== null && checks > 0 && revenue !== null ? revenue / checks : null;
  const cash = n(values.cash), card = n(values.card);
  const cashBalance = cash !== null && card !== null && n(values.revenue) !== null ? cash + card - n(values.revenue)! : null;
  const missingFields = FIELDS.filter(field => n(values[field.key]) === null);
  const dataStatus = error && !r ? 'ошибка' : !r ? 'нет данных' : missingFields.length ? 'частичные' : 'полные';
  const periodLabel = /^\d{4}-\d{2}$/.test(scope.period)
    ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(Number(scope.period.slice(0, 4)), Number(scope.period.slice(5, 7)) - 1, 1))
    : scope.period;
  const selectedScope = [scope.projectId && `Проект ${scope.projectId}`, scope.branchId && `Филиал ${scope.branchId}`, scope.restaurantId && `Ресторан ${scope.restaurantId}`, scope.departmentId && `Отдел ${scope.departmentId}`].filter(Boolean).join(' · ');
  const attentionSignals = [
    ...(error && !r ? [`Не удалось загрузить данные: ${error}`] : !error && missingFields.length ? [`Не заполнены поля отчёта: ${missingFields.map(field => field.label.split(',')[0]).join(', ')}.`] : []),
    ...(pnlError ? [`P&L недоступен: ${pnlError}`] : []),
    ...(!pnlError && prime !== null && prime > 65 ? ['Prime Cost выше ориентира 65%. Проверьте себестоимость и трудозатраты.'] : !pnlError && prime !== null && prime > 60 ? ['Prime Cost выше ориентира 60% и требует внимания.'] : []),
  ];

  async function saveReport() {
    setSaving(true); setError(''); setMessage('');
    try {
      const valuesToSave: Record<string, number> = {};
      for (const f of FIELDS) {
        const raw = String(form[f.key] ?? '').trim().replace(/\s/g, '').replace(',', '.');
        if (!raw) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) throw new Error(f.label + ' — укажите корректное неотрицательное значение.');
        valuesToSave[f.key] = value;
      }
      if (!Object.keys(valuesToSave).length) throw new Error('Заполните хотя бы одно поле.');
      const body: ReportWrite = { date, values: valuesToSave, project_id: scope.projectId ?? null, branch_id: scope.branchId ?? null, restaurant_id: scope.restaurantId ?? null, department_id: scope.departmentId ?? null };
      const result = await api.post<{ saved?: boolean; date?: string }>('/reports', ReportWriteSchema.parse(body));
      if (result?.saved === false) throw new Error('Сервер не подтвердил сохранение.');
      await load();
      setMessage('Данные дня отправлены и повторно загружены.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить данные дня.'); }
    finally { setSaving(false); }
  }

  async function saveTransaction() {
    const amount = Number(txAmount.trim().replace(/\s/g, '').replace(',', '.'));
    if (!txArticle || !Number.isFinite(amount) || amount <= 0) { setError('Выберите статью и укажите сумму больше нуля.'); return; }
    if (txDate.slice(0, 7) !== date.slice(0, 7)) { setError('Дата операции должна относиться к выбранному месяцу.'); return; }
    setTxSaving(true); setError(''); setMessage('');
    try {
      const body: PnlTransactionRequest = { period: date.slice(0, 7), date: txDate, type: txType, article: txArticle, amount, comment: txComment.trim() || null, project_id: scope.projectId ?? '', branch_id: scope.branchId ?? '', restaurant_id: scope.restaurantId ?? '', department_id: scope.departmentId ?? '' };
      await api.post('/api/pnl/transactions', PnlTransactionSchema.parse(body));
      setTxOpen(false); setTxAmount(''); setTxComment('');
      await load();
      setMessage((txType === 'income' ? 'Доход' : 'Расход') + ' отправлен. P&L обновлён из источника.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить финансовую операцию.'); }
    finally { setTxSaving(false); }
  }

  return (
    <div className="page flash-page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><Activity size={12} /> ЕЖЕДНЕВНОЕ УПРАВЛЕНИЕ</span>
          <h1>Мой день</h1>
          <p>Факты дня, доходы и расходы, ранние сигналы и контроль экономики ресторана.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Обновить</button>
        </div>
      </div>

      <section className="panel operational-control-toolbar">
        <div className="operational-scope-context">
          <strong>{scope.period === 'day' ? `Дата: ${date}` : `Выбран период: ${periodLabel}`}</strong>
          <span>{selectedScope || 'Область учёта не выбрана'}</span>
        </div>
        {scope.period !== 'day' && <div className="operational-period-warning" role="note">Выбран период: {periodLabel}. В этом экране отчёт дня загружается по дате {date}; подтверждённый агрегат за весь период текущим API-потоком не формируется.</div>}
        <label className="settings-field operational-control-date"><span>Дата дня / смены</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <div className="operational-day-actions">
          <button className="secondary-button" onClick={() => { setTxDate(date); setTxType('income'); setTxArticle(articles[0] ?? ''); setTxOpen(true); }}><Plus size={15} /> Доход</button>
          <button className="secondary-button" onClick={() => { setTxDate(date); setTxType('expense'); setTxArticle(articles[0] ?? ''); setTxOpen(true); }}><CircleDollarSign size={15} /> Расход</button>
          <details className="operational-control-import"><summary>Ввод из сообщения</summary><FlashIncomeInput period={date.slice(0, 7)} scope={{ ...scope, period: date.slice(0, 7) }} onSaved={() => void load()} /></details>
        </div>
      </section>

      {error && <div className="import-result warn" role="alert">{error}</div>}
      {message && <div className="pnl-message ok" role="status"><CheckCircle2 size={15} /> {message}</div>}

      <section className="operational-day-overview panel" aria-labelledby="operational-day-overview-title">
        <div className="operational-overview-heading">
          <div><span className="eyebrow"><CalendarDays size={12} /> КАРТИНА ДНЯ</span><h2 id="operational-day-overview-title">{scope.period === 'day' ? `Дата: ${date}` : periodLabel}</h2></div>
          <span className={`operational-data-status operational-data-status--${dataStatus === 'полные' ? 'complete' : dataStatus === 'частичные' ? 'partial' : dataStatus === 'ошибка' ? 'error' : 'empty'}`}>{loading ? 'Загрузка…' : dataStatus}</span>
        </div>
        {error && !r ? <p className="operational-missing-fields operational-load-error" role="alert">Не удалось загрузить данные: {error}</p> : <p className="operational-missing-fields" aria-live="polite">{!r ? 'Нет данных за выбранный период' : missingFields.length === 0 ? 'Все поля заполнены' : `Нет данных: ${missingFields.map(field => field.label.split(',')[0]).join(', ')}`}</p>}
        {pnlError && <div className="operational-pnl-error" role="alert"><AlertTriangle size={16} /><div><strong>P&L недоступен</strong><p>{pnlError}</p><a href="#/pnl">Открыть P&L</a></div></div>}
        <div className="operational-overview-metrics">
          {[
            ['Выручка', n(values.revenue), false], ['Чеков', n(values.checks), false], ['Гостей', n(values.guests), false],
            ['Наличные', n(values.cash), false], ['Карта', n(values.card), false], ['Скидки', n(values.discounts), false],
            ['Средний чек', avgCheck, false], ['Food Cost', pnlError ? null : foodCost, true], ['Labor Cost', pnlError ? null : laborPercent, true], ['Prime Cost', pnlError ? null : prime, true],
            ['Баланс наличные + карта − выручка', cashBalance, false],
          ].map(([label, value, percent]) => <article className="operational-overview-metric" key={String(label)}>
            <span>{String(label)}</span><strong>{fmt(typeof value === 'number' ? value : null, Boolean(percent))}{['Выручка', 'Наличные', 'Карта', 'Скидки', 'Средний чек', 'Баланс наличные + карта − выручка'].includes(String(label)) && typeof value === 'number' ? ' ₽' : ''}</strong>
            {!pnlError && value === null && ['Food Cost', 'Labor Cost', 'Prime Cost'].includes(String(label)) && <small>Нет данных в P&amp;L</small>}
          </article>)}
        </div>
        <div className="operational-attention">
          <div className="operational-attention-title"><AlertTriangle size={15} /><strong>Требует внимания</strong></div>
          {loading ? <p>Загружаем данные дня…</p> : attentionSignals.length === 0 ? <p>Нет замечаний</p> : <ul>{attentionSignals.map((signal, index) => <li key={signal}>
            <span>{signal}</span>
            {index === 0 && missingFields.length > 0 && <button type="button" className="operational-inline-action" onClick={() => setEditing(true)}>Заполнить данные</button>}
            {signal.startsWith('P&L недоступен:') && <a className="operational-inline-action" href="#/pnl">Открыть P&L</a>}
            {signal.startsWith('Prime Cost') && <a className="operational-inline-action" href="#/pnl">Проверить в P&L</a>}
          </li>)}</ul>}
        </div>
      </section>

      {txOpen && <section className="panel operational-transaction-panel">
        <div className="panel-title"><CircleDollarSign size={16} /> Новая финансовая операция</div>
        <div className="flash-form">
          <label className="settings-field"><span>Тип операции</span><select value={txType} onChange={e => setTxType(e.target.value as 'income' | 'expense')}><option value="income">Доход</option><option value="expense">Расход</option></select></label>
          <label className="settings-field"><span>Дата</span><input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} /></label>
          <label className="settings-field"><span>Статья P&L</span><select value={txArticle} onChange={e => setTxArticle(e.target.value)}><option value="">Выберите статью</option>{articles.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="settings-field"><span>Сумма, ₽</span><input type="text" inputMode="decimal" placeholder="0,00" value={txAmount} onChange={e => setTxAmount(e.target.value)} /></label>
          <label className="settings-field operational-transaction-comment"><span>Комментарий (необязательно)</span><input value={txComment} maxLength={2000} onChange={e => setTxComment(e.target.value)} placeholder="Основание или пояснение" /></label>
        </div>
        {!articles.length && <p className="import-result warn">Статьи P&L не загружены. Сначала проверьте период и доступность финансовых данных; свободный текст вместо статьи не принимается.</p>}
        <div className="quick-actions">
          <button className="secondary-button" onClick={() => setTxOpen(false)} disabled={txSaving}><X size={15} /> Отмена</button>
          <button className="primary-button" onClick={() => void saveTransaction()} disabled={txSaving || !articles.length}><Save size={15} /> {txSaving ? 'Сохраняем…' : 'Сохранить операцию'}</button>
        </div>
        <p className="operational-hint">Операция попадёт в P&L выбранного месяца. Не добавляйте повторно факт, который уже внесён вручную или импортирован.</p>
      </section>}

      <section className="operational-day-section">
        <div className="operational-section-heading"><div><span className="eyebrow"><CalendarDays size={12} /> ЕЖЕДНЕВНЫЕ ФАКТЫ</span><h2>Отчёт дня / смены</h2></div><span className="operational-day-date">{date}</span></div>
        {loading ? <div className="panel empty">Загрузка данных дня…</div> : editing ? <section className="panel">
          <div className="panel-title">{r ? 'Редактирование отчёта' : 'Новый отчёт'} · {date}</div>
          <div className="flash-form">{FIELDS.map(f => <label className="settings-field" key={f.key}><span>{f.label}</span><input type="text" inputMode="decimal" placeholder={f.placeholder} value={form[f.key] ?? ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} /></label>)}</div>
          <div className="quick-actions">
            {r && <button className="secondary-button" onClick={() => setEditing(false)} disabled={saving}><X size={15} /> Отмена</button>}
            <button className="primary-button" disabled={saving} onClick={() => void saveReport()}><Save size={15} /> {saving ? 'Сохраняем…' : 'Сохранить отчёт дня'}</button>
          </div>
        </section> : <section className="operational-day-summary">
          <div className="operational-summary-head"><div><strong>Факты за день</strong><span>Источник: отчёт смены</span></div><button className="secondary-button" onClick={() => setEditing(true)}>Изменить</button></div>
          <div className="metric-grid">{FIELDS.map(f => <article className="metric-card" key={f.key}><span>{f.label}</span><strong>{fmt(n(values[f.key]))}</strong></article>)}</div>
        </section>}
      </section>

    </div>
  );
}
