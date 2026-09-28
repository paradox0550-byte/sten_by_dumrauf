import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, Save, Pencil, X } from 'lucide-react';
import { api } from '../lib/api';

import { useScope } from '../lib/useScope';

type Calc = {
  revenue: number | null; cogs: number | null; labor: number | null;
  personnel: number | null; overtime: number | null;
  primeCostPercent: number | null; foodCostPercent: number | null;
  personnelPercent: number | null; ebitda: number | null;
};
type Report = { date: string; values?: Record<string, number | null>; calculated?: Calc };
type ReportsResponse = { reports: Report[] };

const FIELDS = [
  { key: 'revenue',   label: 'Выручка, руб',   placeholder: '1500000' },
  { key: 'checks',    label: 'Чеков, шт',    placeholder: '250' },
  { key: 'guests',    label: 'Гостей, чел',  placeholder: '300' },
  { key: 'cash',      label: 'Наличные, руб',  placeholder: '500000' },
  { key: 'card',      label: 'Карта, руб',     placeholder: '1000000' },
  { key: 'discounts', label: 'Скидки, руб',    placeholder: '30000' },
] as const;

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const fmt = (v: number | null, p = false) =>
  v === null ? '—' : (p ? v.toFixed(1).replace('.', ',') + ' %' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v));

export default function Flash() {
  const [scope] = useScope();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError(''); setMessage('');
    try {
      const x = await api.get<ReportsResponse>('/reports?date=' + encodeURIComponent(date));
      const found = x.reports?.[0] ?? null;
      setR(found);
      const next: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = found?.values?.[f.key];
        next[f.key] = v === null || v === undefined ? '' : String(v);
      }
      setForm(next);
      setEditing(!found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить оперативные данные.');
      setR(null);
      setEditing(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [date]);

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const values: Record<string, number> = {};
      for (const f of FIELDS) {
        const raw = String(form[f.key] ?? '').trim().replace(/\s/g, '').replace(',', '.');
        if (!raw) continue;
        const num = Number(raw);
        if (!Number.isFinite(num)) throw new Error(f.label + ' — не число');
        values[f.key] = num;
      }
      if (!Object.keys(values).length) throw new Error('Заполните хотя бы одно поле.');
      const res = await api.post<{ saved?: boolean; date?: string }>('/reports', { date, values });
      const saved = (res as any)?.saved ?? true;
      if (!saved) throw new Error('Сервер не подтвердил сохранение.');
      await load();
      setMessage('Оперативные данные сохранены.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  }

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
        <div className="head-actions">
          {r && !editing && (
            <button className="secondary-button" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Изменить
            </button>
          )}
          <button className="secondary-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} /> Обновить
          </button>
        </div>
      </div>

      <section className="panel flash-date">
        <label className="settings-field">
          <span>Дата отчетного периода</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </section>

      {error && <div className="import-result warn">{error}</div>}
      {message && <div className="pnl-message ok">{message}</div>}

      {loading ? (
        <div className="panel empty">Загрузка оперативных данных...</div>
      ) : editing ? (
        <section className="panel">
          <div className="panel-title"><Pencil size={16} /> {r ? 'Редактирование Flash Report' : 'Новый Flash Report'} за {date}</div>
          <div className="flash-form">
            {FIELDS.map(f => (
              <label className="settings-field" key={f.key}>
                <span>{f.label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={f.placeholder}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="quick-actions">
            {r && <button className="secondary-button" onClick={() => { setEditing(false); setError(''); }} disabled={saving}>
              <X size={15} /> Отмена
            </button>}
            <button className="primary-button" disabled={saving} onClick={() => void save()}>
              <Save size={15} /> {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </section>
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
                : calc?.overtime != null && calc.overtime > 0
                  ? 'Выявлены переработки персонала. Проверьте график смен и Labor Cost.'
                  : 'Prime Cost рассчитан корректно. Нет критических отклонений по структуре COGS и ФОТ.'}
            </div>
          </section>
        </>
      )}
    </div>
  );
}