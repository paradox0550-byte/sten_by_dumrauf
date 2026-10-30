import type { CSSProperties } from 'react';
import { useLadarState, type LadarServerStatus } from './useLadarState';
import './ladar.css';

export interface LadarProps {
  status?: LadarServerStatus | null;
  size?: 24 | 32 | 48;
  className?: string;
  onExplain?: () => void;
  explanationTargetId?: string;
}

const labels = {
  idle: 'Наблюдение',
  analyzing: 'Идёт анализ',
  deviation: 'Подтверждённое отклонение',
  complete: 'Анализ завершён',
} as const;

export function Ladar({ status, size = 32, className, onExplain, explanationTargetId }: LadarProps) {
  const state = useLadarState(status);
  const explanation = state === 'deviation' ? status?.explanation?.trim() : '';
  const canExplain = Boolean(explanation && (onExplain || explanationTargetId));
  const handleExplain = () => {
    if (!canExplain) return;
    onExplain?.();
    if (explanationTargetId) {
      const target = document.getElementById(explanationTargetId);
      target?.focus();
      target?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };

  return (
    <span className={`sten-ladar sten-ladar--${state} ${className ?? ''}`.trim()} style={{ '--ladar-size': `${size}px` } as CSSProperties}>
      <svg className="sten-ladar__glyph" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="sten-ladar__orbit" cx="24" cy="24" r="18" />
        <path className="sten-ladar__eye" d="M5.5 24c4.7-7.1 11-10.7 18.5-10.7S37.8 16.9 42.5 24C37.8 31.1 31.5 34.7 24 34.7S10.2 31.1 5.5 24Z" />
        <circle className="sten-ladar__iris" cx="24" cy="24" r="7.2" />
        <circle className="sten-ladar__pupil" cx="24" cy="24" r="3" />
        {state === 'deviation' && <circle className="sten-ladar__signal" cx="38.5" cy="9.5" r="3" />}
        {state === 'complete' && <path className="sten-ladar__check" d="m18.5 24.2 3.7 3.7 7.5-8" />}
      </svg>
      {canExplain ? (
        <button type="button" className="sten-ladar__label sten-ladar__label--action" onClick={handleExplain} aria-label={`${labels[state]}. Открыть объяснение`}>
          {labels[state]}
        </button>
      ) : (
        <span className="sten-ladar__label" role="status" aria-live="polite">{labels[state]}</span>
      )}
    </span>
  );
}

export default Ladar;
