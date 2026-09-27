import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import { useScope } from '../lib/useScope';
import { scopeQuery } from '../lib/scope';

type Row = { article?: string; plan?: number | null; fact?: number | null };
type Labor = { period: string; department: string; hours: number; amount: number };
type AnalyticsSettings = {
  financial: boolean;
  labor: boolean;
  forecast: boolean;
  laborTarget: number;
  foodTarget: number;
};

const KEY = 'sten_analytics_settings_v1';
const DEFAULTS: AnalyticsSettings = { financial: true, labor: true, forecast: true, laborTarget: 30, foodTarget: 35 };
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const money = (v: number | undefined) => finite(v) == null ? 'Нет данных' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!);
const pct = (v: number | undefined) => finite(v) == null ? 'Нет данных' : v!.toFixed(1).replace('.', ',') + ' %';
const delta = (v: number | undefined) => finite(v) == null ? '—' : (v! > 0 ? '+' : '') + new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!);
const pick = (rows: Row[], terms: string[]) => rows.find(row => terms.some(term => String(row.article || '').toLowerCase().replace(/ё/g, 'е').includes(term)));

function readSettings(): AnalyticsSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}

export default function Analytics() {
  const [scope] = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [labor, setLabor] = useState<Labor[]>([]);
  const [settings, setSettings] = useState<AnalyticsSettings>(readSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const sync = () => setSettings(readSettings());
    window.addEventListener('sten-analytics-settings', sync);
    return () => window.removeEventListener('sten-analytics-settings', sync);
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const q = scopeQuery(scope);
      const [pnl, fot] = await Promise.all([api.get<any>('/api/pnl?' + q), api.get<any>('/fot-analytics')]);
      setRows(Array.isArray(pnl?.rows) ? pnl.rows : []);
      setLabor(Array.isArray(fot?.records) ? fot.records.filter((item: any) => item.period === scope.period) : []);
    } catch (e) {
      setRows([]);
      setLabor([]);
      setError(e instanceof Error ? e.message : 'Не удалось загрузить аналитику.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [scope.period, scope.projectId, scope.branchId, scope.restaurantId, scope.departmentId]);

  const metrics = useMemo(() => {
    const revenue = pick(rows, ['выруч', 'revenue']);
    const cogs = pick(rows, ['себестоим', 'cogs']);
    const laborRow = pick(rows, ['фот', 'фонд оплаты', 'зарплат', 'payroll']);
    const opex = pick(rows, ['операцион', 'opex']);
    const r = finite(revenue?.fact);
    const plan = finite(revenue?.plan);
    const c = finite(cogs?.fact);
    const l = finite(laborRow?.fact);
    const o = finite(opex?.fact);
    return {
      revenue: r,
      revenuePlan: plan,
      revenueDelta: r != null && plan != null ? r - plan : undefined,
      foodCost: r != null && c != null ? c / r * 100 : undefined,
      laborCost: r != null && l != null ? l / r * 100 : undefined,
      ebitda: r != null && c != null && l != null && o != null ? r - c - l - o : undefined,
      hasCogs: c != null,
      hasLabor: l != null,
      hasOpex: o != null
    };
  }, [rows]);

  const laborRows = useMemo(() => {
    const grouped = new Map<string, { hours: number; amount: number }>();
    labor.forEach(item => {
      const department = item.department || 'Без отдела';
      const current = grouped.get(department) || { hours: 0, amount: 0 };
      current.hours += Number(item.hours) || 0;
      current.amount += Number(item.amount) || 0;
      grouped.set(department, current);
    });
    return [...grouped.entries()].sort((a, b) => b[1].amount - a[1].amount);
  }, [labor]);

  const forecast = useMemo(() => {
    if (!settings.forecast || metrics.revenue == null) return undefined;
    const now = new Date();
    const [year, month] = scope.period.split('-').map(Number);
    if (now.getFullYear() !== year || now.getMonth() + 1 !== month) return undefined;
    const days = new Date(year, month, 0).getDate();
    return metrics.revenue / now.getDate() * days;
  }, [metrics.revenue, scope.period, settings.forecast]);

  const report = useMemo(() => {
    const parts: string[] = [];
    if (metrics.revenue != null) {
      parts.push('Выручка ' + money(metrics.revenue) + ' ₽');
      if (metrics.revenueDelta != null && metrics.revenuePlan != null) {
        parts.push((metrics.revenueDelta >= 0 ? 'выше' : 'ниже') + ' плана на ' + money(Math.abs(metrics.revenueDelta)) + ' ₽');
      }
    }
    if (metrics.foodCost != null) parts.push('Food Cost ' + pct(metrics.foodCost));
    if (metrics.laborCost != null) parts.push('Labor Cost ' + pct(metrics.laborCost));
    if (metrics.ebitda != null) parts.push('EBITDA ' + money(metrics.ebitda) + ' ₽');
    return parts.length ? parts.join(' · ') : 'Недостаточно подтверждённых данных для финансового вывода.';
  }, [metrics]);

  const gaps = [
    !metrics.hasCogs ? 'COGS / себестоимость' : null,
    !metrics.hasLabor ? 'ФОТ' : null,
    !metrics.hasOpex ? 'OPEX' : null,
    !laborRows.length ? 'ФОТ по подразделениям' : null,
    'Daypart — продажи по времени',
    'Menu Engineering — продажи по позициям и маржинальность'
  ].filter(Boolean) as string[];

  const signal = (value: number | undefined, target: number) => {
    if (value == null) return 'Нет данных';
    return value > target ? 'Выше порога' : 'В пределах порога';
  };

  return (
    <div className="page analytics-page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><BarChart3 size={12} /> АНАЛИТИЧЕСКИЙ ОТЧЁТ</span>
          <h1>Аналитика</h1>
          <p>Сводка по выбранному рабочему контуру. Только подтверждённые данные, без моделирования отсутствующих фактов.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> Обновить
        </button>
      </div>

      {error && <div className="panel empty-state"><b>Не удалось обновить отчёт</b><span>{error}</span></div>}

      {loading ? <div className="panel empty">Загружаем аналитический отчёт…</div> : (
        <>
          {settings.financial && <>
            <section className="analytics-summary">
              <div><span className="eyebrow">ИТОГ ПЕРИОДА</span><p>{report}</p></div>
              {metrics.revenuePlan != null && metrics.revenue != null && (
                <div className="analytics-summary-delta">
                  <small>Выручка · план / факт</small>
                  <strong>{money(metrics.revenue)} ₽</strong>
                  <span>{money(metrics.revenuePlan)} ₽ · Δ {delta(metrics.revenueDelta)} ₽</span>
                </div>
              )}
            </section>

            <section className="analytics-kpi-strip" aria-label="Ключевые показатели">
              <div><small>Выручка</small><strong>{money(metrics.revenue)}</strong><span>Факт</span></div>
              <div><small>Food Cost</small><strong>{pct(metrics.foodCost)}</strong><span>Порог {settings.foodTarget}%</span></div>
              <div><small>Labor Cost</small><strong>{pct(metrics.laborCost)}</strong><span>Порог {settings.laborTarget}%</span></div>
              <div><small>EBITDA</small><strong>{money(metrics.ebitda)}</strong><span>При полном факте P&L</span></div>
              {settings.forecast && <div><small>Run-rate</small><strong>{money(forecast)}</strong><span>{forecast == null ? 'Текущий месяц' : 'Темп закрытия'}</span></div>}
            </section>

            <section className="panel analytics-report-section">
              <div className="panel-title">Отклонения и пороги</div>
              <div className="analytics-report-table">
                <div className="analytics-report-head"><span>Показатель</span><span>Факт</span><span>Ориентир</span><span>Состояние</span></div>
                <div><b>Выручка</b><span>{money(metrics.revenue)} ₽</span><span>{metrics.revenuePlan == null ? 'Не задан' : money(metrics.revenuePlan) + ' ₽'}</span><strong>{metrics.revenueDelta == null ? 'Нет сравнения' : (metrics.revenueDelta >= 0 ? 'Выше' : 'Ниже') + ' плана на ' + money(Math.abs(metrics.revenueDelta)) + ' ₽'}</strong></div>
                <div><b>Food Cost</b><span>{pct(metrics.foodCost)}</span><span>{settings.foodTarget}%</span><strong className={metrics.foodCost != null && metrics.foodCost > settings.foodTarget ? 'is-warn' : ''}>{signal(metrics.foodCost, settings.foodTarget)}</strong></div>
                <div><b>Labor Cost</b><span>{pct(metrics.laborCost)}</span><span>{settings.laborTarget}%</span><strong className={metrics.laborCost != null && metrics.laborCost > settings.laborTarget ? 'is-warn' : ''}>{signal(metrics.laborCost, settings.laborTarget)}</strong></div>
                <div><b>EBITDA</b><span>{money(metrics.ebitda)} ₽</span><span>Расчёт P&L</span><strong>{metrics.ebitda == null ? 'Неполный факт' : 'Рассчитано'}</strong></div>
              </div>
            </section>
          </>}

          {settings.labor && (
            <section className="panel analytics-report-section">
              <div className="panel-title">ФОТ по подразделениям</div>
              {laborRows.length ? (
                <div className="analytics-report-table labor-table">
                  <div className="analytics-report-head"><span>Подразделение</span><span>Часы</span><span>ФОТ</span><span>Доля</span></div>
                  {laborRows.map(([department, value]) => (
                    <div key={department}>
                      <b>{department}</b>
                      <span>{value.hours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч</span>
                      <span>{money(value.amount)} ₽</span>
                      <strong>{metrics.revenue ? pct(value.amount / metrics.revenue * 100) : '—'}</strong>
                    </div>
                  ))}
                  <div className="analytics-report-total">
                    <b>Итого</b>
                    <span>{laborRows.reduce((sum, [, v]) => sum + v.hours, 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч</span>
                    <strong>{money(laborRows.reduce((sum, [, v]) => sum + v.amount, 0))} ₽</strong>
                    <span>{metrics.laborCost == null ? '—' : pct(metrics.laborCost)}</span>
                  </div>
                </div>
              ) : <div className="empty">Нет подтверждённых данных ФОТ по подразделениям.</div>}
            </section>
          )}

          <section className="analytics-gap-section">
            <div className="analytics-gap-head">
              <div><span className="eyebrow">КАЧЕСТВО ДАННЫХ</span><h2>Что отчёт пока не может показать</h2></div>
              <AlertTriangle size={17} aria-hidden="true" />
            </div>
            <div className="analytics-gap-list">{gaps.map(gap => <span key={gap}>{gap}</span>)}</div>
            <p>Это не ошибка расчёта: соответствующего слоя данных сейчас нет. После его подключения STEN сможет расширить отчёт без подмены факта предположениями.</p>
          </section>

          <div className="analytics-footer"><Settings2 size={15} aria-hidden="true" /><span>Рабочий контур, состав аналитики и пороги настраиваются в <b>Настройки → Аналитика</b>. На странице отчёта настройки не дублируются.</span></div>
        </>
      )}
    </div>
  );
}
