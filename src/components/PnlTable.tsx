import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PnlDraftRow } from '../lib/pnl';
import { pnlDeltaTone } from '../lib/pnlPresentation';
import PnlRow from './PnlRow';
import PnlCardMobile from './PnlCardMobile';

type Props = {
  rows: PnlDraftRow[]; loading: boolean; unavailable: boolean; error: string; scale: import('../lib/pnl').PnlScale; primeCostPercent?: number | null; ebitdaFact?: number; ebitdaMargin?: number;
  revenuePlan?: number; revenueFact?: number;
  onUpdate: (id: string, field: 'plan' | 'fact', value: string) => void;
  onArticleChange: (id: string, value: string) => void;
  onRemove: (id: string) => void; onAnalyze: (row: PnlDraftRow) => void;
  onSecretary: (row: PnlDraftRow) => void; onRetry: () => void;
  onImport: () => void; onAdd: () => void;
};
const definitions = [
  { id: '1.0', title: 'Выручка', re: /revenue|sales|выруч|оборот|доход/i },
  { id: '2.0', title: 'Себестоимость', re: /cogs|food.?cost|себестоим|рецепт|брак кухни|списан|продукт/i },
  { id: '3.0', title: 'Маржа', re: /gross.?profit|марж|валов.*прибыл/i },
  { id: '4.0', title: 'OPEX', re: /opex|операцион|аренд|коммунал|маркетинг|ремонт|расход|затрат/i },
  { id: '5.0', title: 'Прибыль контролируемая', re: /controllable|контролируем|фот|персонал|labor|payroll/i },
  { id: '6.0', title: 'Неконтролируемые', re: /uncontrollable|неконтролируем|налог|амортизац|процент/i },
  { id: '7.0', title: 'EBITDA', re: /ebitda/i },
  { id: '8.0', title: 'Net Profit', re: /net.?profit|чист.*прибыл/i },
];
function section(article: string) {
  const prefix = article.match(/^\s*([1-8])(?:\.\d+)?\b/);
  return prefix ? definitions[Number(prefix[1]) - 1] : definitions.find((x) => x.re.test(article)) || definitions[3];
}
function money(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽' : '—';
}
export default function PnlTable(p: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = new Map<string, { id: string; title: string; rows: PnlDraftRow[] }>();
  p.rows.forEach((row) => {
    const s = section(row.article);
    const g = groups.get(s.id) || { id: s.id, title: s.title, rows: [] };
    g.rows.push(row); groups.set(s.id, g);
  });
  const sorted = [...groups.values()].sort((a, b) => Number(a.id.slice(0, -2)) - Number(b.id.slice(0, -2)));
  const revenueDeltaPct = undefined;
  if (p.loading) return <div className="pnl-v4-skeleton" aria-label="Загрузка P&L"><div className="pnl-v4-skeleton-head" />{Array.from({ length: 7 }, (_, i) => <div className="pnl-v4-skeleton-row" key={i}><i /><i /><i /><i /></div>)}</div>;
  if (p.unavailable) return <div className="pnl-v4-empty" role="alert"><strong>Данные временно недоступны</strong><span>{p.error || 'Не удалось загрузить P&L.'}</span><button type="button" className="secondary-button" onClick={p.onRetry}>Повторить</button></div>;
  if (!p.rows.length) return <div className="pnl-v4-empty"><strong>Нет данных за период</strong><span>В выбранном периоде нет подтверждённых строк P&L.</span><button type="button" className="primary-button" onClick={p.onImport}>Импортировать из Excel</button></div>;
  return <div className="pnl-v4-table-wrap">
    <div className="pnl-v4-summary-mobile">
      <div><span>Выручка · факт</span><strong>{money(p.revenueFact)}</strong><small>План {money(p.revenuePlan)} · Δ {typeof revenueDeltaPct === 'number' ? (revenueDeltaPct > 0 ? '+' : '') + revenueDeltaPct.toFixed(1).replace('.', ',') + '%' : '—'}</small></div>
      <div><span>Prime Cost</span><strong>{typeof p.primeCostPercent === 'number' ? p.primeCostPercent.toFixed(1).replace('.', ',') + '%' : '—'}</strong><small>Подтверждённые данные сервера</small></div>
      <div><span>EBITDA</span><strong>{money(p.ebitdaFact)}</strong><small>Маржа {typeof p.ebitdaMargin === 'number' ? p.ebitdaMargin.toFixed(1).replace('.', ',') + '%' : '—'}</small></div>
    </div>
    <div className="pnl-v4-table-scroll">
      <div className="pnl-v4-grid pnl-v4-column-head"><span>Статья</span><span>План</span><span>Факт</span><span>Δ ₽ / Δ %</span><span>Доля %</span><span /></div>
      {sorted.map((g) => {
        const closed = Boolean(collapsed[g.id]);
        const plan: number | undefined = undefined, fact: number | undefined = undefined;
        const delta = plan !== undefined && fact !== undefined ? fact - plan : undefined;
        const tone = pnlDeltaTone(g.title, delta);
        const deltaPct = plan !== undefined && fact !== undefined && plan !== 0 ? delta! / Math.abs(plan) * 100 : undefined;
        return <section className="pnl-v4-section" key={g.id}>
          <button type="button" className="pnl-v4-section-head pnl-v4-grid" aria-expanded={!closed} onClick={() => setCollapsed((old) => ({ ...old, [g.id]: !old[g.id] }))}>
            <span className="pnl-v4-section-title">{closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<b>{g.id} {g.title}</b><small>{g.rows.length}</small></span>
            <span className="pnl-v4-number">{money(plan)}</span><span className="pnl-v4-number">{money(fact)}</span>
            <span className={'pnl-v4-delta ' + tone}>{delta === undefined ? '—' : (delta > 0 ? '+' : '') + money(delta) + (deltaPct === undefined ? '' : ' / ' + (deltaPct > 0 ? '+' : '') + deltaPct.toFixed(1).replace('.', ',') + '%')}</span>
            <span className="pnl-v4-number">{'—'}</span><span />
          </button>
          {!closed && <div className="pnl-v4-section-rows">{g.rows.map((row) => <div className="pnl-v4-responsive-row" key={row.id}>
            <PnlRow row={row} revenueFact={p.revenueFact} scale={p.scale} onUpdate={p.onUpdate} onArticleChange={p.onArticleChange} onRemove={p.onRemove} onAnalyze={p.onAnalyze} onSecretary={p.onSecretary} />
            <PnlCardMobile row={row} revenueFact={p.revenueFact} scale={p.scale} onUpdate={p.onUpdate} onArticleChange={p.onArticleChange} onAnalyze={p.onAnalyze} onSecretary={p.onSecretary} onSwipeExpand={() => setCollapsed((old) => ({ ...old, [g.id]: false }))} />
          </div>)}</div>}
        </section>;
      })}
    </div>
    <div className="pnl-v4-footer"><button type="button" className="secondary-button" onClick={p.onAdd}>Добавить статью</button></div>
  </div>;
}