import { useEffect, useMemo, useState } from 'react';
import { Brain, ChevronDown, MoreHorizontal, Search, Trash2, Check, X, Download, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { buildMemoryFilename, buildMemoryMarkdown } from '../lib/memory-export';
import { api, createMemory, deleteMemory, listMemory, updateMemoryConfidence } from '../lib/api';
import { MEMORY_CONFIDENCE_LABEL, MEMORY_KIND_LABEL } from '../lib/contracts/memory';
import type { Memory, MemoryConfidence, MemoryFilters, MemoryKind } from '../lib/contracts/memory';

const kinds: Array<{ value: MemoryKind | ''; label: string }> = [
  { value: '', label: 'Все' },
  ...Object.entries(MEMORY_KIND_LABEL).map(([value, label]) => ({ value: value as MemoryKind, label })),
];
const confidences: Array<{ value: MemoryConfidence | ''; label: string }> = [
  { value: '', label: 'Все' },
  ...Object.entries(MEMORY_CONFIDENCE_LABEL).map(([value, label]) => ({ value: value as MemoryConfidence, label })),
];
const kindBadge: Record<MemoryKind, string> = {
  fact: 'brand', decision: 'success', cause: 'warning', action: 'neutral', manager_note: 'neutral', pattern: 'neutral',
};
const confidenceBadge: Record<MemoryConfidence, string> = { confirmed: 'success', unconfirmed: 'neutral', rejected: 'danger' };
type Restaurant = { id: string; name: string; kind?: string };
type ExecutiveChainStage = 'action' | 'change' | 'lesson' | 'next_check';
type ExecutiveChainMeta = { decisionId: string; stage: ExecutiveChainStage; dueDate?: string; previousEntryId?: string };
const EXECUTIVE_CHAIN_KEY = 'sten_executive_chain';
const EXECUTIVE_CHAIN_STAGES: Array<{ value: ExecutiveChainStage; label: string; question: string; kind: MemoryKind }> = [
  { value: 'action', label: 'Что сделали', question: 'Какое конкретное действие выполнили? Кто или какая команда его выполнила?', kind: 'action' },
  { value: 'change', label: 'Что изменилось', question: 'Что изменилось после действия? Укажи измеримый результат, период и источник, если они есть.', kind: 'fact' },
  { value: 'lesson', label: 'Чему научились', question: 'Какой вывод подтверждён результатом? Что стоит повторить или не повторять?', kind: 'pattern' },
  { value: 'next_check', label: 'Что проверить дальше', question: 'Что нужно проверить и по какому признаку поймём результат?', kind: 'manager_note' },
];

function getExecutiveChainMeta(memory: Memory): ExecutiveChainMeta | null {
  const value = memory.evidence_json?.[EXECUTIVE_CHAIN_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const stages: ExecutiveChainStage[] = ['action', 'change', 'lesson', 'next_check'];
  if (typeof data.decision_id !== 'string' || !stages.includes(data.stage as ExecutiveChainStage)) return null;
  return {
    decisionId: data.decision_id,
    stage: data.stage as ExecutiveChainStage,
    ...(typeof data.due_date === 'string' ? { dueDate: data.due_date } : {}),
    ...(typeof data.previous_entry_id === 'string' ? { previousEntryId: data.previous_entry_id } : {}),
  };
}

function latestChainEntry(entries: Memory[] | undefined): Memory | undefined {
  return entries?.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

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

function extractOrganizationName(value: unknown): string | undefined {
  const data = value as {
    organization?: { name?: unknown } | unknown;
    organization_name?: unknown;
    context?: { organization?: { name?: unknown } | unknown; organization_name?: unknown };
  } | null;
  const candidates = [
    typeof data?.organization === 'object' && data.organization ? (data.organization as { name?: unknown }).name : undefined,
    data?.organization_name,
    typeof data?.context?.organization === 'object' && data.context.organization ? (data.context.organization as { name?: unknown }).name : undefined,
    data?.context?.organization_name,
  ];
  return candidates.find((item): item is string => typeof item === 'string' && item.length > 0);
}

export default function Memory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [kind, setKind] = useState<MemoryKind | ''>('');
  const [confidence, setConfidence] = useState<MemoryConfidence | ''>('');
  const [restaurantId, setRestaurantId] = useState('');
  const [since, setSince] = useState('');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [quickKind, setQuickKind] = useState<MemoryKind | ''>('');
  const [quickConfidence, setQuickConfidence] = useState<MemoryConfidence | ''>('');
  const [chainMemories, setChainMemories] = useState<Memory[]>([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState('');
  const [selectedStage, setSelectedStage] = useState<ExecutiveChainStage>('action');
  const [stageText, setStageText] = useState('');
  const [nextCheckDate, setNextCheckDate] = useState('');
  const [savingChain, setSavingChain] = useState(false);

  const filters = useMemo<MemoryFilters>(() => ({
    ...(kind ? { kind } : {}),
    ...(confidence ? { confidence } : {}),
    ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    ...(since ? { since } : {}),
    limit,
  }), [kind, confidence, restaurantId, since, limit]);

  const visibleMemories = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('ru-RU');
    return memories.filter(memory => {
      const matchesQuery = !query || `${memory.title} ${memory.content}`.toLocaleLowerCase('ru-RU').includes(query);
      const matchesKind = !quickKind || memory.kind === quickKind;
      const matchesConfidence = !quickConfidence || memory.confidence === quickConfidence;
      return matchesQuery && matchesKind && matchesConfidence;
    });
  }, [memories, searchText, quickKind, quickConfidence]);

  const chainDecisions = useMemo(
    () => chainMemories.filter(memory => memory.kind === 'decision' && memory.confidence !== 'rejected'),
    [chainMemories],
  );

  const chainByDecision = useMemo(() => {
    const result = new Map<string, Partial<Record<ExecutiveChainStage, Memory[]>>>();
    for (const memory of chainMemories) {
      const meta = getExecutiveChainMeta(memory);
      if (!meta) continue;
      const stages = result.get(meta.decisionId) ?? {};
      const entries = stages[meta.stage] ?? [];
      stages[meta.stage] = [...entries, memory].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      result.set(meta.decisionId, stages);
    }
    return result;
  }, [chainMemories]);

  const selectedDecision = chainDecisions.find(memory => memory.id === selectedDecisionId) ?? null;
  const selectedChain = selectedDecision ? chainByDecision.get(selectedDecision.id) ?? {} : {};
  const selectedStageEntries = selectedChain[selectedStage] ?? [];
  const currentStageEntry = latestChainEntry(selectedStageEntries);

  useEffect(() => {
    setStageText(currentStageEntry?.content ?? '');
    setNextCheckDate(getExecutiveChainMeta(currentStageEntry ?? ({} as Memory))?.dueDate ?? '');
  }, [selectedDecisionId, selectedStage, currentStageEntry?.id, currentStageEntry?.updated_at]);

  const load = async () => {
    setLoading(true);
    try {
      const [memoryResponse, contextResponse, chainResponses] = await Promise.all([
        confidence
          ? listMemory(filters)
          : Promise.all((['confirmed', 'unconfirmed', 'rejected'] as const).map(value => listMemory({ ...filters, confidence: value })))
              .then(results => ({
                memories: results.flatMap(result => result.memories).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit),
              })),
        api.get<unknown>('/api/b2b/context'),
        Promise.all((['confirmed', 'unconfirmed', 'rejected'] as const).map(value =>
          listMemory({ ...(restaurantId ? { restaurant_id: restaurantId } : {}), confidence: value, limit: 200 }),
        )),
      ]);
      setMemories(memoryResponse.memories ?? []);
      setChainMemories(chainResponses.flatMap(result => result.memories ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
      setRestaurants(extractRestaurants(contextResponse));
      setOrganizationName(extractOrganizationName(contextResponse));
      setToast(null);
    } catch {
      setToast('Не удалось. Повторить');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [kind, confidence, restaurantId, since, limit]);
  useEffect(() => { setQuickKind(''); setQuickConfidence(''); }, [kind, confidence, restaurantId, since, limit]);

  const update = async (id: string, next: 'confirmed' | 'rejected') => {
    try {
      const updated = await updateMemoryConfidence(id, next);
      setMemories(current => current.map(item => item.id === id ? updated : item));
      setToast(next === 'confirmed' ? 'Память подтверждена' : 'Память отклонена');
    } catch {
      setToast('Не удалось. Повторить');
    }
  };

  const saveChainStep = async () => {
    if (!selectedDecision || !stageText.trim() || savingChain) return;
    setSavingChain(true);
    const stageConfig = EXECUTIVE_CHAIN_STAGES.find(item => item.value === selectedStage);
    if (!stageConfig) {
      setSavingChain(false);
      return;
    }
    const previousEntry = latestChainEntry(selectedStageEntries);
    try {
      await createMemory({
        scope: {
          project_id: selectedDecision.project_id || null,
          branch_id: selectedDecision.branch_id || null,
          restaurant_id: selectedDecision.restaurant_id || null,
          department_id: selectedDecision.department_id || null,
        },
        kind: stageConfig.kind,
        title: 'Результат решения: ' + selectedDecision.title + ' — ' + stageConfig.label.toLocaleLowerCase('ru-RU'),
        content: stageText.trim(),
        evidence: {
          [EXECUTIVE_CHAIN_KEY]: {
            version: 1,
            decision_id: selectedDecision.id,
            decision_title: selectedDecision.title,
            stage: selectedStage,
            ...(selectedStage === 'next_check' && nextCheckDate ? { due_date: nextCheckDate } : {}),
            ...(previousEntry ? { previous_entry_id: previousEntry.id } : {}),
            saved_at: new Date().toISOString(),
          },
        },
      });
      setToast('Этап цепочки сохранён');
      await load();
    } catch {
      setToast('Не удалось сохранить этап. Проверь соединение и повтори');
    } finally {
      setSavingChain(false);
    }
  };

  const exportMarkdown = async () => {
    if (!memories.length || exporting) return;
    setExporting(true);
    try {
      const activeFilters: MemoryFilters = {
        ...(kind ? { kind } : {}),
        ...(confidence ? { confidence } : {}),
        ...(restaurantId ? { restaurant_id: restaurantId } : {}),
        ...(since ? { since } : {}),
      };
      const response = await listMemory({ ...activeFilters, limit: 500 });
      const exportedMemories = response.memories ?? [];
      const md = buildMemoryMarkdown(exportedMemories, {
        organizationName: organizationName || user?.organizationId || 'STEN',
        exportedAt: new Date().toISOString(),
        filters: activeFilters,
        total: exportedMemories.length,
      });
      const filename = buildMemoryFilename(user?.organizationId || organizationName || 'sten');
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast('Память выгружена (' + exportedMemories.length + ' записей)');
    } catch {
      setToast('Не удалось выгрузить. Повторить');
    } finally {
      setExporting(false);
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
            <span className="eyebrow"><Brain size={14} /> ИСТОРИЯ РУКОВОДИТЕЛЯ</span>
            <h1>Память руководителя</h1>
            <p>Решения, проблемы, действия и закономерности — из сохранённых записей STEN.</p>
            <button type="button" className="secondary-button memory-page__export-btn" onClick={() => void exportMarkdown()} disabled={!memories.length || exporting} aria-label="Скачать память в формате Markdown">
              {exporting ? <Loader2 size={15} className="memory-export-spinner" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {exporting ? 'Выгрузка…' : 'Скачать Markdown ↓'}
            </button>
          </div>
        </header>

        <section className="executive-memory-overview" aria-label="Краткая сводка истории руководителя">
          <div className="executive-memory-overview__heading">
            <div><h2>Управленческая история</h2><p>Быстрый доступ к ключевым записям в текущей выборке</p></div>
            <span>{loading ? 'Обновление…' : `${memories.length} ${memories.length === 1 ? 'запись' : memories.length > 1 && memories.length < 5 ? 'записи' : 'записей'}`}</span>
          </div>
          <div className="executive-memory-shortcuts">
            <button type="button" className={quickKind === '' && quickConfidence === '' ? 'active' : ''} onClick={() => { setQuickKind(''); setQuickConfidence(''); setSearchText(''); }}><strong>{memories.length}</strong><span>Вся выборка</span></button>
            <button type="button" className={quickKind === 'decision' ? 'active' : ''} onClick={() => { setQuickKind('decision'); setQuickConfidence(''); }}><strong>{memories.filter(item => item.kind === 'decision').length}</strong><span>Решения</span></button>
            <button type="button" className={quickKind === 'cause' ? 'active' : ''} onClick={() => { setQuickKind('cause'); setQuickConfidence(''); }}><strong>{memories.filter(item => item.kind === 'cause').length}</strong><span>Причины проблем</span></button>
            <button type="button" className={quickKind === 'action' ? 'active' : ''} onClick={() => { setQuickKind('action'); setQuickConfidence(''); }}><strong>{memories.filter(item => item.kind === 'action').length}</strong><span>Действия</span></button>
            <button type="button" className={quickKind === 'pattern' ? 'active' : ''} onClick={() => { setQuickKind('pattern'); setQuickConfidence(''); }}><strong>{memories.filter(item => item.kind === 'pattern').length}</strong><span>Закономерности</span></button>
            <button type="button" className={quickKind === 'fact' ? 'active' : ''} onClick={() => { setQuickKind('fact'); setQuickConfidence(''); }}><strong>{memories.filter(item => item.kind === 'fact').length}</strong><span>Факты и результаты</span></button>
            <button type="button" className={quickConfidence === 'unconfirmed' ? 'active' : ''} onClick={() => { setQuickConfidence('unconfirmed'); setQuickKind(''); }}><strong>{memories.filter(item => item.confidence === 'unconfirmed').length}</strong><span>На проверке</span></button>
          </div>
          <label className="executive-memory-search">
            <Search size={16} aria-hidden="true" />
            <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Найти решение, проблему или договорённость…" aria-label="Поиск по истории руководителя" />
            {searchText && <button type="button" onClick={() => setSearchText('')} aria-label="Очистить поиск"><X size={15} /></button>}
          </label>
        </section>

        <section className="executive-chain" aria-label="Связь решений с результатами">
          <div className="executive-chain__heading">
            <div>
              <h2>От решения к результату</h2>
              <p>Записывай этапы по мере выполнения. Каждая версия сохраняется отдельно, без перезаписи истории.</p>
            </div>
          </div>
          <label className="executive-chain__decision">
            <span>Сохранённое решение</span>
            <select value={selectedDecisionId} onChange={event => setSelectedDecisionId(event.target.value)}>
              <option value="">Выбери решение для отслеживания</option>
              {chainDecisions.map(decision => (
                <option key={decision.id} value={decision.id}>{decision.title}</option>
              ))}
            </select>
          </label>
          {selectedDecision ? <>
            <div className="executive-chain__steps">
              <div className="executive-chain__step executive-chain__step--decision">
                <span className="executive-chain__step-number">1</span>
                <div className="executive-chain__step-body">
                  <strong>Что решили</strong>
                  <p>{selectedDecision.content}</p>
                  <small>Исходная запись · {formatDate(selectedDecision.created_at)}</small>
                </div>
              </div>
              {EXECUTIVE_CHAIN_STAGES.map((stage, index) => {
                const entries = selectedChain[stage.value] ?? [];
                const latest = latestChainEntry(entries);
                const meta = latest ? getExecutiveChainMeta(latest) : null;
                return <button
                  type="button"
                  key={stage.value}
                  className={'executive-chain__step' + (selectedStage === stage.value ? ' active' : '') + (latest ? ' complete' : '')}
                  onClick={() => setSelectedStage(stage.value)}
                  aria-pressed={selectedStage === stage.value}
                >
                  <span className="executive-chain__step-number">{index + 2}</span>
                  <span className="executive-chain__step-body">
                    <strong>{stage.label}</strong>
                    <span>{latest?.content ?? 'Пока не зафиксировано'}</span>
                    <small>{latest ? ((entries.length > 1 ? 'Версий: ' + entries.length + ' · ' : '') + MEMORY_CONFIDENCE_LABEL[latest.confidence] + ' · ' + formatDate(latest.created_at)) : 'Ожидает записи'}</small>
                    {stage.value === 'next_check' && meta?.dueDate && <small>Плановая дата: {meta.dueDate}</small>}
                  </span>
                </button>;
              })}
            </div>
            <div className="executive-chain__editor">
              <div className="executive-chain__editor-heading">
                <div><span>Этап {EXECUTIVE_CHAIN_STAGES.findIndex(item => item.value === selectedStage) + 2} из 5</span><h3>{EXECUTIVE_CHAIN_STAGES.find(item => item.value === selectedStage)?.label}</h3></div>
                <small>{currentStageEntry ? 'Новая запись создаст следующую версию' : 'Первичная фиксация'}</small>
              </div>
              <p>{EXECUTIVE_CHAIN_STAGES.find(item => item.value === selectedStage)?.question}</p>
              <textarea value={stageText} onChange={event => setStageText(event.target.value)} rows={3} maxLength={6000} placeholder="Запиши результат конкретно. Если данных пока нет — не придумывай, вернись к этапу позже." />
              {selectedStage === 'next_check' && <label className="executive-chain__date"><span>Дата следующей проверки (план, без автоматического уведомления)</span><input type="date" value={nextCheckDate} onChange={event => setNextCheckDate(event.target.value)} /></label>}
              <div className="executive-chain__editor-actions">
                <span>{stageText.trim().length} / 6000</span>
                <button type="button" className="primary-button" onClick={() => void saveChainStep()} disabled={!stageText.trim() || savingChain}>
                  {savingChain ? <Loader2 size={15} className="memory-export-spinner" aria-hidden="true" /> : null}
                  {savingChain ? 'Сохраняю…' : currentStageEntry ? 'Сохранить новую версию' : 'Сохранить этап'}
                </button>
              </div>
            </div>
          </> : <div className="executive-chain__empty">{chainMemories.length ? 'Выбери сохранённое решение, чтобы начать фиксировать действия и результаты.' : 'Сохранённые решения появятся здесь после загрузки памяти.'}</div>}
        </section>

        {(memories.length > 0 || Boolean(kind || confidence || restaurantId || since)) && <section className="memory-filters" aria-label="Фильтры памяти">
          {renderFilters('Тип', kinds, kind, value => setKind(value as MemoryKind | ''))}
          {renderFilters('Уверенность', confidences, confidence, value => setConfidence(value as MemoryConfidence | ''))}
          <label className="memory-filter-field">
            <span>Ресторан</span>
            <div className="memory-filter-select">
              <select value={restaurantId} onChange={event => setRestaurantId(event.target.value)} aria-label="Ресторан памяти">
              <option value="">Все рестораны</option>
              {restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select><ChevronDown className="memory-filter-select__icon" size={15} aria-hidden="true" />
            </div>
          </label>
          <label className="memory-filter-field">
            <span>С даты</span>
            <input type="date" value={since} onChange={event => setSince(event.target.value)} aria-label="Память с даты" />
          </label>
          <label className="memory-filter-field memory-filter-field--limit">
            <span>Показать последних</span>
            <select value={limit} onChange={event => setLimit(Number(event.target.value))} aria-label="Количество записей памяти">
              {[20, 50, 100, 200].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </section>}

        <main className="memory-list" aria-live="polite">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div className="memory-card memory-card--skeleton" key={index}><span/><span/><span/></div>) :
            visibleMemories.length ? visibleMemories.map(memory => (
              <article className="memory-card" key={memory.id}>
                <div className="memory-card__top">
                  <div className="memory-card__badges">
                    <span className={'badge badge--' + kindBadge[memory.kind]}>{MEMORY_KIND_LABEL[memory.kind]}</span>
                    <span className={'badge badge--' + confidenceBadge[memory.confidence]}>{MEMORY_CONFIDENCE_LABEL[memory.confidence]}</span>
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
            )) : memories.length ? (
              <div className="memory-empty">
                <Search size={28} />
                <h2>Ничего не найдено</h2>
                <p>Попробуй изменить запрос или очистить поиск.</p>
                <button type="button" className="secondary-button" onClick={() => setSearchText('')}>Очистить поиск</button>
              </div>
            ) : (
              <div className="memory-empty">
                <Brain size={30} />
                <h2>Память пока пуста</h2>
                <p>STEN начнёт запоминать, когда вы подтвердите предложения из чата</p>
                <button type="button" className="primary-button" onClick={() => navigate('/ai')}>Открыть чат STEN AI →</button>
              </div>
            )}
        </main>
        {toast && <div className="memory-toast" role="status" aria-live="polite">{toast}</div>}
      </div>
    </div>
  );
}
