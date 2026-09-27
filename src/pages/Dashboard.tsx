import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Clock3, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useScope } from '../lib/useScope';
import { hasScopeId, scopeQuery } from '../lib/scope';
import { formatDeltaPct, formatMoneyAuto } from '../lib/format';

type Row = { article: string; plan: number | null; fact: number | null; source?: string };
type Calc = { revenue: number | null; cogs: number | null; personnel: number | null; overtime: number | null; labor: number | null; operatingExpenses: number | null; ebitda: number | null; primeCostPercent: number | null; primeCostStatus: string; foodCostPercent: number | null; personnelPercent: number | null; opexPercent: number | null; ebitdaMargin: number | null };
type PnlResp = { period: string; rows: Row[]; calculated?: { fact: Calc; plan: Calc } };
type Labor = { period: string; department: string; hours: number; amount: number };

const monthOf = (p: string, d: number) => { const [y, m] = p.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const monthLabel = (p: string) => new Date(p + '-01T00:00:00').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const money = (v: number | null | undefined) => finite(v) ? v : null;

export default function Dashboard() {
  const [scope] = useScope();
  const [current, setCurrent] = useState<PnlResp | null>(null);
  const [trend, setTrend] = useState<{ period: string; revenue: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = (p: string) => scopeQuery({ ...scope, period: p });
      const [cur, prev1, prev2] = await Promise.all([
        api.get<PnlResp>('/api/pnl?' + q(scope.period)),
        api.get<PnlResp>('/api/pnl?' + q(monthOf(scope.period, -1))).catch(() => null),
        api.get<PnlResp>('/api/pnl?' + q(monthOf(scope.period, -2))).catch(() => null)
      ]);
      setCurrent(cur);
      const readRevenue = (x: PnlResp | null) => x?.calculated?.fact?.revenue ?? null;
      setTrend([prev2, prev1, cur].map((x, i) => ({ period: monthOf(scope.period, i - 2), revenue: readRevenue(x) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки данных.');
      setCurrent(null); setTrend([]);
    } finally { setLoading(false); }
  }, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  useEffect(() => { void load(); }, [load]);

  const fact = current?.calculated?.fact;
  const plan = current?.calculated?.plan;
  const prime = fact?.primeCostPercent ?? null;
  const primePlan = plan?.primeCostPercent ?? null;
  const devPrime = prime !== null && primePlan !== null ? prime - primePlan : null;
  const rows = current?.rows ?? [];

  const metrics: [string, number | null, number | null][] = [
    ['Выручка', fact?.revenue ?? null, plan?.revenue ?? null],
    ['Себестоимость', fact?.cogs ?? null, plan?.cogs ?? null],
    ['ФОТ', fact?.labor ?? null, plan?.labor ?? null],
    ['EBITDA', fact?.ebitda ?? null, plan?.ebitda ?? null]
  ];

  const day = useMemo(() => {
    const revenueGap = fact?.revenue != null && plan?.revenue != null ? fact.revenue - plan.revenue : null;
    const laborGap = fact?.labor != null && plan?.labor != null ? fact.labor - plan.labor : null;
    const cogsGap = fact?.cogs != null && plan?.cogs != null ? fact.cogs - plan.cogs : null;
    const ebitdaGap = fact?.ebitda != null && plan?.ebitda != null ? fact.ebitda - plan.ebitda : null;
    const actions: { title: string; detail: string; href?: string }[] = [];
    if (cogsGap != null && cogsGap > 0) actions.push({ title: 'Проверить COGS', detail: 'Себестоимость выше плана на ' + formatMoneyAuto(cogsGap), href: '/pnl' });
    if (laborGap != null && laborGap > 0) actions.push({ title: 'Разобрать ФОТ', detail: 'ФОТ выше плана на ' + formatMoneyAuto(laborGap), href: '/team' });
    if (fact?.overtime != null && fact.overtime > 0) actions.push({ title: 'Проверить переработки', detail: formatMoneyAuto(fact.overtime) + ' ₽ в Labor Cost', href: '/team' });
    if (revenueGap != null && revenueGap < 0) actions.push({ title: 'Разобрать недобор выручки', detail: 'Факт ниже плана на ' + formatMoneyAuto(Math.abs(revenueGap)), href: '/analytics' });
    if (!actions.length) actions.push({ title: 'Контроль периода', detail: 'По доступным данным новых действий не сформировано.' });
    return { revenueGap, laborGap, cogsGap, ebitdaGap, actions };
  }, [fact, plan]);

  const createSecretaryTask = async (title: string, detail: string) => {
    setActionBusy(true);
    try {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      await api.post('/api/secretary/events', { title, description: detail, start_at: start.toISOString(), event_type: 'task', status: 'planned', reminder_minutes: 30 });
      alert('Задача добавлена в Секретарь.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать задачу.'); }
    finally { setActionBusy(false); }
  };

  const max = Math.max(...trend.map(x => x.revenue ?? 0), 1);
  const status = prime === null ? 'Нет данных' : prime <= 60 ? 'Ниже 60%' : prime <= 65 ? '60–65%' : 'Выше 65%';

  return (
    <div className="page">
      <div className="page-head">
        <div><span className="eyebrow"><Activity size={12} /> РУКОВОДИТЕЛЬ · МОЙ ДЕНЬ</span><h1>Мой день</h1><p>Один экран: что произошло, где отклонение и какое действие логично сделать первым.</p></div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Обновить</button>
      </div>
      {!hasScopeId(scope) && <div className="import-result warn">Выберите проект, филиал, ресторан или подразделение в Настройках → Рабочий контур.</div>}
      {error && <div className="error">{error}</div>}
      {loading ? <div className="panel empty">Собираем рабочий день…</div> : !rows.length ? <div className="panel empty-state"><b>Нет данных за выбранный период</b><span>Загрузите P&L или введите подтверждённые данные. STEN не создаёт синтетический факт.</span></div> : <>
        <section className="analytics-summary"><div><span className="eyebrow">ЧТО ПРОИЗОШЛО</span><p>Выручка {formatMoneyAuto(fact?.revenue)} · EBITDA {formatMoneyAuto(fact?.ebitda)} · Prime Cost {prime == null ? '—' : prime.toFixed(1).replace('.', ',') + ' %'}</p></div><div className="analytics-summary-delta"><small>План / факт</small><strong>{formatMoneyAuto(fact?.revenue)}</strong><span>{formatMoneyAuto(plan?.revenue)} · Δ {day.revenueGap == null ? '—' : formatMoneyAuto(day.revenueGap)}</span></div></section>
        <section className="analytics-kpi-strip">{metrics.map(([label, fv, pv]) => <article key={label}><small>{label}</small><strong>{formatMoneyAuto(fv)}</strong><span>План {formatMoneyAuto(pv)}</span></article>)}<article><small>Prime Cost</small><strong>{prime == null ? '—' : prime.toFixed(1).replace('.', ',') + ' %'}</strong><span>{status}</span></article></section>
        <div className="two-col dashboard-columns">
          <section className="panel"><div className="panel-title"><AlertTriangle size={16}/> ПОЧЕМУ</div>
            <div className="analytics-report-table"><div className="analytics-report-head"><span>Драйвер</span><span>Факт</span><span>План</span><span>Δ</span></div>
              <div><b>Выручка</b><span>{formatMoneyAuto(fact?.revenue)}</span><span>{formatMoneyAuto(plan?.revenue)}</span><strong>{formatMoneyAuto(day.revenueGap)}</strong></div>
              <div><b>COGS</b><span>{formatMoneyAuto(fact?.cogs)}</span><span>{formatMoneyAuto(plan?.cogs)}</span><strong>{formatMoneyAuto(day.cogsGap)}</strong></div>
              <div><b>ФОТ</b><span>{formatMoneyAuto(fact?.labor)}</span><span>{formatMoneyAuto(plan?.labor)}</span><strong>{formatMoneyAuto(day.laborGap)}</strong></div>
              <div><b>EBITDA</b><span>{formatMoneyAuto(fact?.ebitda)}</span><span>{formatMoneyAuto(plan?.ebitda)}</span><strong>{formatMoneyAuto(day.ebitdaGap)}</strong></div>
            </div>
            <p className="dashboard-note"><BarChart3 size={14}/> Положительное отклонение COGS/ФОТ означает дополнительные расходы; положительное отклонение выручки — дополнительную выручку. Это объяснение по фактам, а не оценка.</p>
          </section>
          <section className="panel"><div className="panel-title"><CheckCircle2 size={16}/> ЧТО ДЕЛАТЬ</div>
            {day.actions.map((a, i) => <div className="secretary-event" key={a.title}><div className="secretary-date"><b>{String(i + 1).padStart(2, '0')}</b><small>действие</small></div><div className="secretary-main"><strong>{a.title}</strong><span>{a.detail}</span></div>{a.href ? <button className="secondary-button" onClick={() => window.location.assign(a.href!)}>Открыть</button> : <button className="secondary-button" disabled={actionBusy} onClick={() => void createSecretaryTask(a.title, a.detail)}>В Секретарь</button>}</div>)}
            {day.actions.some(a => !a.href) && <button className="primary-button wide" disabled={actionBusy} onClick={() => { const a = day.actions.find(x => !x.href); if (a) void createSecretaryTask(a.title, a.detail); }}><Clock3 size={15}/> Поставить контроль в Секретарь</button>}
          </section>
        </div>
        <section className="panel"><div className="panel-title"><TrendingUp size={16}/> Динамика выручки за 3 месяца</div>{trend.map(t => <div className="chart-row" key={t.period}><div className="chart-label"><b>{monthLabel(t.period)}</b><small>{t.revenue === null ? '—' : formatMoneyAuto(t.revenue)}</small></div><div className="bar-track">{t.revenue !== null && <svg viewBox="0 0 100 4" preserveAspectRatio="none"><rect x="0" y="0" width={Math.max(2, (t.revenue / max) * 100)} height="4" /></svg>}</div></div>)}</section>
        <section className="analytics-gap-section"><div className="analytics-gap-head"><div><span className="eyebrow">КОНТРОЛЬ</span><h2>Следующий цикл</h2></div></div><div className="analytics-gap-list"><span>Проверить действие</span><span>Зафиксировать результат</span><span>Сравнить с планом</span><span>Повторить цикл</span></div><p>STEN закрывает первый управленческий контур: факт → отклонение → действие. Эффект будет сравниваться после появления подтверждённых следующих периодов.</p></section>
      </>}
    </div>
  );
}
