type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export default function MetricCard({ label, value, detail, delta, deltaTone = 'neutral', status, statusTone = 'neutral' }: {
  label: string; value: string; detail?: string; delta?: string; deltaTone?: Tone; status?: string; statusTone?: Tone;
}) {
  return (
    <article className="director-metric">
      <div className="director-metric__label">{label}</div>
      <div className="director-metric__value">{value}</div>
      {detail && <div className="director-metric__detail">{detail}</div>}
      {delta && <div className={'director-metric__delta director-tone--' + deltaTone}>{delta === '—' ? 'Δ —' : 'Δ ' + delta}</div>}
      {status && <div className={'director-metric__status director-tone--' + statusTone}>{status}</div>}
    </article>
  );
}
