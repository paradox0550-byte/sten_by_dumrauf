import { MessageSquareText, Save, Trash2 } from 'lucide-react';
import { formatMoneyInput, type PnlDraftRow, type PnlScale } from '../lib/pnl';
import { isPnlExpenseArticle, pnlDeltaTone } from '../lib/pnlPresentation';
type Props = {
  row: PnlDraftRow; revenueFact?: number; scale: PnlScale;
  onUpdate: (id: string, field: 'plan' | 'fact', value: string) => void;
  onArticleChange: (id: string, value: string) => void;
  onRemove: (id: string) => void; onAnalyze: (row: PnlDraftRow) => void; onSecretary: (row: PnlDraftRow) => void;
};
const valid = (v?: number) => typeof v === 'number' && Number.isFinite(v);
const money = (v?: number) => valid(v) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v!) + ' ₽' : '—';
export default function PnlRow({ row, revenueFact, onUpdate, onArticleChange, onRemove, onAnalyze, onSecretary, scale }: Props) {
  const delta = valid(row.plan) && valid(row.fact) ? row.fact! - row.plan! : undefined;
  const pct = valid(row.plan) && valid(row.fact) && row.plan !== 0 ? delta! / Math.abs(row.plan!) * 100 : undefined;
  const share = valid(row.fact) && typeof revenueFact === 'number' && Number.isFinite(revenueFact) && revenueFact > 0 ? (isPnlExpenseArticle(row.article) ? Math.abs(row.fact!) : row.fact!) / revenueFact! * 100 : undefined;
  const formatPct = (v?: number) => valid(v) ? (v! > 0 ? '+' : '') + v!.toFixed(1).replace('.', ',') + '%' : '—';
  return <div className="pnl-v4-grid pnl-v4-row">
    <div className="pnl-v4-article"><input aria-label={'Название статьи: ' + row.article} title={row.article} value={row.article} onChange={(e) => onArticleChange(row.id, e.target.value)} />{row.source && <small title={row.source}>{row.source}</small>}</div>
    <label className="pnl-v4-edit-number"><span>План</span><input aria-label={'План: ' + row.article} inputMode="decimal" placeholder="—" value={formatMoneyInput(row.plan, scale)} onChange={(e) => onUpdate(row.id, 'plan', e.target.value)} /></label>
    <label className="pnl-v4-edit-number"><span>Факт</span><input aria-label={'Факт: ' + row.article} inputMode="decimal" placeholder="—" value={formatMoneyInput(row.fact, scale)} onChange={(e) => onUpdate(row.id, 'fact', e.target.value)} /></label>
    <div className={'pnl-v4-delta ' + pnlDeltaTone(row.article, delta)} title="Факт минус план"><span>{valid(delta) ? (delta! > 0 ? '+' : '') + money(delta!) : '—'}</span><small>{formatPct(pct)}</small></div>
    <span className="pnl-v4-share">{formatPct(share)}</span>
    <div className="pnl-v4-row-actions">
      <button type="button" title="Разобрать в AI" aria-label={'Разобрать в AI: ' + row.article} onClick={() => onAnalyze(row)}><MessageSquareText size={15} /></button>
      <button type="button" title="В Секретарь" aria-label={'Создать задачу по статье ' + row.article} onClick={() => onSecretary(row)}><Save size={15} /></button>
      <button type="button" title="Удалить статью" aria-label={'Удалить статью ' + row.article} onClick={() => onRemove(row.id)}><Trash2 size={15} /></button>
    </div>
  </div>;
}