import { useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { parseIikoProductMixText, parsePowerBiHourlyFile, type HourlySalesObservation, type ProductMixObservation } from '../domain/labor/exports/actualReports';
import './ActualLaborReportsPanel.css';

const number = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
const date = (value: string | null) => {
  if (!value) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '—';
  const parsed = new Date(normalized + 'T12:00:00');
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('ru-RU') : '—';
};

export default function ActualLaborReportsPanel() {
  const [hourly, setHourly] = useState<{ file: string; restaurant: string | null; periodStart: string | null; periodEnd: string | null; rows: HourlySalesObservation[]; skippedRows: number } | null>(null);
  const [mix, setMix] = useState<{ file: string; restaurant: string | null; periodStart: string | null; periodEnd: string | null; rows: ProductMixObservation[]; skippedRows: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function loadPowerBi(file?: File) {
    if (!file) return;
    setBusy('powerbi'); setError('');
    try {
      const result = await parsePowerBiHourlyFile(await file.arrayBuffer());
      setHourly({ file: file.name, ...result });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось прочитать Power BI.'); }
    finally { setBusy(''); }
  }
  async function loadOlap(file?: File) {
    if (!file) return;
    setBusy('olap'); setError('');
    try {
      const result = parseIikoProductMixText(await file.arrayBuffer());
      setMix({ file: file.name, ...result });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось прочитать OLAP.'); }
    finally { setBusy(''); }
  }
  const sumHourly = (key: 'revenue' | 'dishes' | 'checks' | 'cost') =>
    hourly && hourly.rows.some(row => row[key] != null)
      ? hourly.rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)
      : null;
  const hourlyTotal = hourly && hourly.rows.length > 0
    ? { revenue: sumHourly('revenue'), dishes: sumHourly('dishes'), checks: sumHourly('checks'), cost: sumHourly('cost') }
    : null;
  const topDishes = mix ? [...mix.rows].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)).slice(0, 10) : [];
  const topHours = hourly ? [...hourly.rows].reduce((map, row) => { const prev = map.get(row.hour) ?? { revenue: null as number | null, dishes: null as number | null, checks: null as number | null, observations: 0 }; if (row.revenue != null) prev.revenue = (prev.revenue ?? 0) + row.revenue; if (row.dishes != null) prev.dishes = (prev.dishes ?? 0) + row.dishes; if (row.checks != null) prev.checks = (prev.checks ?? 0) + row.checks; prev.observations++; map.set(row.hour, prev); return map; }, new Map<number, { revenue: number | null; dishes: number | null; checks: number | null; observations: number }>()) : new Map();
  return <section className="fot-section actual-reports">
    <div className="fot-section-heading"><div><span className="eyebrow">ИМПОРТ РЕАЛЬНЫХ ОТЧЁТОВ</span><h2>Адаптация выгрузок iiko и Power BI</h2><p>Разные форматы разбираются отдельно. Почасовой спрос не смешивается с ассортиментом и не подменяет данные табеля.</p></div></div>
    <div className="ar-imports">
      <div className="ar-card"><b><FileSpreadsheet size={16}/> Power BI · продажи по часам</b><p>Поддерживает шапку отчёта с названием ресторана и периодом, объединённые ячейки даты, часы, дневные итоги и итоговые строки. Используется для профиля спроса.</p><label className="li-upload"><UploadCloud size={16}/>{busy === 'powerbi' ? 'Читаем файл…' : 'Загрузить Power BI XLSX'}<input type="file" accept=".xlsx,.xls" disabled={!!busy} onChange={e => void loadPowerBi(e.target.files?.[0])}/></label>
      {hourly && <><small>{hourly.file} · {hourly.restaurant ?? 'Ресторан не указан'} · {date(hourly.periodStart)} — {date(hourly.periodEnd)}{hourly.skippedRows > 0 && ` · пропущено строк: ${hourly.skippedRows}`}</small><div className="ar-kpis"><article><small>Почасовых строк</small><strong>{number(hourly.rows.length, 0)}</strong></article><article><small>Выручка по часам</small><strong>{money(hourlyTotal?.revenue)}</strong></article><article><small>Блюд</small><strong>{number(hourlyTotal?.dishes)}</strong></article><article><small>Чеков</small><strong>{number(hourlyTotal?.checks, 0)}</strong></article></div><div className="ar-table-wrap"><table><thead><tr><th>Час</th><th>Строк</th><th>Выручка</th><th>Блюд</th><th>Чеков</th></tr></thead><tbody>{[...topHours.entries()].sort((a,b)=>a[0]-b[0]).map(([hour, values])=><tr key={hour}><td>{String(hour).padStart(2,'0')}:00</td><td>{values.observations}</td><td>{money(values.revenue)}</td><td>{number(values.dishes)}</td><td>{number(values.checks,0)}</td></tr>)}</tbody></table></div></>}
      </div>
      <div className="ar-card"><b><FileSpreadsheet size={16}/> iiko OLAP · ассортимент и себестоимость</b><p>Поддерживает табличный TXT в Windows-1251: блюдо, группа, количество, себестоимость, цена, сумма и скидка. В этом формате нет даты/часа продаж.</p><label className="li-upload"><UploadCloud size={16}/>{busy === 'olap' ? 'Читаем файл…' : 'Загрузить OLAP TXT'}<input type="file" accept=".txt,.csv,.tsv" disabled={!!busy} onChange={e => void loadOlap(e.target.files?.[0])}/></label>
      {mix && <><small>{mix.file} · {mix.restaurant ?? 'Ресторан не указан'} · {date(mix.periodStart)} — {date(mix.periodEnd)}{mix.skippedRows > 0 && ` · пропущено строк: ${mix.skippedRows}`}</small><div className="ar-kpis"><article><small>Позиций блюд</small><strong>{number(mix.rows.length,0)}</strong></article><article><small>Количество проданных</small><strong>{number(mix.rows.length && mix.rows.some(row=>row.quantity!=null) ? mix.rows.reduce((sum,row)=>sum+(row.quantity??0),0) : null)}</strong></article><article><small>Выручка строк</small><strong>{money(!mix.rows.length || mix.rows.every(row=>row.revenue==null)?null:mix.rows.reduce((sum,row)=>sum+(row.revenue??0),0))}</strong></article><article><small>Без даты/часа</small><strong>Да</strong></article></div><div className="ar-table-wrap"><table><thead><tr><th>Блюдо</th><th>Группа</th><th>Количество</th><th>Себестоимость</th><th>Цена</th></tr></thead><tbody>{topDishes.map((row,index)=><tr key={row.dish+index}><td>{row.dish}</td><td>{row.category ?? '—'}</td><td>{number(row.quantity)}</td><td>{money(row.costPerUnit)}</td><td>{money(row.pricePerUnit)}</td></tr>)}</tbody></table></div></>}
      </div>
    </div>
    {error && <div className="li-error" role="alert">{error}</div>}
    <p className="li-footnote">Эти импорты не меняют табель и не создают фиктивные часы по зонам. Чтобы связать продажи с трудозатратами, отдельно задаются категории, зона и подтверждённый коэффициент трудоёмкости. Данные остаются в текущей сессии страницы.</p>
  </section>;
}
