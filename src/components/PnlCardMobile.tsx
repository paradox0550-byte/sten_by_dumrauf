import { useRef, useState } from 'react';
import { MessageSquareText, Save } from 'lucide-react';
import { formatMoneyInput, type PnlDraftRow, type PnlScale } from '../lib/pnl';
import { isPnlExpenseArticle, pnlDeltaTone } from '../lib/pnlPresentation';
type Props = {
  row: PnlDraftRow; revenueFact?: number; scale: PnlScale;
  onUpdate: (id: string, field: 'plan' | 'fact', value: string) => void;
  onArticleChange: (id: string, value: string) => void;
  onAnalyze: (row: PnlDraftRow) => void; onSecretary: (row: PnlDraftRow) => void; onSwipeExpand: () => void;
};
const valid = (v?: number) => typeof v === 'number' && Number.isFinite(v);
const money = (v?: number) => valid(v) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!) + ' ₽' : '—';
export default function PnlCardMobile({ row, revenueFact, onUpdate, onArticleChange, onAnalyze, onSecretary, scale }: Props) {
  const startX = useRef<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const delta = valid(row.plan) && valid(row.fact) ? row.fact! - row.plan! : undefined;
  const pct = valid(row.plan) && valid(row.fact) && row.plan !== 0 ? delta! / Math.abs(row.plan!) * 100 : undefined;
  const share = valid(row.fact) && valid(revenueFact) && revenueFact > 0 ? (isPnlExpenseArticle(row.article) ? Math.abs(row.fact!) : row.fact!) / revenueFact! * 100 : undefined;
  const tone = pnlDeltaTone(row.article, delta);
  const fmt = (v?: number) => valid(v) ? (v! > 0 ? '+' : '') + v!.toFixed(1).replace('.', ',') + '%' : '—';
  return <article className="pnl-v4-mobile-card" onTouchStart={(e) => { startX.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { if (startX.current === null) return; const diff = e.changedTouches[0].clientX - startX.current; if (diff < -36) setRevealed(false); if (diff > 36) setRevealed(true); startX.current = null; }}>
    <input className="pnl-v4-mobile-title" aria-label={'Название статьи: ' + row.article} title={row.article} value={row.article} onChange={(e) => onArticleChange(row.id, e.target.value)} />
    <div className="pnl-v4-mobile-planfact">
      <label>План<input inputMode="decimal" aria-label={'План: ' + row.article} placeholder="—" value={formatMoneyInput(row.plan, scale)} onChange={(e) => onUpdate(row.id, 'plan', e.target.value)} /></label>
      <label>Факт<input inputMode="decimal" aria-label={'Факт: ' + row.article} placeholder="—" value={formatMoneyInput(row.fact, scale)} onChange={(e) => onUpdate(row.id, 'fact', e.target.value)} /></label>
    </div>
    <div className={'pnl-v4-mobile-delta ' + tone}><span>{delta === undefined ? '—' : (delta > 0 ? '+' : '') + money(delta!)}</span><span>{fmt(pct)}</span></div>
    <small className="pnl-v4-mobile-share">Доля выручки: {fmt(share)}</small>
    <div className={'pnl-v4-mobile-actions ' + (revealed ? 'is-revealed' : '')} aria-label={revealed ? 'Действия выделены жестом' : 'Действия статьи'} style={{ outline: revealed ? '1px solid var(--color-brand)' : 'none', outlineOffset: revealed ? '3px' : undefined, borderRadius: 7, transition: 'outline-color 120ms ease' }}>
      <button type="button" onClick={() => onAnalyze(row)}><MessageSquareText size={16} />Разобрать в AI</button>
      <button type="button" onClick={() => onSecretary(row)}><Save size={16} />В Секретарь</button>
    </div>
  </article>;
}