import { useId, type ReactNode } from 'react';

export type MetricStatus = 'neutral' | 'positive' | 'warning' | 'danger';
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

type ExecutiveMetricProps = {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  deltaTone?: Tone;
  status?: MetricStatus;
  statusLabel?: string;
  action?: ReactNode;
};

const statusConfig: Record<MetricStatus, { dot: string; label: string }> = {
  neutral: { dot: 'bg-sten-muted', label: 'Нет оценки' },
  positive: { dot: 'bg-sten-success', label: 'Лучше плана' },
  warning: { dot: 'bg-sten-warning', label: 'Требует внимания' },
  danger: { dot: 'bg-sten-danger', label: 'Неблагоприятное отклонение' },
};

const deltaToneClasses: Record<Tone, string> = {
  success: 'text-sten-success',
  warning: 'text-sten-warning',
  danger: 'text-sten-danger',
  neutral: 'text-sten-secondary',
};

export default function ExecutiveMetric({
  label,
  value,
  detail,
  delta,
  deltaTone = 'neutral',
  status,
  statusLabel,
  action,
}: ExecutiveMetricProps) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `executive-metric-${generatedId}`;
  const derivedStatus = status ?? (
    deltaTone === 'success' ? 'positive'
      : deltaTone === 'warning' ? 'warning'
        : deltaTone === 'danger' ? 'danger'
          : undefined
  );
  const visibleStatus = derivedStatus ? statusConfig[derivedStatus] : undefined;

  return (
    <article
      className="flex min-h-[156px] min-w-0 flex-col gap-3 rounded-lg border border-sten-surface-muted bg-sten-surface p-5 shadow-none transition-colors duration-150"
      aria-labelledby={titleId}
    >
      <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3
          id={titleId}
          className="min-w-0 break-words font-ui text-[14px] font-semibold leading-snug text-sten-secondary"
        >
          {label}
        </h3>

        {visibleStatus && (
          <span className="inline-flex max-w-full items-center gap-2 font-ui text-[14px] font-medium leading-snug text-sten-secondary">
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${visibleStatus.dot}`}
              aria-hidden="true"
            />
            {statusLabel ?? visibleStatus.label}
          </span>
        )}
      </div>

      <p className="w-full break-words font-mono text-[clamp(1.25rem,2vw,1.75rem)] font-medium leading-tight tracking-tight text-sten-primary [font-variant-numeric:tabular-nums_lining-nums] [overflow-wrap:anywhere]">
        {value}
      </p>

      {detail && (
        <p className="max-w-[60ch] font-ui text-[16px] leading-relaxed text-sten-secondary [overflow-wrap:anywhere]">
          {detail}
        </p>
      )}

      {delta !== undefined && (
        <p className={`font-ui text-[14px] font-semibold leading-snug ${deltaToneClasses[deltaTone]}`}>
          {delta === '—' ? 'Δ —' : `Δ ${delta}`}
        </p>
      )}

      {action && (
        <div className="mt-auto pt-1 [&>a]:inline-flex [&>a]:min-h-[44px] [&>a]:items-center [&>a]:gap-2 [&>a]:font-ui [&>a]:text-[16px] [&>a]:font-semibold [&>a]:text-sten-brand [&>a]:underline-offset-4 [&>a:hover]:underline [&>button]:min-h-[44px] [&>button]:font-ui [&>button]:text-[16px] [&>*:focus-visible]:outline [&>*:focus-visible]:outline-2 [&>*:focus-visible]:outline-offset-2 [&>*:focus-visible]:outline-sten-brand">
          {action}
        </div>
      )}
    </article>
  );
}
