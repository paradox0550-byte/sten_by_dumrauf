import { Brain, FileText, Sparkles, Wrench } from 'lucide-react';
import type { AskStep, AskStepKind } from './AskSteps';

const icons = {
  docs: FileText,
  memory: Brain,
  tool: Wrench,
  llm: Sparkles,
} as const;

export interface StepRowProps {
  step: AskStep;
}

function stepLabel(step: AskStep, kind: AskStepKind): string {
  switch (kind) {
    case 'memory': return step.label || 'Память';
    case 'docs': return step.label || 'Документы';
    case 'tool': return step.name || step.label || 'Инструмент';
    case 'llm': return step.label || `LLM: ${step.name === 'plan' ? 'план' : 'ответ'}`;
    default: return step.label || 'Этап обработки';
  }
}

export function StepRow({ step }: StepRowProps) {
  // Keep this component defensive too: it may be rendered independently of
  // AskSteps, and API payloads can drift from the compile-time TypeScript type.
  const rawKind = (step as { kind?: unknown } | null)?.kind;
  const isKnownKind = typeof rawKind === 'string' && Object.prototype.hasOwnProperty.call(icons, rawKind);
  const kind: AskStepKind = isKnownKind ? rawKind as AskStepKind : 'tool';
  const Icon = icons[kind] ?? Sparkles;
  const label = stepLabel(step, kind);
  const hasStatus = typeof step.ok === 'boolean';
  const statusClass = step.ok ? 'step-row__dot--ok' : 'step-row__dot--danger';
  const statusLabel = step.ok ? 'успешно' : 'ошибка';
  const detail = typeof step.detail === 'string' ? step.detail : undefined;
  const duration = typeof step.ms === 'number' && Number.isFinite(step.ms) && step.ms >= 0 ? step.ms : undefined;
  const unsupportedScope = detail?.includes('FOT_SCOPE_NOT_IMPLEMENTED') ?? false;

  return (
    <div className={`step-row step-row--${kind}`}>
      <div className="step-row__icon-wrap">
        {hasStatus && (
          <span className={`step-row__dot ${statusClass}`} role="img" aria-label={statusLabel} title={statusLabel} />
        )}
        <Icon className="step-row__icon" size={14} aria-hidden="true" data-testid={`step-icon-${kind}`} />
      </div>
      <div className="step-row__body">
        <div className="step-row__label">
          {label}
          {unsupportedScope && <span className="step-row__badge">не реализовано</span>}
        </div>
        {detail && <div className="step-row__detail">{detail}</div>}
      </div>
      <span className="step-row__ms">{duration === undefined ? '' : formatStepDuration(duration)}</span>
    </div>
  );
}

function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60000) return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} с`;
  return `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`;
}

export default StepRow;
