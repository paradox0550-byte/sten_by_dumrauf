import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
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
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const value = Math.abs(Math.trunc(n));
  const n10 = value % 10;
  const n100 = value % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

export function AskSteps({ steps, totalMs, className }: AskStepsProps) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;

  const rootClass = ['ai-steps', className].filter(Boolean).join(' ');
  const durationLabel = totalMs === undefined ? 'Обработка завершена' : `Обработка заняла ${formatDuration(totalMs)}`;

  return (
    <section className={rootClass}>
      <button
        type="button"
        className="ai-steps__header"
        aria-expanded={open}
        aria-controls="ai-steps-body"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`chevron${open ? ' chevron--open' : ''}`}
          data-testid="ai-steps-chevron"
        />
        <span>{durationLabel} · {steps.length} {pluralizeRu(steps.length, 'шаг', 'шага', 'шагов')}</span>
      </button>
      {open && (
        <div id="ai-steps-body" className="ai-steps__body" role="region" aria-label="Ход обработки">
          {steps.map((step, index) => (
            <StepRow key={`${step.kind}-${step.name ?? step.label}-${index}`} step={step} />
          ))}
        </div>
      )}
    </section>
  );
}

export default AskSteps;
