import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ladar } from './Ladar';

describe('Ladar accessible presentation', () => {
  it('provides a readable status and no action when there is no explanation', () => {
    const html = renderToStaticMarkup(<Ladar size={24} status={{ source: 'server', state: 'deviation', confirmed: false, explanation: 'Не подтверждено' }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Наблюдение');
    expect(html).not.toContain('<button');
  });

  it('uses a text label for confirmed deviations and exposes an action only with an explanation', () => {
    const html = renderToStaticMarkup(<Ladar size={32} status={{ source: 'server', state: 'deviation', confirmed: true, explanation: 'Факт выше плана' }} explanationTargetId="explanation" />);
    expect(html).toContain('Подтверждённое отклонение');
    expect(html).toContain('<button');
    expect(html).toContain('Открыть объяснение');
  });

  it('renders the four visual states and supported size contract', () => {
    const states = ['idle', 'analyzing', 'deviation', 'complete'] as const;
    for (const state of states) {
      const html = renderToStaticMarkup(<Ladar size={48} status={{ source: 'server', state, confirmed: state === 'deviation', explanation: state === 'deviation' ? 'Причина' : undefined }} />);
      expect(html).toContain(`sten-ladar--${state}`);
      expect(html).toContain('width="48"');
    }
  });

  it('includes reduced-motion handling and contains no scanning-line animation', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/ladar/ladar.css'), 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
    expect(css).not.toMatch(/scan[-_ ]?line|keyframes[^}]*scan/i);
  });
});
