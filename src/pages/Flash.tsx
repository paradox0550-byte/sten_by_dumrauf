import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import ScopeBar from '../components/ScopeBar';
import { useScope } from '../lib/useScope';

type Calc = {
  revenue: number | null; cogs: number | null; labor: number | null;
  personnel: number | null; overtime: number | null;
  primeCostPercent: number | null; foodCostPercent: number | null;
  personnelPercent: number | null; ebitda: number | null;
};
type Report = { date: string; values?: Record<string, number | null>; calculated?: Calc };
type ReportsResponse = { reports: Report[] };

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const fmt = (v: number | null, p = false) => 
  v === null ? '—' : (p ? v.toFixed(1).replace('.', ',') + ' %' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v));

export default function Flash() {
  const [scope, setScope] = useScope();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const x = await api.get<ReportsResponse>('/reports?date=' + encodeURIComponent(date));
      setR(x.reports?.[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить оперативные данные.');
      setR(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [date]);

  const values = r?.values ?? {};
  const calc = r?.calculated;
  const prime = calc?.primeCostPercent ?? null;
  const status = prime === null ? 'Нет данных' : prime <= 60 ? 'Норма' : prime <= 65 ? 'Внимание' : 'Критично';
  
  const avgCheck = n(values.avgCheck) ?? (() => {
    const rev = n(values.revenue), checks = n(values.checks);
    return rev !== null && checks !== null && checks > 0 ? rev / checks : null;
  })();

  const metrics: [string, string][] = [
    ['Выручка', 'revenue'],
    ['Средний чек', 'avgCheck'],
    ['Гостей', 'guests'],
    ['Food Cost %', 'foodCostPercent'],
    ['Labor Cost %', 'personnelPercent'],
    ['Prime Cost %', 'prime']
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow"><Activity size={12} /> ОПЕРАТИВНАЯ СВОДКА</span>
          <h1>Flash Report</h1>
          <p>Ежедневный срез ключевых показателей. Prime Cost контролируется ежедневно.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> Обновить
        </button>
      </div>
      
      <ScopeBar value={scope} onChange={setScope} />
      
      <section className="panel flash-date">
        <label className="settings-field">
          <span>Дата отчетного периода</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </section>

      {error && <div className="import-result warn">{error}</div>}
      
      {loading ? (
        <div className="panel empty">Загрузка оперативных данных...</div>
      ) : !r ? (
        <div className="panel empty-state">
          <b>Нет Flash Report за {date}</b>
          <span>Введите оперативные данные за день. STEN не генерирует синтетические отчеты на основе P&L.</span>
        </div>
      ) : (
        <>
          <section className={'flash-prime ' + (prime === null ? 'is-empty' : prime > 65 ? 'critical' : prime > 60 ? 'attention' : 'normal')}>
            <div>
              <span className="eyebrow">PRIME COST</span>
              <strong>{fmt(prime, true)}</strong>
              <small>{status}</small>
            </div>
            <div className="flash-scale">
              <svg viewBox="0 0 100 4" preserveAspectRatio="none">
                <rect x="0" y="0" width={prime === null ? 0 : Math.min(100, prime / 80 * 100)} height="4" />
              </svg>
            </div>
            <p>≤60% = Норма • 60–65% = Внимание • &gt;65% = Критично</p>
          </section>

          <div className="metric-grid">
            {metrics.map(([label, key]) => (
              <article className="metric-card" key={key}>
                <span>{label}</span>
                <strong>
                  {key === 'prime' ? fmt(prime, true) 
                   : key === 'avgCheck' ? fmt(avgCheck) 
                   : key === 'foodCostPercent' ? fmt(calc?.foodCostPercent ?? null, true) 
                   : key === 'personnelPercent' ? fmt(calc?.personnelPercent ?? null, true) 
                   : fmt(n(values[key]))}
                </strong>
              </article>
            ))}
          </div>

          <section className="panel">
            <div className="panel-title"><AlertTriangle size={16} /> Операционные заметки</div>
            <div className="empty">
              {prime === null 
                ? 'Нет данных для расчета Prime Cost. Проверьте ввод выручки и затрат.' 
                : calc?.overtime !== null && calc.overtime > 0 
                  ? 'Выявлены переработки персонала. Проверьте график смен и Labor Cost.' 
                  : 'Prime Cost рассчитан корректно. Нет критических отклонений по структуре COGS и ФОТ.'}
            </div>
          </section>
        </>
      )}
    </div>
  );
}