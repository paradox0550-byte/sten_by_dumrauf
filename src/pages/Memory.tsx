import { useEffect, useMemo, useState } from 'react';
import { Brain, MoreHorizontal, Search, Trash2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, deleteMemory, listMemory, updateMemoryConfidence } from '../lib/api';
import { useScope } from '../lib/useScope';
import type { Memory, MemoryConfidence, MemoryFilters, MemoryKind } from '../lib/contracts/memory';

const kinds: Array<{ value: MemoryKind | ''; label: string }> = [
  { value: '', label: 'Все' }, { value: 'fact', label: 'fact' }, { value: 'decision', label: 'decision' },
  { value: 'cause', label: 'cause' }, { value: 'action', label: 'action' }, { value: 'manager_note', label: 'manager_note' },
  { value: 'pattern', label: 'pattern' },
];
const confidences: Array<{ value: MemoryConfidence | ''; label: string }> = [
  { value: '', label: 'Все' }, { value: 'confirmed', label: 'confirmed' },
  { value: 'unconfirmed', label: 'unconfirmed' }, { value: 'rejected', label: 'rejected' },
];
const kindBadge: Record<MemoryKind, string> = {
  fact: 'brand', decision: 'success', cause: 'warning', action: 'neutral', manager_note: 'neutral', pattern: 'neutral',
};
const confidenceBadge: Record<MemoryConfidence, string> = { confirmed: 'success', unconfirmed: 'neutral', rejected: 'danger' };
const kindLabel: Record<MemoryKind, string> = {
  fact: 'Факт', decision: 'Решение', cause: 'Причина', action: 'Действие', manager_note: 'Заметка', pattern: 'Паттерн',
};
const confidenceLabel: Record<MemoryConfidence, string> = {
  confirmed: 'Подтверждено', unconfirmed: 'Не подтверждено', rejected: 'Отклонено',
};

type Restaurant = { id: string; name: string; kind?: string };

function extractRestaurants(value: unknown): Restaurant[] {
  const raw = (value as { restaurants?: unknown; context?: { restaurants?: unknown } } | null)?.restaurants
    ?? (value as { context?: { restaurants?: unknown } } | null)?.context?.restaurants;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Restaurant => {
    const x = item as Record<string, unknown>;
    return typeof x?.id === 'string' && typeof x?.name === 'string';
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Memory() {
  const navigate = useNavigate();
  const [scope] = useScope();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [kind, setKind] = useState<MemoryKind | ''>('');
  const [confidence, setConfidence] = useState<MemoryConfidence | ''>('confirmed');
  const [restaurantId, setRestaurantId] = useState('');
  const [since, setSince] = useState('');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const filters = useMemo<MemoryFilters>(() => ({
    ...(kind ? { kind } : {}),
    ...(confidence ? { confidence } : {}),
    ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    ...(since ? { since } : {}),
    limit,
  }), [kind, confidence, restaurantId, since, limit]);

  const load = async () => {
    setLoading(true);
    try {
      const [memoryResponse, contextResponse] = await Promise.all([
        listMemory(filters),
        api.get<unknown>('/api/b2b/context'),
      ]);
      setMemories(memoryResponse.memories ?? []);
      setRestaurants(extractRestaurants(contextResponse));
      setToast(null);
    } catch {
      setToast('Не удалось. Повторить');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [kind, confidence, restaurantId, since, limit]);

  useEffect(() => {
    if (scope.restaurantId && !restaurantId) setRestaurantId(scope.restaurantId);
  }, [scope.restaurantId]);

  const update = async (id: string, next: 'confirmed' | 'rejected') => {
    try {
      const updated = await updateMemoryConfidence(id, next);
      setMemories(current => current.map(item => item.id === id ? updated : item));
      setToast(next === 'confirmed' ? 'Память подтверждена' : 'Память отклонена');
    } catch {
      setToast('Не удалось. Повторить');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories(current => current.filter(item => item.id !== id));
      setMenuId(null);
      setToast('Память удалена');
    } catch {
      setToast('Не удалось. Повторить');
    }
  };

  const renderFilters = (
    title: string,
    values: Array<{ value: string; label: string }>,
    selected: string,
    onSelect: (value: string) => void,
  ) => (
    <div className="memory-filter-group" role="group" aria-label={title}>
      <span>{title}</span>
      <div className="memory-filter-chips">
        {values.map(option => (
          <button type="button" key={option.value || 'all'} className={'memory-filter-chip' + (selected === option.value ? ' active' : '')} onClick={() => onSelect(option.value)} aria-pressed={selected === option.value}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page memory-page">
      <div className="memory-page__inner">
        <header className="page-head">
          <div>
            <span className="eyebrow"><Brain size={14} /> MEMORY · КОНТЕКСТ</span>
            <h1>Память STEN</h1>
            <p>Что система помнит о вашем ресторане</p>
          </div>
        </header>

        <section className="memory-filters" aria-label="Фильтры памяти">
          {renderFilters('Kind', kinds, kind, value => setKind(value as MemoryKind | ''))}
          {renderFilters('Confidence', confidences, confidence, value => setConfidence(value as MemoryConfidence | ''))}
          <label className="memory-filter-field">
            <span>Restaurant</span>
            <select value={restaurantId} onChange={event => setRestaurantId(event.target.value)} aria-label="Ресторан памяти">
              <option value="">Все рестораны</option>
              {restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="memory-filter-field">
            <span>Since</span>
            <input type="date" value={since} onChange={event => setSince(event.target.value)} aria-label="Память с даты" />
          </label>
          <label className="memory-filter-field memory-filter-field--limit">
            <span>Limit</span>
            <select value={limit} onChange={event => setLimit(Number(event.target.value))} aria-label="Количество записей памяти">
              {[20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </section>

        <main className="memory-list" aria-live="polite">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div className="memory-card memory-card--skeleton" key={index}><span/><span/><span/></div>) :
            memories.length ? memories.map(memory => (
              <article className="memory-card" key={memory.id}>
                <div className="memory-card__top">
                  <div className="memory-card__badges">
                    <span className={'badge badge--' + kindBadge[memory.kind]}>{kindLabel[memory.kind]}</span>
                    <span className={'badge badge--' + confidenceBadge[memory.confidence]}>{confidenceLabel[memory.confidence]}</span>
                  </div>
                  <div className="memory-card__menu">
                    <button type="button" className="icon-button compact" aria-label={'Меню памяти: ' + memory.title} aria-expanded={menuId === memory.id} onClick={() => setMenuId(menuId === memory.id ? null : memory.id)}><MoreHorizontal size={16} /></button>
                    {menuId === memory.id && <div className="memory-card__menu-popover">
                      <button type="button" onClick={() => void remove(memory.id)}><Trash2 size={14} /> Удалить</button>
                    </div>}
                  </div>
                </div>
                <h2>{memory.title}</h2>
                <p className="memory-card__content">{memory.content}</p>
                <div className="memory-card__meta">
                  <span>{formatDate(memory.created_at)}</span>
                  {memory.restaurant_id && <span>{memory.restaurant_id}</span>}
                </div>
                <div className="memory-card__actions">
                  {memory.confidence === 'unconfirmed' && <>
                    <button type="button" className="secondary-button" onClick={() => void update(memory.id, 'confirmed')} aria-label={'Подтвердить память: ' + memory.title}><Check size={14} /> Подтвердить</button>
                    <button type="button" className="secondary-button" onClick={() => void update(memory.id, 'rejected')} aria-label={'Отклонить память: ' + memory.title}><X size={14} /> Отклонить</button>
                  </>}
                  <button type="button" className="memory-card__ai" onClick={() => navigate('/ai?q=' + encodeURIComponent('Почему я это запомнил: ' + memory.title))} aria-label={'Разобрать в AI: ' + memory.title}><Search size={14} /> Разобрать в AI</button>
                </div>
              </article>
            )) : (
              <div className="memory-empty">
                <Brain size={30} />
                <h2>Память пока пуста</h2>
                <p>STEN начнёт запоминать, когда вы подтвердите предложения из чата</p>
              </div>
            )}
        </main>
        {toast && <div className="memory-toast" role="status" aria-live="polite">{toast}</div>}
      </div>
    </div>
  );
}
