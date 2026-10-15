import { useId, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock3, Workflow } from 'lucide-react';
import { StepRow } from './StepRow';
import './steps.css';

export type AskStepKind = 'docs' | 'memory' | 'tool' | 'llm';

export interface AskStep {
  kind: AskStepKind;
  label: string;
  detail?: string;
  ms?: number;
  name?: string;
  ok?: boolean;
}

export interface AskStepsProps {
  steps?: AskStep[];
  totalMs?: number;
  className?: string;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms} мс`;
  if (ms < 60000) return `${Math.round(ms / 1000 * 10) / 10} с`;
  return `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`;
}

export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const value = Math.abs(Math.trunc(n));
  const n10 = value % 10;
  const n100 = value % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

export function getStepsBodyClassName(count: number): string {
  return `ai-steps__body${count > 6 ? ' ai-steps__body--scroll' : ''}`;
}

export function AskSteps({ steps, totalMs, className }: AskStepsProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!steps?.length) return null;

  const rootClass = ['ai-steps', className].filter(Boolean).join(' ');
  const durationLabel = totalMs === undefined ? 'Обработка завершена' : formatDuration(totalMs);

  return (
    <section className={rootClass} aria-label="Ход обработки запроса">
      <button
        type="button"
        className="ai-steps__header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ai-steps__mark" aria-hidden="true"><Workflow size={17} /></span>
        <span className="ai-steps__heading">
          <strong>Как обработан запрос</strong>
          <span className="ai-steps__summary">
            <span><CheckCircle2 size={13} aria-hidden="true" /> {steps.length} {pluralizeRu(steps.length, 'шаг', 'шага', 'шагов')}</span>
            <span><Clock3 size={13} aria-hidden="true" /> {durationLabel}</span>
          </span>
        </span>
        <ChevronRight
          size={17}
          aria-hidden="true"
          className={`chevron${open ? ' chevron--open' : ''}`}
          data-testid="ai-steps-chevron"
        />
      </button>
      {open && (
        <div id={bodyId} className={getStepsBodyClassName(steps.length)} role="region" aria-label="Детали обработки">
          {steps.map((step, index) => (
            <div className="ai-steps__item" key={`${step.kind}-${step.name ?? step.label}-${index}`}>
              <span className="ai-steps__index">{String(index + 1).padStart(2, '0')}</span>
              <StepRow step={step} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default AskSteps;
