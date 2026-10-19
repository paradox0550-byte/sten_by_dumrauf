import { Link } from 'react-router-dom';
import { formatMoneyAuto, formatPercent } from '../lib/format';
import type { DeviationItem } from '../pages/Dashboard';

type Props = { items: DeviationItem[]; period: string; onCreateTask: (item: DeviationItem) => void; creatingTask: string | null };
const money = (value: number | null) => value === null ? '—' : formatMoneyAuto(value);
const groupLabel = (group: DeviationItem['group']) => group === 'critical' ? 'Критические · перерасход / недобор' : group === 'positive' ? 'Положительные · экономия / выше плана' : 'Пропуски данных';
export default function AttentionBlock({ items, period, onCreateTask, creatingTask }: Props) {
  const visible = items.slice(0, 5);
  const critical = visible.filter(item => item.group === 'critical');
  const positive = visible.filter(item => item.group === 'positive');
  const missing = visible.filter(item => item.group === 'missing');
  const renderGroup = (title: string, rows: DeviationItem[]) => rows.length ? <section className="director-attention__group" key={title}><h3>{title}</h3><div className="director-attention__list">{rows.slice(0, 5).map(item => {
    const prompt = 'Разбери отклонение P&L по статье "' + item.article + '" за ' + period + '. План: ' + money(item.plan) + '; факт: ' + money(item.fact) + '; отклонение: ' + money(item.delta) + '. Не выдумывай причины, укажи какие данные нужны для проверки.';
    return <article className={'director-attention__row director-attention__row--' + item.group} key={item.article}><div className="director-attention__row-main"><strong className="director-attention__article">{item.article}</strong><span className={'director-attention__severity director-attention__severity--' + item.severity}>{item.severity === 'high' ? 'Критично' : item.severity === 'medium' ? 'Среднее' : 'Низкое'}</span><span className="director-attention__plan">План <b>{money(item.plan)}</b> · Факт <b>{money(item.fact)}</b></span><span className="director-attention__delta">{money(item.delta)} <b>{item.deltaPct === null ? '—' : formatPercent(item.deltaPct)}</b></span></div><div className="director-attention__actions"><Link className="secondary-button" to={'/sten?q=' + encodeURIComponent(prompt)}>Спросить AI</Link><button className="secondary-button" type="button" onClick={() => onCreateTask(item)} disabled={creatingTask === item.article}>{creatingTask === item.article ? 'Создаём…' : 'В план'}</button></div></article>;
  })}</div></section> : null;
  return <section className="director-attention" aria-labelledby="director-attention-title"><div className="director-attention__heading"><h2 id="director-attention-title">Требует внимания</h2><span>{items.length ? items.length + ' строк для проверки' : 'Отклонений нет за период'}</span></div>{items.length ? <>{renderGroup(groupLabel('critical'), critical)}{renderGroup(groupLabel('positive'), positive)}{renderGroup(groupLabel('missing'), missing)}</> : <p>По загруженным данным отклонений нет. Отсутствующие данные не считаются нулевыми.</p>}<Link className="director-attention__link" to="/pnl">Открыть P&amp;L</Link></section>;
}