import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, WalletCards, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { scopeQuery } from '../lib/scope';
import { useScope } from '../lib/useScope';
import { createRequestSequence } from '../lib/requestSequence';
import { formatMoney, formatPercent } from '../lib/format';
import { PNL_CATEGORY_LABELS, type PnlCategory } from '../lib/pnlExcelImport';

type Row = { article: string; key?: string; label?: string; plan?: number | null; fact?: number | null; source?: string | null };
type ServerCalc = {
  revenue?: number | null;
  cogs?: number | null;
  personnel?: number | null;
  overtime?: number | null;
  labor?: number | null;
  opex?: number | null;
  other_operating?: number | null;
  other?: number | null;
  operatingExpenses?: number | null;
  grossProfit?: number | null;
  belowEbitdaExpenses?: number | null;
  depreciation?: number | null;
  interest?: number | null;
  tax?: number | null;
  ebitda?: number | null;
  netProfit?: number | null;
  foodCostPercent?: number | null;
  personnelPercent?: number | null;
  opexPercent?: number | null;
  ebitdaMargin?: number | null;
  netMargin?: number | null;
  primeCostPercent?: number | null;
  otherOperatingRequiresReview?: boolean;
};
type Calculated = { fact: ServerCalc; plan: ServerCalc };
const has = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const delta = (plan: number | null | undefined, fact: number | null | undefined) => has(plan) && has(fact) ? fact - plan : null;
const categoryLabel = (key?: string) => key && key in PNL_CATEGORY_LABELS
  ? PNL_CATEGORY_LABELS[key as PnlCategory]
  : 'Требует уточнения';

export default function Finances() {
  const [scope] = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [calculated, setCalculated] = useState<Calculated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadSeqRef = useRef(createRequestSequence());

  const load = () => {
    const requestId = loadSeqRef.current.begin();
    setLoading(true);
    setError('');
    api.get<unknown>('/api/pnl?' + scopeQuery(scope))
      .then(response => {
        if (!loadSeqRef.current.isCurrent(requestId)) return;
        const envelope = response && typeof response === 'object' ? response as Record<string, any> : {};
        const data = Array.isArray(envelope.rows) ? envelope : envelope.data ?? envelope;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setCalculated(data.summary?.calculated ?? data.calculated ?? null);
      })
      .catch(reason => {
        if (!loadSeqRef.current.isCurrent(requestId)) return;
        setRows([]);
        setCalculated(null);
        setError(reason instanceof Error ? reason.message : 'Финансовые данные недоступны');
      })
      .finally(() => {
        if (loadSeqRef.current.isCurrent(requestId)) setLoading(false);
      });
  };

  useEffect(load, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  const fact = calculated?.fact ?? {};
  const plan = calculated?.plan ?? {};
  const chain = useMemo(() => [
    { label: 'Выручка', fact: fact.revenue, plan: plan.revenue },
    { label: '− Себестоимость', fact: fact.cogs, plan: plan.cogs },
    { label: '= Валовая прибыль', fact: fact.grossProfit, plan: plan.grossProfit, total: true },
    { label: '− ФОТ с переработками', fact: fact.labor, plan: plan.labor },
    { label: '− Операционные расходы', fact: fact.operatingExpenses, plan: plan.operatingExpenses },
    { label: '= EBITDA', fact: fact.ebitda, plan: plan.ebitda, total: true },
    { label: '− Амортизация / проценты / налоги', fact: fact.belowEbitdaExpenses, plan: plan.belowEbitdaExpenses },
    { label: '= Чистая прибыль', fact: fact.netProfit, plan: plan.netProfit, total: true },
  ], [fact, plan]);

  const gaps = [
    fact.cogs == null ? 'Себестоимость / COGS' : null,
    fact.labor == null ? 'ФОТ и переработки' : null,
    fact.operatingExpenses == null ? 'Операционные расходы' : null,
    fact.depreciation == null ? 'Амортизация' : null,
    fact.interest == null ? 'Проценты' : null,
    fact.tax == null ? 'Налоги' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="page analytics-page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><WalletCards size={12} /> ФИНАНСОВОЕ ЯДРО</span>
          <h1>Финансы</h1>
          <p>Показатели рассчитаны серверным финансовым ядром STEN для выбранного ресторана и периода.</p>
        </div>
        <button className="secondary-button" onClick={load} disabled={loading}><RefreshCw size={15} />Обновить</button>
      </div>

      {error && <div className="panel empty-state"><b>Финансовые данные недоступны</b><span>{error}</span></div>}
      {loading ? <div className="panel empty">Загружаем финансовый отчёт…</div> : (
        <>
          {!calculated && !error && <div className="panel empty-state"><b>Нет рассчитанных данных</b><span>Проверьте, что P&amp;L сохранён для выбранного контура и периода.</span></div>}
          <section className="analytics-summary">
            <div>
              <span className="eyebrow">ИТОГ ПЕРИОДА · {scope.period}</span>
              <p>{has(fact.revenue)
                ? `Выручка ${formatMoney(fact.revenue)} · EBITDA ${formatMoney(fact.ebitda)} · Чистая прибыль ${formatMoney(fact.netProfit)}`
                : 'Недостаточно подтверждённых данных для финансового вывода.'}</p>
            </div>
            <div className="analytics-summary-delta">
              <small>Выручка · план / факт</small>
              <strong>{formatMoney(fact.revenue)}</strong>
              <span>{formatMoney(plan.revenue)} · Δ {formatMoney(delta(plan.revenue, fact.revenue))}</span>
            </div>
          </section>

          <section className="analytics-kpi-strip">
            <div><small>Выручка</small><strong>{formatMoney(fact.revenue)}</strong><span>План {formatMoney(plan.revenue)}</span></div>
            <div><small>Food Cost</small><strong>{formatPercent(fact.foodCostPercent)}</strong><span>План {formatPercent(plan.foodCostPercent)}</span></div>
            <div><small>Labor Cost</small><strong>{formatPercent(fact.personnelPercent)}</strong><span>План {formatPercent(plan.personnelPercent)}</span></div>
            <div><small>Prime Cost</small><strong>{formatPercent(fact.primeCostPercent)}</strong><span>Себестоимость + ФОТ с переработками</span></div>
            <div><small>EBITDA</small><strong>{formatMoney(fact.ebitda)}</strong><span>Маржа {formatPercent(fact.ebitdaMargin)}</span></div>
            <div><small>Чистая прибыль</small><strong>{formatMoney(fact.netProfit)}</strong><span>Маржа {formatPercent(fact.netMargin)}</span></div>
          </section>

          <section className="panel analytics-report-section">
            <div className="panel-title">Финансовая цепочка · {scope.period}</div>
            <div className="analytics-report-table finance-report-table">
              <div className="analytics-report-head"><span>Показатель</span><span>Факт</span><span>План</span><span>Δ</span></div>
              {chain.map(item => (
                <div key={item.label} className={item.total ? 'finance-total-row' : ''}>
                  <b>{item.label}</b>
                  <span>{formatMoney(item.fact)}</span>
                  <span>{formatMoney(item.plan)}</span>
                  <strong>{formatMoney(delta(item.plan, item.fact))}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel analytics-report-section">
            <div className="panel-title">Контроль маржи</div>
            <div className="analytics-report-table">
              <div className="analytics-report-head"><span>Показатель</span><span>Факт</span><span>План</span><span>Δ</span></div>
              <div><b>Food Cost</b><span>{formatPercent(fact.foodCostPercent)}</span><span>{formatPercent(plan.foodCostPercent)}</span><strong>{formatPercent(delta(plan.foodCostPercent, fact.foodCostPercent))}</strong></div>
              <div><b>ФОТ / выручка</b><span>{formatPercent(fact.personnelPercent)}</span><span>{formatPercent(plan.personnelPercent)}</span><strong>{formatPercent(delta(plan.personnelPercent, fact.personnelPercent))}</strong></div>
              <div><b>OPEX / выручка</b><span>{formatPercent(fact.opexPercent)}</span><span>{formatPercent(plan.opexPercent)}</span><strong>{formatPercent(delta(plan.opexPercent, fact.opexPercent))}</strong></div>
              <div><b>EBITDA margin</b><span>{formatPercent(fact.ebitdaMargin)}</span><span>{formatPercent(plan.ebitdaMargin)}</span><strong>{formatPercent(delta(plan.ebitdaMargin, fact.ebitdaMargin))}</strong></div>
              <div><b>Net margin</b><span>{formatPercent(fact.netMargin)}</span><span>{formatPercent(plan.netMargin)}</span><strong>{formatPercent(delta(plan.netMargin, fact.netMargin))}</strong></div>
            </div>
          </section>

          <section className="panel analytics-report-section">
            <div className="panel-title">Статьи P&amp;L и распределение</div>
            {rows.length === 0 ? <p>Нет строк P&amp;L для выбранного периода.</p> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Статья</th><th>Категория</th><th>План</th><th>Факт</th><th>Источник</th></tr></thead>
                  <tbody>{rows.map((row, index) => (
                    <tr key={`${row.key ?? 'unknown'}-${row.article}-${index}`}>
                      <td>{row.label || row.article}</td>
                      <td>{categoryLabel(row.key)}</td>
                      <td>{formatMoney(row.plan)}</td>
                      <td>{formatMoney(row.fact)}</td>
                      <td>{row.source || 'Нет данных'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {(gaps.length > 0 || fact.otherOperatingRequiresReview) && (
            <section className="analytics-gap-section">
              <div className="analytics-gap-head">
                <div><span className="eyebrow">КАЧЕСТВО ДАННЫХ</span><h2>Проверка финансового контура</h2></div>
                <AlertTriangle size={17} />
              </div>
              {gaps.length > 0 && <><div className="analytics-gap-list">{gaps.map(item => <span key={item}>{item}</span>)}</div><p>Недостающие показатели остаются «Нет данных» и не заменяются нулями.</p></>}
              {fact.otherOperatingRequiresReview && <p>Прочие операционные расходы превышают 5% выручки. Проверьте детализацию статей.</p>}
            </section>
          )}
          <div className="analytics-footer"><span>Источник: сохранённый P&amp;L выбранной области и периода. Формулы: серверный расчёт STEN.</span></div>
        </>
      )}
    </div>
  );
}
