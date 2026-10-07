import type { Memory, MemoryFilters } from './contracts/memory';
import { MEMORY_KIND_LABEL } from './contracts/memory';

function yamlString(value: string): string {
  return /[:#]/.test(value) ? JSON.stringify(value) : value;
}

function renderFilters(filters?: MemoryFilters): string[] {
  if (!filters) return [];
  const entries: Array<[string, string | number | undefined]> = [
    ['kind', filters.kind],
    ['confidence', filters.confidence],
    ['restaurant_id', filters.restaurant_id],
    ['since', filters.since],
  ];
  const present = entries.filter(([, value]) => value !== undefined && value !== '');
  if (!present.length) return [];
  return ['filters:', ...present.map(([key, value]) => '  ' + key + ': ' + yamlString(String(value)))];
}

function hasEvidence(memory: Memory): boolean {
  return Boolean(memory.evidence_json && Object.keys(memory.evidence_json).length > 0);
}

function renderMemory(memory: Memory): string {
  const lines = [
    '## ' + (MEMORY_KIND_LABEL[memory.kind] ?? memory.kind) + ': ' + memory.title,
    '',
    '- **Kind:** ' + memory.kind,
    '- **Confidence:** ' + memory.confidence,
  ];

  if (memory.restaurant_id) lines.push('- **Restaurant:** ' + memory.restaurant_id);
  if (memory.confirmed_at) lines.push('- **Confirmed at:** ' + memory.confirmed_at);
  lines.push('- **Created:** ' + memory.created_at, '', memory.content);

  if (hasEvidence(memory)) {
    lines.push(
      '',
      '<details>',
      '<summary>Evidence</summary>',
      '',
      '```json',
      JSON.stringify(memory.evidence_json, null, 2),
      '```',
      '',
      '</details>',
    );
  }

  return lines.join('\n');
}

export function buildMemoryMarkdown(
  memories: Memory[],
  meta: {
    organizationName?: string;
    exportedAt: string;
    filters?: MemoryFilters;
    total: number;
  },
): string {
  const organization = meta.organizationName || 'STEN';
  const frontmatter = [
    '---',
    'title: Память STEN',
    'organization: ' + yamlString(organization),
    'exported_at: ' + meta.exportedAt,
    'total: ' + meta.total,
    ...renderFilters(meta.filters),
    'generator: STEN Memory Export v1',
    '---',
  ];

  const intro = [
    '# Память STEN',
    '',
    'Экспортировано из STEN. Формат совместим с Obsidian.',
    '',
    'Всего записей: **' + meta.total + '**.',
  ];

  if (!memories.length) return [...frontmatter, '', ...intro, '', '_Память пуста._'].join('\n');

  return [...frontmatter, '', ...intro, '', '---', '', memories.map(renderMemory).join('\n\n---\n\n')].join('\n');
}

export function buildMemoryFilename(organizationId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return 'sten-memory-' + organizationId.slice(0, 8) + '-' + year + '-' + month + '-' + day + '.md';
}