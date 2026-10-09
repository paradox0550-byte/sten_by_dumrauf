import { Brain, FileText, Sparkles, Wrench } from 'lucide-react';
import type { AskStep } from './AskSteps';

const icons = {
  docs: FileText,
  memory: Brain,
  tool: Wrench,
  llm: Sparkles,
} as const;

export interface StepRowProps {
  step: AskStep;
}

export function StepRow({ step }: StepRowProps) {
  const Icon = icons[step.kind];
  const hasStatus = step.kind === 'tool' && step.ok !== undefined;
  const statusClass = step.ok ? 'step-row__dot--ok' : 'step-row__dot--warn';
  const statusLabel = step.ok ? 'успех' : 'предупреждение';

  return (
    <div className={`step-row step-row--${step.kind}`}>
      <div className="step-row__icon-wrap">
        {hasStatus && (
          <span className={`step-row__dot ${statusClass}`} role="img" aria-label={statusLabel} title={statusLabel} />
        )}
        <Icon className="step-row__icon" size={14} aria-hidden="true" data-testid={`step-icon-${step.kind}`} />
      </div>
      <div className="step-row__body">
        <div className="step-row__label">
          {step.label}
          {step.kind === 'tool' && step.name && <span className="step-row__tech">{step.name}</span>}
        </div>
        {step.detail && <div className="step-row__detail">{step.detail}</div>}
      </div>
      <span className="step-row__ms">{step.ms === undefined ? '' : formatStepDuration(step.ms)}</span>
    </div>
  );
}

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export default StepRow;
