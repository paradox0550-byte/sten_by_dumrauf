import { Link } from 'react-router-dom';
import { formatMoneyAuto, formatPercent } from '../lib/format';

export type AttentionItem = { article: string; plan: number; fact: number; delta: number; deltaPct: number | null };

export default function AttentionBlock({ items }: { items: AttentionItem[] }) {
  if (!items.length) {
    return <section className="director-attention director-attention--clear" aria-labelledby="director-attention-title">
      <div className="director-attention__heading"><h2 id="director-attention-title">Требует внимания</h2><span>Отклонений нет за период</span></div>
    </section>;
  }

  return <section className="director-attention" aria-labelledby="director-attention-title">
    <div className="director-attention__heading">
      <h2 id="director-attention-title">Требует внимания</h2>
      <span>{items.length} {items.length === 1 ? 'отклонение' : items.length < 5 ? 'отклонения' : 'отклонений'}</span>
    </div>
    <div className="director-attention__list">
      {items.slice(0, 5).map((item) => (
        <div className="director-attention__row" key={item.article}>
          <span className="director-attention__article">{item.article}</span>
          <span className="director-attention__plan">План <b>{formatMoneyAuto(item.plan)}</b> / Факт <b>{formatMoneyAuto(item.fact)}</b></span>
          <span className="director-attention__delta">{formatMoneyAuto(item.delta)} <b>{item.deltaPct === null ? '—' : formatPercent(item.deltaPct)}</b></span>
        </div>
      ))}
    </div>
    <Link className="director-attention__link" to="/pnl">Открыть P&amp;L</Link>
  </section>;
}
