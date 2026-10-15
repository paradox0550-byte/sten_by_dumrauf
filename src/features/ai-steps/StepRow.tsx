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

function stepLabel(step: AskStep): string {
  switch (step.kind) {
    case 'memory': return 'Память';
    case 'docs': return 'Документы';
    case 'tool': return step.name || step.label || 'Инструмент';
    case 'llm': return `LLM: ${step.name === 'plan' ? 'план' : 'ответ'}`;
  }
}

export function StepRow({ step }: StepRowProps) {
  const Icon = icons[step.kind];
  const hasStatus = step.ok !== undefined;
  const statusClass = step.ok ? 'step-row__dot--ok' : 'step-row__dot--danger';
  const statusLabel = step.ok ? 'успешно' : 'ошибка';
  const unsupportedScope = step.detail?.includes('FOT_SCOPE_NOT_IMPLEMENTED') ?? false;

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
          {stepLabel(step)}
          {unsupportedScope && <span className="step-row__badge">не реализовано</span>}
        </div>
        {step.detail && <div className="step-row__detail">{step.detail}</div>}
      </div>
      <span className="step-row__ms">{step.ms === undefined ? '' : formatStepDuration(step.ms)}</span>
    </div>
  );
}

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60000) return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} с`;
  return `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`;
}

export default StepRow;
