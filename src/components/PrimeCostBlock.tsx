import { formatPercent } from '../lib/format';

export default function PrimeCostBlock({ total, cogs, labor }: { total: number | null; cogs: number | null; labor: number | null }) {
  const tone = total === null ? 'neutral' : total <= 60 ? 'success' : total <= 65 ? 'warning' : 'danger';
  const width = total === null ? 0 : Math.min(100, Math.max(0, total));
  return (
    <section className="director-prime" aria-labelledby="director-prime-title">
      <div className="director-prime__top">
        <div><div className="director-prime__eyebrow">КОНТРОЛЬ СЕБЕСТОИМОСТИ</div><h2 id="director-prime-title">Prime Cost</h2></div>
        <div className={'director-prime__total director-tone--' + tone}>{formatPercent(total, 1)}</div>
      </div>
      <div className="director-prime__bar" role="progressbar" aria-label="Prime Cost" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total === null ? undefined : Math.min(100, Math.max(0, total))}>
        <span className={'director-prime__bar-fill director-tone-bg--' + tone} style={{ width: width + '%' }} />
      </div>
      <div className="director-prime__thresholds"><span>Цель ≤ 60%</span><span>Внимание 60–65%</span><span>Критично &gt; 65%</span></div>
      <div className="director-prime__parts">
        <div><span>COGS</span><strong>{formatPercent(cogs, 1)}</strong></div>
        <div><span>ФОТ</span><strong>{formatPercent(labor, 1)}</strong></div>
      </div>
      <p className="director-prime__note">COGS + ФОТ как доля выручки. Если исходных данных недостаточно, значение не рассчитывается.</p>
    </section>
  );
}
