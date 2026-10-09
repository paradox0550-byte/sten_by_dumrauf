import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskSteps, formatDuration, getStepsBodyClassName, pluralizeRu, type AskStep } from './AskSteps';
import { StepRow } from './StepRow';

const steps: AskStep[] = [
  { kind: 'memory', label: 'Подтянуто 6 записей из памяти', detail: '4 подтверждённые записи', ms: 12 },
  { kind: 'docs', label: 'Загружено 2 документа в контекст', ms: 340 },
  { kind: 'tool', name: 'get_pnl', label: 'Получен P&L за октябрь', detail: 'period=2026-10', ms: 12180, ok: true },
  { kind: 'llm', label: 'Ответ сгенерирован', ms: 640 },
];

function markup(node: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(node);
}

describe('AskSteps processing timeline', () => {
  it('renders nothing when steps are undefined', () => {
    expect(markup(createElement(AskSteps, { steps: undefined }))).toBe('');
  });

  it('renders nothing when steps is empty', () => {
    expect(markup(createElement(AskSteps, { steps: [] }))).toBe('');
  });

  it('shows formatted total duration in the header', () => {
    const html = markup(createElement(AskSteps, { steps, totalMs: 12180 }));
    expect(html).toContain('Обработка заняла 12 s');
  });

  it('uses correct Russian step-count forms', () => {
    expect(markup(createElement(AskSteps, { steps: steps.slice(0, 3) }))).toContain('3 шага');
    expect(markup(createElement(AskSteps, { steps: steps.slice(0, 1) }))).toContain('1 шаг');
    expect(markup(createElement(AskSteps, { steps: [...steps, ...steps.slice(0, 1)] }))).toContain('5 шагов');
  });

  it('is collapsed by default and keeps the region out of the markup', () => {
    const html = markup(createElement(AskSteps, { steps }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Ход обработки"');
  });

  it('renders a native button header with an accessible control relationship', () => {
    const html = markup(createElement(AskSteps, { steps }));
    expect(html).toContain('<button');
    expect(html).toContain('aria-controls="');
    expect(html).toContain('data-testid="ai-steps-chevron"');
  });

  it('uses the completed fallback when totalMs is undefined', () => {
    expect(markup(createElement(AskSteps, { steps }))).toContain('Обработка завершена · 4 шага');
  });

  it('formats duration boundaries as specified', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(340)).toBe('340 ms');
    expect(formatDuration(1200)).toBe('1 s');
    expect(formatDuration(12180)).toBe('12 s');
    expect(formatDuration(65400)).toBe('1m 5s');
    expect(formatDuration(undefined)).toBe('—');
  });

  it('renders the docs icon', () => {
    expect(markup(createElement(StepRow, { step: { kind: 'docs', label: 'Документы' } }))).toContain('data-testid="step-icon-docs"');
  });

  it('renders the memory icon', () => {
    expect(markup(createElement(StepRow, { step: { kind: 'memory', label: 'Память' } }))).toContain('data-testid="step-icon-memory"');
  });

  it('renders the tool icon and warning status dot', () => {
    const html = markup(createElement(StepRow, { step: { kind: 'tool', label: 'Ошибка инструмента', name: 'get_pnl', ok: false } }));
    expect(html).toContain('data-testid="step-icon-tool"');
    expect(html).toContain('step-row__dot--warn');
    expect(html).toContain('aria-label="предупреждение"');
  });

  it('renders the llm icon and success status dot for a successful tool', () => {
    expect(markup(createElement(StepRow, { step: { kind: 'llm', label: 'Ответ' } }))).toContain('data-testid="step-icon-llm"');
    const html = markup(createElement(StepRow, { step: { kind: 'tool', label: 'Получено', ok: true } }));
    expect(html).toContain('step-row__dot--ok');
    expect(html).toContain('aria-label="успех"');
  });

  it('formats step duration and shows tool technical details', () => {
    const html = markup(createElement(StepRow, { step: { kind: 'tool', label: 'Получен P&L', name: 'get_pnl', detail: 'period=2026-10', ms: 340 } }));
    expect(html).toContain('340 ms');
    expect(html).toContain('get_pnl');
    expect(html).toContain('period=2026-10');
    expect(markup(createElement(StepRow, { step: { kind: 'tool', label: 'Запрос', ms: 12180 } }))).toContain('12 s');
  });

  it('enables the scroll class only when there are more than six steps', () => {
    expect(getStepsBodyClassName(6)).toBe('ai-steps__body');
    expect(getStepsBodyClassName(7)).toBe('ai-steps__body ai-steps__body--scroll');
  });

  it('pluralizes 1, 2, 4, 5, 11, 21, 22 and 25 correctly', () => {
    const form = (n: number) => pluralizeRu(n, 'шаг', 'шага', 'шагов');
    expect([1, 2, 4, 5, 11, 21, 22, 25].map(form)).toEqual(['шаг', 'шага', 'шага', 'шагов', 'шагов', 'шаг', 'шага', 'шагов']);
  });
});
