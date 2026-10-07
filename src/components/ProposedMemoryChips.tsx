import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { createMemory } from '../lib/api';
import { useScope } from '../lib/useScope';
import type { ProposedMemory } from '../lib/contracts/memory';

interface Props {
  items: ProposedMemory[];
  onResolve: (index: number) => void;
  messageId: string;
}

const kindLabel: Record<ProposedMemory['kind'], string> = {
  fact: 'Факт',
  decision: 'Решение',
  cause: 'Причина',
  action: 'Действие',
  manager_note: 'Заметка',
  pattern: 'Паттерн',
};

export default function ProposedMemoryChips({ items, onResolve, messageId }: Props) {
  const [scope] = useScope();
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const resolve = async (index: number, item: ProposedMemory) => {
    setBusy(index);
    setToast(null);
    try {
      await createMemory({
        scope: {
          project_id: scope.projectId ?? null,
          branch_id: scope.branchId ?? null,
          restaurant_id: scope.restaurantId ?? null,
          department_id: scope.departmentId ?? null,
        },
        kind: item.kind,
        title: item.title,
        content: item.content,
        evidence: item.evidence ?? {},
      });
      setToast('Сохранено в память');
      window.setTimeout(() => onResolve(index), 900);
    } catch {
      setToast('Не удалось. Повторить');
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return null;

  return (
    <section className="proposed-memory" aria-label="Предложения памяти" data-message-id={messageId}>
      <div className="proposed-memory__head">
        <b>Предложение памяти</b>
        <span>Сохраните только то, что действительно стоит помнить.</span>
      </div>
      <div className="proposed-memory__list">
        {items.map((item, index) => (
          <article className="proposed-memory__chip" key={item.title + index}>
            <div className="proposed-memory__meta">
              <span className="badge badge--brand">{kindLabel[item.kind]}</span>
            </div>
            <strong>{item.title}</strong>
            <p>{item.content}</p>
            <div className="proposed-memory__actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy !== null}
                onClick={() => void resolve(index, item)}
                aria-label={'Сохранить предложение памяти: ' + item.title}
              >
                <Check size={14} /> Сохранить
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy !== null}
                onClick={() => onResolve(index)}
                aria-label={'Пропустить предложение памяти: ' + item.title}
              >
                <X size={14} /> Пропустить
              </button>
            </div>
          </article>
        ))}
      </div>
      {toast && <div className="proposed-memory__toast" role="status" aria-live="polite">{toast}</div>}
    </section>
  );
}
