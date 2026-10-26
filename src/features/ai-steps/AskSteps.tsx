import { CheckCircle2, ChevronDown } from 'lucide-react';
import { StepRow } from './StepRow';
import './steps.css';

export type AskStepKind = 'docs' | 'memory' | 'tool' | 'llm';
export interface AskStep { kind: AskStepKind; label?: string; detail?: string; ms?: number; name?: string; ok?: boolean; }
export interface AskStepsProps { steps?: AskStep[]; totalMs?: number; className?: string; }

const stepKinds = new Set<AskStepKind>(['docs', 'memory', 'tool', 'llm']);

/** Normalize untrusted API payloads before they reach React component selection. */
export function normalizeAskStep(value: unknown): AskStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawKind = typeof raw.kind === 'string' ? raw.kind : '';
  const kind: AskStepKind = stepKinds.has(rawKind as AskStepKind) ? rawKind as AskStepKind : 'tool';
  const label = typeof raw.label === 'string'
    ? raw.label
    : rawKind && rawKind !== kind
      ? `Этап обработки: ${rawKind}`
      : undefined;
  const ms = typeof raw.ms === 'number' && Number.isFinite(raw.ms) && raw.ms >= 0 ? raw.ms : undefined;
  return {
    kind,
    ...(label ? { label } : {}),
    ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
    ...(ms !== undefined ? { ms } : {}),
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    ...(typeof raw.ok === 'boolean' ? { ok: raw.ok } : {}),
  };
}

export function normalizeAskSteps(value: unknown): AskStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.map(normalizeAskStep).filter((step): step is AskStep => step !== null);
  return steps.length ? steps : undefined;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60000) return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} с`;
  return `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`;
}
export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const value = Math.abs(Math.trunc(n)); const n10 = value % 10; const n100 = value % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}
export function getStepsBodyClassName(count: number): string { return `ai-steps__body${count > 6 ? ' ai-steps__body--scroll' : ''}`; }

export function AskSteps({ steps, totalMs, className }: AskStepsProps) {
  const safeSteps = normalizeAskSteps(steps) ?? [];
  if (!safeSteps.length) return null;
  const rootClass = ['ai-steps', className].filter(Boolean).join(' ');
  const duration = formatDuration(totalMs);
  const summary = duration !== '—'
    ? `Готово за ${duration} · ${safeSteps.length} ${pluralizeRu(safeSteps.length, 'шаг', 'шага', 'шагов')}`
    : `Готово · ${safeSteps.length} ${pluralizeRu(safeSteps.length, 'шаг', 'шага', 'шагов')}`;

  return (
    <details className={rootClass} aria-label="Ход обработки запроса">
      <summary className="ai-steps__summary-row">
        <CheckCircle2 size={14} aria-hidden="true" className="ai-steps__success" />
        <span className="ai-steps__summary-text">{summary}</span>
        <ChevronDown size={14} aria-hidden="true" className="ai-steps__chevron" />
      </summary>
      <div className={getStepsBodyClassName(safeSteps.length)} aria-label="Детали обработки">
        {safeSteps.map((step, index) => (
          <div className="ai-steps__item" key={`${step.kind}-${step.name ?? step.label ?? index}-${index}`}>
            <span className="ai-steps__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <StepRow step={step} />
          </div>
        ))}
      </div>
    </details>
  );
}
export default AskSteps;
