import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useScope } from '../lib/useScope';
import { scopeQuery } from '../lib/scope';
import { formatDeltaPct, formatMoneyAuto, formatPercent } from '../lib/format';
import { calculateKPISafely, calculateVarianceSignal } from '../lib/financialCalculations';
import MetricCard from '../components/MetricCard';
import AttentionBlock from '../components/AttentionBlock';
import './Dashboard.css';

type PnlRow = { article: string; plan: number | null; fact: number | null; source?: string };
type Calculated = {
  revenue?: number | null; cogs?: number | null; personnel?: number | null; labor?: number | null;
  ebitda?: number | null; primeCostPercent?: number | null; foodCostPercent?: number | null;
  personnelPercent?: number | null; ebitdaMargin?: number | null;
};
type PnlResponse = {
  period?: string;
  rows?: PnlRow[];
  calculated?: { fact?: Calculated; plan?: Calculated };
  summary?: { calculated?: { fact?: Calculated; plan?: Calculated }; fact?: Calculated; plan?: Calculated };
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const getLabor = (calc?: Calculated) => calc?.labor ?? calc?.personnel ?? null;
const getFact = (response: PnlResponse | null) => response?.calculated?.fact ?? response?.summary?.calculated?.fact ?? response?.summary?.fact;
const getPlan = (response: PnlResponse | null) => response?.calculated?.plan ?? response?.summary?.calculated?.plan ?? response?.summary?.plan;
const moneyDeltaPercent = (plan: number | null | undefined, fact: number | null | undefined) =>
  isFiniteNumber(plan) && isFiniteNumber(fact) && plan !== 0 ? ((fact - plan) / Math.abs(plan)) * 100 : null;

export type DeviationItem = { article: string; plan: number | null; fact: number | null; delta: number | null; deltaPct: number | null; severity: 'high' | 'medium' | 'low'; group: 'critical' | 'positive' | 'missing' };
function attentionItems(rows: PnlRow[]): DeviationItem[] {
  return rows.map((row) => {
    if (!isFiniteNumber(row.plan) || !isFiniteNumber(row.fact)) return { article: row.article, plan: row.plan ?? null, fact: row.fact ?? null, delta: null, deltaPct: null, severity: 'low' as const, group: 'missing' as const };
    const delta = row.fact - row.plan;
    const deltaPct = row.plan === 0 ? null : delta / Math.abs(row.plan) * 100;
    const severity = (deltaPct !== null && Math.abs(deltaPct) > 10) || Math.abs(delta) > 100000 ? 'high' as const : (deltaPct !== null && Math.abs(deltaPct) > 5) || Math.abs(delta) > 30000 ? 'medium' as const : 'low' as const;
    const unfavorable = calculateVarianceSignal(row.plan, row.fact) === 'overrun';
    return { article: row.article, plan: row.plan, fact: row.fact, delta, deltaPct, severity, group: unfavorable ? 'critical' as const : 'positive' as const };
  }).filter(item => item.group === 'missing' || item.delta !== 0).sort((a, b) => {
    const order = { critical: 0, missing: 1, positive: 2 };
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return order[a.group] - order[b.group] || severityOrder[a.severity] - severityOrder[b.severity] || Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0);
  });
}

export default function Dashboard() {
  const [scope, setScope] = useScope();
  const [response, setResponse] = useState<PnlResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'unavailable' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [taskMessage, setTaskMessage] = useState('');
  const [creatingTask, setCreatingTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const result = await api.get<PnlResponse>('/api/pnl?' + scopeQuery(scope));
      setResponse(result);
      setState(Array.isArray(result?.rows) && result.rows.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      setResponse(null);
      if (error instanceof ApiError && error.status === 503) {
        setState('unavailable');
        setErrorMessage('Данные временно недоступны.');
      } else {
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить P&L.');
      }
    }
  }, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  useEffect(() => { void load(); }, [load]);

  const fact = getFact(response);
  const plan = getPlan(response);
  const rows = response?.rows ?? [];
  const attention = useMemo(() => attentionItems(rows), [rows]);
  const createDeviationTask = async (item: DeviationItem) => {
    setCreatingTask(item.article); setTaskMessage('');
    try {
      await api.post('/api/secretary/events', { title: 'Разобраться с отклонением по ' + item.article, description: 'Период: ' + scope.period + '. План: ' + (item.plan ?? 'нет данных') + '; факт: ' + (item.fact ?? 'нет данных') + '. Проверьте источник и причину отклонения.', start_at: new Date().toISOString(), event_type: 'task', status: 'planned', reminder_minutes: 30 });
      setTaskMessage('Задача добавлена в план руководителя.');
    } catch (error) { setTaskMessage(error instanceof Error ? error.message : 'Не удалось создать задачу.'); }
    finally { setCreatingTask(null); }
  };
  const revenueDelta = moneyDeltaPercent(plan?.revenue, fact?.revenue);
  const laborFact = getLabor(fact);
  const laborPlan = getLabor(plan);
  const laborDelta = moneyDeltaPercent(laborPlan, laborFact);
  const foodCost = isFiniteNumber(fact?.foodCostPercent)
    ? Math.abs(fact.foodCostPercent)
    : calculateKPISafely(fact?.cogs, fact?.revenue);
  const cogsPercent = calculateKPISafely(fact?.cogs, fact?.revenue);
  const laborPercent = isFiniteNumber(fact?.personnelPercent)
    ? Math.abs(fact.personnelPercent)
    : calculateKPISafely(laborFact, fact?.revenue);
  const primeCost = isFiniteNumber(fact?.primeCostPercent)
    ? Math.abs(fact.primeCostPercent)
    : cogsPercent !== null && laborPercent !== null ? cogsPercent + laborPercent : null;
  const formatKpiOrMissing = (value: number | null) => value === null ? 'Нет данных' : formatPercent(value);
  const ebitdaMargin = fact?.ebitdaMargin ?? (
    isFiniteNumber(fact?.ebitda) && isFiniteNumber(fact?.revenue) && fact.revenue > 0
      ? fact.ebitda / fact.revenue * 100 : null
  );

  const monthName = new Date((scope.period || '2000-01') + '-01T00:00:00').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return (
    <div className="page director-dashboard">
      <header className="director-topbar">
        <h1>Сводка</h1>
        <div className="director-topbar__controls">
          <label className="director-period">
            <span className="sr-only">Период</span>
            <input aria-label="Период" type="month" value={scope.period} onChange={(event) => setScope({ ...scope, period: event.target.value })} />
          </label>
        </div>
      </header>

      {state === 'loading' && <div className="director-state" aria-live="polite">Загружаем данные за {monthLabel}…</div>}

      {(state === 'unavailable' || state === 'error') && (
        <section className="director-state director-state--error" role="alert">
          <p>{state === 'unavailable' ? 'Данные временно недоступны' : errorMessage || 'Не удалось загрузить P&L.'}</p>
          {state === 'unavailable' && <p className="director-state__detail">Сервис данных временно недоступен. Попробуйте ещё раз.</p>}
          <button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={15} /> Повторить</button>
        </section>
      )}

      {state === 'empty' && (
        <section className="director-state director-state--empty">
          <AlertTriangle size={20} aria-hidden="true" />
          <div><h2>Нет данных за {monthLabel}</h2><p>Загрузите P&amp;L или отчёт смены. STEN не подставляет демонстрационные значения.</p></div>
          <Link className="secondary-button" to="/pnl">Открыть P&amp;L</Link>
        </section>
      )}

      {state === 'ready' && (
        <div className="director-dashboard__content">
          <AttentionBlock items={attention} period={scope.period} onCreateTask={item => void createDeviationTask(item)} creatingTask={creatingTask} />
          {taskMessage && <p className="director-state" role="status">{taskMessage}</p>}
          <section className="director-metrics" aria-label="Ключевые метрики">
            <MetricCard label="ВЫРУЧКА" value={formatMoneyAuto(fact?.revenue)} detail={'План ' + formatMoneyAuto(plan?.revenue)} delta={formatDeltaPct(plan?.revenue, fact?.revenue)} deltaTone={revenueDelta === null ? 'neutral' : revenueDelta >= 0 ? 'success' : 'danger'} />
            <MetricCard label="PRIME COST" value={formatKpiOrMissing(primeCost)} detail={`Food Cost ${formatKpiOrMissing(foodCost)} · Labor Cost ${formatKpiOrMissing(laborPercent)}`} />
            <MetricCard label="ФОТ" value={formatMoneyAuto(laborFact)} detail={'План ' + formatMoneyAuto(laborPlan)} delta={formatDeltaPct(laborPlan, laborFact)} deltaTone={laborDelta === null ? 'neutral' : laborDelta <= 0 ? 'success' : 'danger'} />
            <MetricCard label="EBITDA" value={formatMoneyAuto(fact?.ebitda)} detail={ebitdaMargin === null ? 'Маржа —' : 'Маржа ' + formatPercent(ebitdaMargin)} delta={formatDeltaPct(plan?.ebitda, fact?.ebitda)} deltaTone={fact?.ebitda == null || plan?.ebitda == null ? 'neutral' : fact.ebitda >= plan.ebitda ? 'success' : 'danger'} />
          </section>
        </div>
      )}
    </div>
  );
}
