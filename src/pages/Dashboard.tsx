import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';

import { useScope } from '../lib/useScope';
import { hasScopeId } from '../lib/scope';
import { formatDeltaPct, formatMoneyAuto } from '../lib/format';

type Row = { article: string; plan: number | null; fact: number | null; source?: string };
type Calc = {
  revenue: number | null; cogs: number | null; personnel: number | null;
  overtime: number | null; labor: number | null; operatingExpenses: number | null;
  ebitda: number | null; primeCostPercent: number | null; primeCostStatus: string;
  foodCostPercent: number | null; personnelPercent: number | null; opexPercent: number | null; ebitdaMargin: number | null;
};
type PnlResp = { period: string; rows: Row[]; calculated?: { fact: Calc; plan: Calc } };

const monthOf = (p: string, d: number) => {
  const [y, m] = p.split('-').map(Number);
  const x = new Date(y, m - 1 + d, 1);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
};
const monthLabel = (p: string) => new Date(p + '-01T00:00:00').toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
const money = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) ? v : null;

export default function Dashboard() {
  const [scope, setScope] = useScope();
  const [current, setCurrent] = useState<PnlResp | null>(null);
  const [trend, setTrend] = useState<{ period: string; revenue: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = (p: string) => 'period=' + p + 
        (scope.projectId ? '&project_id=' + encodeURIComponent(scope.projectId) : '') +
        (scope.branchId ? '&branch_id=' + encodeURIComponent(scope.branchId) : '') +
        (scope.restaurantId ? '&restaurant_id=' + encodeURIComponent(scope.restaurantId) : '') +
        (scope.departmentId ? '&department_id=' + encodeURIComponent(scope.departmentId) : '');
      
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
    } finally {
      setLoading(false);
    }
  }, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  useEffect(() => { void load(); }, [load]);

  const fact = current?.calculated?.fact;
  const plan = current?.calculated?.plan;
  const prime = fact?.primeCostPercent ?? null;
  const primePlan = plan?.primeCostPercent ?? null;
  const devPrime = prime !== null && primePlan !== null ? prime - primePlan : null;
  
  const status = prime === null ? 'Нет данных' : prime <= 60 ? 'Норма' : prime <= 65 ? 'Внимание' : 'Критично';
  const rows = current?.rows ?? [];
  
  const find = (key: string, field: 'fact' | 'plan') => {
    const row = rows.find(item => item.article.toLocaleLowerCase('ru-RU').includes(key));
    return row ? money(row[field]) : null;
  };

  const metrics: [string, number | null, number | null][] = [
    ['Выручка', fact?.revenue ?? null, plan?.revenue ?? null],
    ['Себестоимость', fact?.cogs ?? null, plan?.cogs ?? null],
    ['ФОТ (Labor)', fact?.labor ?? null, plan?.labor ?? null],
    ['EBITDA', fact?.ebitda ?? null, plan?.ebitda ?? null]
  ];

  const max = Math.max(...trend.map(x => x.revenue ?? 0), 1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><Activity size={12} /> HOReCa — EXECUTIVE VIEW</span>
          <h1>Дашборд</h1>
          <p>Prime Cost и операционные показатели. Выберите scope для фильтрации данных.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> Обновить
        </button>
      </div>
      
      
      
      {!hasScopeId(scope) && (
        <div className="import-result warn">Выберите ресторан или филиал, чтобы увидеть корректные данные.</div>
      )}
      {error && <div className="error">{error}</div>}
      
      {loading ? (
        <div className="panel empty">Загрузка финансовых данных...</div>
      ) : !rows.length ? (
        <div className="panel empty-state">
          <b>Нет данных за выбранный период</b>
          <span>Загрузите отчет P&L или введите данные вручную. STEN не генерирует синтетические данные.</span>
        </div>
      ) : (
        <>
          <section className={'prime-card ' + (prime === null ? 'is-empty' : prime > 65 ? 'critical' : prime > 60 ? 'attention' : 'normal')}>
            <div>
              <span className="eyebrow">01 — PRIME COST</span>
              <strong>{prime === null ? '—' : prime.toFixed(1).replace('.', ',') + ' %'}</strong>
              <small>{status} • План: {primePlan === null ? '—' : primePlan.toFixed(1).replace('.', ',') + ' %'}</small>
            </div>
            <div className="prime-rule" aria-label="Prime Cost">
              <svg viewBox="0 0 100 4" preserveAspectRatio="none">
                <rect x="0" y="0" width={prime === null ? 0 : Math.min(100, prime / 80 * 100)} height="4" />
              </svg>
            </div>
            <em>{devPrime === null ? '—' : (devPrime > 0 ? '+' : '') + devPrime.toFixed(1).replace('.', ',') + ' п.п. к плану'}</em>
          </section>

          <div className="metric-grid">
            {metrics.map(([label, factValue, planValue]) => (
              <article className="metric-card" key={label}>
                <span>{label}</span>
                <strong>{formatMoneyAuto(factValue)}</strong>
                <small>План: {formatMoneyAuto(planValue)}</small>
                <div className={'delta ' + ((factValue !== null && planValue !== null && factValue - planValue < 0) ? 'negative' : '')}>
                  {factValue !== null && planValue !== null ? (
                    <span>
                      {factValue - planValue < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />} 
                      {' '}{formatDeltaPct(planValue, factValue)}
                    </span>
                  ) : <span>Отклонение: —</span>}
                </div>
              </article>
            ))}
          </div>

          <div className="two-col dashboard-columns">
            <section className="panel">
              <div className="panel-title"><TrendingUp size={16} /> Динамика выручки за 3 месяца</div>
              {trend.map(t => (
                <div className="chart-row" key={t.period}>
                  <div className="chart-label">
                    <b>{monthLabel(t.period)}</b>
                    <small>{t.revenue === null ? '—' : formatMoneyAuto(t.revenue)}</small>
                  </div>
                  <div className="bar-track">
                    {t.revenue !== null && (
                      <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                        <rect x="0" y="0" width={Math.max(2, (t.revenue / max) * 100)} height="4" />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </section>
            
            <section className="panel">
              <div className="panel-title"><AlertTriangle size={16} /> Зоны внимания</div>
              <div className="empty">
                {devPrime !== null && devPrime > 0 
                  ? 'Prime Cost выше плана. Проверьте рост COGS или переработки персонала.' 
                  : 'Критических отклонений не выявлено. Продолжайте мониторинг.'}
              </div>
              {fact?.overtime != null && fact.overtime > 0 && (
                <div className="dashboard-note">
                  <AlertTriangle size={14} /> 
                  Переработки: {formatMoneyAuto(fact.overtime)} ₽ в структуре Labor Cost.
                </div>
              )}
              <div className="dashboard-note">
                <BarChart3 size={14} /> Данные рассчитаны на backend. Для детализации перейдите в раздел P&L.
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}