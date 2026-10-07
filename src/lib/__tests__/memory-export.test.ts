import { describe, expect, it } from 'vitest';
import { buildMemoryFilename, buildMemoryMarkdown } from '../memory-export';
import type { Memory } from '../contracts/memory';

const baseMemory: Memory = {
  id: 'memory-1',
  organization_id: 'org-1',
  project_id: 'project-1',
  branch_id: 'branch-1',
  restaurant_id: 'restaurant-1',
  department_id: 'department-1',
  kind: 'fact',
  title: 'ФОТ превышает план',
  content: 'ФОТ за октябрь 2026 = 2 840 000 ₽. 🔥',
  evidence_json: {},
  confidence: 'confirmed',
  confirmed_by_user_id: 'user-1',
  confirmed_at: '2026-10-07T19:23:00.000Z',
  created_by: 'user-1',
  created_at: '2026-10-05T14:12:00.000Z',
  updated_at: '2026-10-07T19:23:00.000Z',
};

describe('memory export', () => {
  it('exports an empty memory list with frontmatter and empty marker', () => {
    const md = buildMemoryMarkdown([], { exportedAt: '2026-10-07T22:45:00.000Z', total: 0 });
    expect(md).toContain('---');
    expect(md).toContain('title: Память STEN');
    expect(md).toContain('generator: STEN Memory Export v1');
    expect(md).toContain('_Память пуста._');
  });

  it('renders kind label and confidence metadata', () => {
    const md = buildMemoryMarkdown([baseMemory], { exportedAt: '2026-10-07T22:45:00.000Z', total: 1 });
    expect(md).toContain('## Факт: ФОТ превышает план');
    expect(md).toContain('- **Kind:** fact');
    expect(md).toContain('- **Confidence:** confirmed');
  });

  it('separates two memory sections with the canonical delimiter', () => {
    const second = { ...baseMemory, id: 'memory-2', kind: 'decision' as const, title: 'Изменить график' };
    const md = buildMemoryMarkdown([baseMemory, second], { exportedAt: '2026-10-07T22:45:00.000Z', total: 2 });
    expect(md).toContain('## Факт: ФОТ превышает план\n\n- **Kind:** fact');
    expect(md).toContain('## Решение: Изменить график');
    expect(md.match(/\n\n---\n\n/g)).toHaveLength(2);
  });

  it('renders non-empty evidence inside a details block', () => {
    const memory = { ...baseMemory, evidence_json: { source: 'pnl', deviation: 8.8 } };
    const md = buildMemoryMarkdown([memory], { exportedAt: '2026-10-07T22:45:00.000Z', total: 1 });
    expect(md).toContain('<details>');
    expect(md).toContain('<summary>Evidence</summary>');
    expect(md).toContain('```json');
    expect(md).toContain('"deviation": 8.8');
  });

  it('omits the evidence block for an empty object', () => {
    const md = buildMemoryMarkdown([baseMemory], { exportedAt: '2026-10-07T22:45:00.000Z', total: 1 });
    expect(md).not.toContain('<details>');
  });

  it('builds the organization/date filename', () => {
    const filename = buildMemoryFilename('7a776df0-bd68-4754-9741-1709357d0f4c');
    expect(filename).toMatch(/^sten-memory-7a776df0-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('preserves unicode, emoji and content without truncation', () => {
    const content = 'Продуктивность выросла на 12,5% — команда 🚀\nВторая строка сохраняется.';
    const memory = { ...baseMemory, content };
    const md = buildMemoryMarkdown([memory], { exportedAt: '2026-10-07T22:45:00.000Z', total: 1 });
    expect(md).toContain(content);
  });
});