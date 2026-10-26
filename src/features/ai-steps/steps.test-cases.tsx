import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskSteps, formatDuration, getStepsBodyClassName, normalizeAskSteps, pluralizeRu, type AskStep } from './AskSteps';
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

  it('shows a compact completion summary with formatted duration', () => {
    const html = markup(createElement(AskSteps, { steps, totalMs: 12180 }));
    expect(html).toContain('Готово за 12,2 с · 4 шага');
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
  });

  it('uses correct Russian step-count forms', () => {
    expect(markup(createElement(AskSteps, { steps: steps.slice(0, 3) }))).toContain('3 шага');
    expect(markup(createElement(AskSteps, { steps: steps.slice(0, 1) }))).toContain('1 шаг');
    expect(markup(createElement(AskSteps, { steps: [...steps, ...steps.slice(0, 1)] }))).toContain('5 шагов');
  });

  it('is collapsed by default and uses native details disclosure', () => {
    const html = markup(createElement(AskSteps, { steps }));
    expect(html).toContain('<details class="ai-steps"');
    expect(html).not.toContain(' open');
    expect(html).toContain('aria-label="Детали обработки"');
  });

  it('renders an accessible summary control and chevron', () => {
    const html = markup(createElement(AskSteps, { steps }));
    expect(html).toContain('<summary class="ai-steps__summary-row">');
    expect(html).toContain('aria-label="Ход обработки запроса"');
    expect(html).toContain('ai-steps__chevron');
  });

  it('uses the completed fallback when totalMs is undefined', () => {
    expect(markup(createElement(AskSteps, { steps }))).toContain('Готово · 4 шага');
    expect(markup(createElement(AskSteps, { steps }))).toContain('4 шага');
  });

  it('formats duration boundaries as specified', () => {
    expect(formatDuration(0)).toBe('0 мс');
    expect(formatDuration(340)).toBe('340 мс');
    expect(formatDuration(1200)).toBe('1,2 с');
    expect(formatDuration(12180)).toBe('12,2 с');
    expect(formatDuration(65400)).toBe('1 мин 5 с');
    expect(formatDuration(undefined)).toBe('—');
  });


  it('normalizes unknown server step kinds instead of passing undefined icons to React', () => {
    const unsafeSteps = [
      { kind: 'future_step', label: 'Новый этап', detail: 'Проверка совместимости', ms: 25, ok: true },
      null,
      { kind: 'tool', name: 'get_pnl', ms: Number.NaN },
    ];
    const normalized = normalizeAskSteps(unsafeSteps);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      kind: 'tool',
      label: 'Новый этап',
      name: 'Новый этап',
      detail: 'Проверка совместимости',
      ms: 25,
      ok: true,
    });
    expect(normalized[1].ms).toBeUndefined();
    expect(markup(createElement(AskSteps, { steps: unsafeSteps as unknown as AskStep[] }))).toContain('step-icon-tool');
    expect(markup(createElement(AskSteps, { steps: unsafeSteps as unknown as AskStep[] }))).toContain('Новый этап');
  });

  it('renders a safe fallback icon when StepRow receives an unknown kind directly', () => {
    const html = markup(createElement(StepRow, {
      step: { kind: 'future_step', label: 'Новый этап' } as unknown as AskStep,
    }));
    expect(html).toContain('data-testid="step-icon-tool"');
    expect(html).toContain('Новый этап');
  });

  it('ignores non-object step entries and invalid top-level payloads', () => {
    expect(normalizeAskSteps(null)).toEqual([]);
    expect(normalizeAskSteps({ steps: [] })).toEqual([]);
    expect(normalizeAskSteps([null, undefined, 'bad', 42, []])).toEqual([]);
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
    expect(html).toContain('step-row__dot--danger');
    expect(html).toContain('aria-label="ошибка"');
  });

  it('renders the llm icon and success status dot for a successful tool', () => {
    expect(markup(createElement(StepRow, { step: { kind: 'llm', label: 'Ответ' } }))).toContain('data-testid="step-icon-llm"');
    const html = markup(createElement(StepRow, { step: { kind: 'tool', label: 'Получено', ok: true } }));
    expect(html).toContain('step-row__dot--ok');
    expect(html).toContain('aria-label="успешно"');
  });

  it('formats step duration and shows tool technical details', () => {
    const html = markup(createElement(StepRow, { step: { kind: 'tool', label: 'Получен P&L', name: 'get_pnl', detail: 'period=2026-10', ms: 340 } }));
    expect(html).toContain('340 мс');
    expect(html).toContain('get_pnl');
    expect(html).toContain('period=2026-10');
    expect(markup(createElement(StepRow, { step: { kind: 'tool', label: 'Запрос', ms: 12180 } }))).toContain('12,2 с');
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


describe('AskSteps API payload labels', () => {
  it('renders labels from kind and name without requiring a label field', () => {
    const html = markup(createElement(StepRow, { step: { kind: 'llm', name: 'plan', ok: true, ms: 1200 } }));
    expect(html).toContain('LLM: план');
    expect(html).toContain('step-row__dot--ok');
  });

  it('shows the unsupported FOT scope badge', () => {
    const html = markup(createElement(StepRow, { step: { kind: 'tool', name: 'find_deviations', detail: 'FOT_SCOPE_NOT_IMPLEMENTED' } }));
    expect(html).toContain('не реализовано');
  });
});
