import { CheckCircle2, ChevronDown } from 'lucide-react';
import { StepRow } from './StepRow';
import './steps.css';

export type AskStepKind = 'docs' | 'memory' | 'tool' | 'llm';
export interface AskStep { kind: AskStepKind; label?: string; detail?: string; ms?: number; name?: string; ok?: boolean; }
export interface AskStepsProps { steps?: AskStep[]; totalMs?: number; className?: string; }

const stepKinds = new Set<unknown>(['docs', 'memory', 'tool', 'llm']);

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The API payload is runtime data, even when TypeScript describes its shape.
 * Normalize it before rendering so a new/invalid step kind cannot pass an
 * undefined component to React and take down the entire workspace.
 */
export function normalizeAskSteps(input: unknown): AskStep[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate): AskStep[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];

    const raw = candidate as Record<string, unknown>;
    const kind = raw.kind;
    const label = optionalString(raw.label);
    const detail = optionalString(raw.detail);
    const name = optionalString(raw.name);
    const ms = typeof raw.ms === 'number' && Number.isFinite(raw.ms) && raw.ms >= 0 ? raw.ms : undefined;
    const ok = typeof raw.ok === 'boolean' ? raw.ok : undefined;

    if (stepKinds.has(kind)) {
      return [{
        kind: kind as AskStepKind,
        ...(label !== undefined ? { label } : {}),
        ...(detail !== undefined ? { detail } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(ms !== undefined ? { ms } : {}),
        ...(ok !== undefined ? { ok } : {}),
      }];
    }

    // Keep useful information from a future server step while rendering it
    // through the known, safe tool icon and CSS variant.
    return [{
      kind: 'tool',
      label: label || 'Этап обработки',
      name: name || 'Неизвестный этап',
      detail: detail || 'Тип этапа не распознан; остальная работа STEN продолжается.',
      ...(ms !== undefined ? { ms } : {}),
      ...(ok !== undefined ? { ok } : {}),
    }];
  });
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
  const safeSteps = normalizeAskSteps(steps);
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
