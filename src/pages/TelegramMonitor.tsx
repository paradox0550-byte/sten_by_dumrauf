import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText, RefreshCw, Search, Link2, AlertCircle, CheckCircle2, Building2, Sparkles, Play } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import TelegramBotControl from '../features/telegram/TelegramBotControl';
import '../styles/telegram-monitor.css';

type TelegramChat = {
  chat_id: string;
  chat_type: string;
  title: string | null;
  first_seen_at: string;
  last_seen_at: string;
  organization_id: string | null;
  restaurant_id: string | null;
  restaurant_name: string | null;
  message_count: number;
};
type TelegramMessage = {
  chat_id: string;
  message_id: string;
  sender_name: string | null;
  sender_username: string | null;
  message_text: string | null;
  message_date: string | null;
  edited_at: string | null;
  received_at: string;
};
type Restaurant = { id: string; name: string };
type ChatResponse = { chats: TelegramChat[]; canBind: boolean };
type MessageResponse = { messages: TelegramMessage[] };
type TelegramAnalysisBatch = { scanned: number; analyzed: number; skipped: number; failed: number };

// Personal workspace limit is centralized so it can be raised without changing UI logic.
const MAX_MANAGED_RESTAURANTS = 3;

const dateTime = (value?: string | null) => {
  if (!value) return 'Время не указано';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Время не указано'
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const isBound = (chat: TelegramChat) => Boolean(chat.organization_id && chat.restaurant_id);

function extractRestaurants(input: unknown): Restaurant[] {
  const found = new Map<string, Restaurant>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const id = typeof node.id === 'string' ? node.id : typeof node.uuid === 'string' ? node.uuid : '';
    const name = typeof node.name === 'string' ? node.name : typeof node.title === 'string' ? node.title : '';
    const kind = String(node.kind || node.type || '').toLowerCase();
    if (id && name && kind === 'restaurant') found.set(id, { id, name });
    for (const key of ['tree', 'children', 'projects', 'branches', 'restaurants', 'departments', 'units']) {
      if (node[key]) visit(node[key]);
    }
  };
  visit(input);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

type ChatFilter = 'all' | 'bound' | 'unbound';
type FeedScope = 'all' | 'selected';

export default function TelegramMonitor() {
  const { user } = useAuth();
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [feedScope, setFeedScope] = useState<FeedScope>('all');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedChat, setSelectedChat] = useState('');
  const [search, setSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canBind, setCanBind] = useState(false);
  const [bindingChat, setBindingChat] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [binding, setBinding] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<TelegramAnalysisBatch | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const chatRequest = useRef(0);
  const messageRequest = useRef(0);

  const loadChats = useCallback(async (keepSelection = true) => {
    const request = ++chatRequest.current;
    setLoadingChats(true);
    setError('');
    try {
      const response = await api.get<ChatResponse>('/api/telegram-monitor/chats');
      if (request !== chatRequest.current) return;
      const nextChats = Array.isArray(response.chats) ? response.chats : [];
      setChats(nextChats);
      setCanBind(Boolean(response.canBind));
      setSelectedChat(current => {
        if (keepSelection && nextChats.some(chat => chat.chat_id === current)) return current;
        return nextChats.find(isBound)?.chat_id || nextChats[0]?.chat_id || '';
      });
      setNotice('');
    } catch (e) {
      if (request === chatRequest.current) {
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить Telegram-чаты.');
      }
    } finally {
      if (request === chatRequest.current) setLoadingChats(false);
    }
  }, []);

  const selected = useMemo(
    () => chats.find(chat => chat.chat_id === selectedChat),
    [chats, selectedChat],
  );

  const boundRestaurantIds = useMemo(
    () => new Set(chats.filter(chat => isBound(chat) && chat.organization_id === user?.organizationId).map(chat => chat.restaurant_id as string)),
    [chats, user?.organizationId],
  );
  const managedRestaurantCount = boundRestaurantIds.size;
  const canAddRestaurant = managedRestaurantCount < MAX_MANAGED_RESTAURANTS
    || Boolean(restaurantId && boundRestaurantIds.has(restaurantId));

  const visibleChats = useMemo(() => chats.filter(chat => {
    const matchesFilter = chatFilter === 'all'
      || (chatFilter === 'bound' ? isBound(chat) : !isBound(chat));
    const query = chatSearch.trim().toLocaleLowerCase('ru');
    const matchesSearch = !query || (chat.title || '').toLocaleLowerCase('ru').includes(query)
      || (chat.restaurant_name || '').toLocaleLowerCase('ru').includes(query);
    return matchesFilter && matchesSearch;
  }), [chats, chatFilter, chatSearch]);

  const loadAllMessages = useCallback(async (query: string) => {
    const request = ++messageRequest.current;
    const boundChats = chats.filter(isBound);
    if (!boundChats.length) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    setError('');
    try {
      const batches = await Promise.all(boundChats.map(async chat => {
        const params = new URLSearchParams({ chat_id: chat.chat_id, limit: '30' });
        if (query.trim()) params.set('q', query.trim());
        const response = await api.get<MessageResponse>('/api/telegram-monitor/messages?' + params.toString());
        return Array.isArray(response.messages) ? response.messages : [];
      }));
      if (request !== messageRequest.current) return;
      const unique = new Map<string, TelegramMessage>();
      batches.flat().forEach(message => unique.set(message.chat_id + ':' + message.message_id, message));
      setMessages([...unique.values()].sort((a, b) =>
        new Date(b.message_date || b.received_at).getTime() - new Date(a.message_date || a.received_at).getTime()
      ));
    } catch (e) {
      if (request === messageRequest.current) {
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить общую ленту сообщений.');
        setMessages([]);
      }
    } finally {
      if (request === messageRequest.current) setLoadingMessages(false);
    }
  }, [chats]);

  const loadMessages = useCallback(async (chatId: string, query: string) => {
    const request = ++messageRequest.current;
    const chat = chats.find(item => item.chat_id === chatId);
    if (!chatId || !chat || !isBound(chat)) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    setError('');
    try {
      const params = new URLSearchParams({ chat_id: chatId, limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      const response = await api.get<MessageResponse>('/api/telegram-monitor/messages?' + params.toString());
      if (request !== messageRequest.current) return;
      setMessages(Array.isArray(response.messages) ? response.messages : []);
    } catch (e) {
      if (request === messageRequest.current) {
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить сообщения.');
        setMessages([]);
      }
    } finally {
      if (request === messageRequest.current) setLoadingMessages(false);
    }
  }, [chats]);

  useEffect(() => { void loadChats(false); }, [loadChats]);

  useEffect(() => {
    if (!canBind || !user?.organizationId) return;
    let cancelled = false;
    setLoadingRestaurants(true);
    api.get<unknown>('/api/b2b/org/tree')
      .then(tree => { if (!cancelled) setRestaurants(extractRestaurants(tree)); })
      .catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Не удалось загрузить список ресторанов.'); })
      .finally(() => { if (!cancelled) setLoadingRestaurants(false); });
    return () => { cancelled = true; };
  }, [canBind, user?.organizationId]);

  useEffect(() => {
    if (feedScope === 'all') {
      const timer = window.setTimeout(() => { void loadAllMessages(search); }, 250);
      return () => window.clearTimeout(timer);
    }
    if (!selectedChat || !selected || !isBound(selected)) {
      messageRequest.current += 1;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    const timer = window.setTimeout(() => { void loadMessages(selectedChat, search); }, 250);
    return () => window.clearTimeout(timer);
  }, [feedScope, selectedChat, selected, search, loadMessages, loadAllMessages]);

  const runAnalysis = async () => {
    setAnalysisRunning(true);
    setAnalysisError('');
    setAnalysisResult(null);
    try {
      const response = await api.post<{ analysis: TelegramAnalysisBatch }>('/api/telegram-monitor/analyze', { limit: 20 });
      setAnalysisResult(response.analysis);
    } catch (e) {
      setAnalysisError(e instanceof ApiError ? e.message : 'Не удалось запустить AI-анализ переписки.');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const canRunAnalysis = ['super_admin', 'owner', 'admin', 'director'].includes(String(user?.role || '').toLowerCase());

  const bindChat = async () => {
    if (!bindingChat || !restaurantId || !user?.organizationId) {
      setError('Выберите чат и ресторан.');
      return;
    }
    if (!canAddRestaurant) {
      setError('Для личного контура можно подключить не более трёх ресторанов. Сначала отвяжите чат от другого ресторана.');
      return;
    }
    setBinding(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/telegram-monitor/chats/' + encodeURIComponent(bindingChat) + '/bind', {
        organization_id: user.organizationId,
        restaurant_id: restaurantId,
      });
      setNotice('Чат привязан к ресторану.');
      setSelectedChat(bindingChat);
      setBindingChat('');
      setRestaurantId('');
      await loadChats(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось привязать чат.');
    } finally {
      setBinding(false);
    }
  };

  return <div className="page telegram-monitor-page">
    <header className="page-header">
      <div>
        <span className="sten-state-eyebrow">STEN · ОПЕРАЦИОННЫЙ КОНТРОЛЬ</span>
        <h1>Мониторинг Telegram</h1>
        <p>Рабочие сообщения твоих ресторанов — в одном месте.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => void loadChats()} disabled={loadingChats}>
        <RefreshCw size={16} aria-hidden="true" /> Обновить
      </button>
    </header>

    <TelegramBotControl />

    <section className="telegram-analysis-panel" aria-labelledby="telegram-analysis-title">
      <div className="telegram-analysis-panel__head">
        <div>
          <span className="telegram-analysis-panel__eyebrow"><Sparkles size={14} /> АНАЛИЗ ПЕРЕПИСКИ</span>
          <h2 id="telegram-analysis-title">AI-анализ рабочих сообщений</h2>
          <p>Сервер ежедневно анализирует накопившиеся сообщения. Ручной запуск обрабатывает до 20 ещё не проанализированных сообщений рабочего контура.</p>
        </div>
        <span className="telegram-analysis-panel__schedule">Ежедневно · сервер</span>
      </div>
      <div className="telegram-analysis-panel__actions">
        {canRunAnalysis
          ? <button type="button" className="secondary-button" onClick={() => void runAnalysis()} disabled={analysisRunning}>
              <Play size={15} aria-hidden="true" /> {analysisRunning ? 'Анализируем…' : 'Запустить анализ'}
            </button>
          : <span className="telegram-analysis-panel__permission">Ручной запуск доступен владельцу, администратору или директору.</span>}
        <span className="telegram-analysis-panel__note">История запусков и отдельный список AI-находок пока не предоставляются API.</span>
      </div>
      {analysisError && <p className="telegram-analysis-panel__message is-error" role="alert">{analysisError}</p>}
      {analysisResult && <div className="telegram-analysis-result" role="status" aria-live="polite">
        <strong>Результат последнего ручного запуска</strong>
        <div className="telegram-analysis-result__metrics">
          <span><b>{analysisResult.scanned}</b><small>Проверено</small></span>
          <span><b>{analysisResult.analyzed}</b><small>Проанализировано</small></span>
          <span><b>{analysisResult.skipped}</b><small>Пропущено</small></span>
          <span><b>{analysisResult.failed}</b><small>Ошибки</small></span>
        </div>
        <small>Счётчики относятся только к этому запуску. Они не являются количеством активных проблем или поручений.</small>
      </div>}
    </section>

    {error && <div className="dashboard-note" role="alert"><AlertCircle size={16} />{error}</div>}
    {notice && <div className="dashboard-note" role="status"><CheckCircle2 size={16} />{notice}</div>}

    <section className="telegram-monitor-summary" aria-label="Состояние мониторинга">
      <div><strong>{chats.filter(isBound).length}</strong><span>Подключено чатов</span></div>
      <div><strong>{managedRestaurantCount}/{MAX_MANAGED_RESTAURANTS}</strong><span>Рестораны в контуре</span></div>
      <div><strong>{chats.reduce((sum, chat) => sum + Number(chat.message_count || 0), 0)}</strong><span>Сохранено сообщений</span></div>
    </section>

    <div className="telegram-monitor-grid">
      <section className="telegram-monitor-panel" aria-label="Рабочие Telegram-чаты">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>Рабочие чаты</strong></div>
          <span>{visibleChats.length} из {chats.length}</span>
        </div>
        <label className="telegram-search telegram-chat-search">
          <Search size={16} aria-hidden="true" />
          <input value={chatSearch} onChange={event => setChatSearch(event.target.value)} placeholder="Найти чат" aria-label="Поиск чатов" />
        </label>
        <div className="telegram-filter-tabs" role="group" aria-label="Фильтр чатов">
          <button type="button" className={chatFilter === 'all' ? 'is-active' : ''} onClick={() => setChatFilter('all')}>Все</button>
          <button type="button" className={chatFilter === 'bound' ? 'is-active' : ''} onClick={() => setChatFilter('bound')}>Подключённые</button>
          <button type="button" className={chatFilter === 'unbound' ? 'is-active' : ''} onClick={() => setChatFilter('unbound')}>Нужна привязка</button>
        </div>
        {loadingChats ? <p className="empty" role="status">Загружаем чаты…</p> : visibleChats.length === 0
          ? <div className="empty">{chats.length ? 'По этому фильтру чатов нет.' : 'Пока нет доступных чатов. Новые групповые сообщения появятся здесь после поступления на сервер.'}</div>
          : <div className="telegram-chat-list">{visibleChats.map(chat => {
            const bound = isBound(chat);
            return <button key={chat.chat_id} type="button"
              className={'telegram-chat-item' + (selectedChat === chat.chat_id ? ' is-active' : '')}
              aria-pressed={selectedChat === chat.chat_id}
              onClick={() => { setSelectedChat(chat.chat_id); if (!bound) setBindingChat(chat.chat_id); }}>
              <span className="telegram-chat-item__icon"><MessageSquareText size={17} /></span>
              <span className="telegram-chat-item__copy">
                <strong>{chat.title || 'Telegram-группа'}</strong>
                <small>{chat.chat_type} · {chat.message_count} сообщ.</small>
                <small>{bound ? chat.restaurant_name || 'Ресторан привязан' : 'Не привязан к ресторану'} · {dateTime(chat.last_seen_at)}</small>
              </span>
              <span className={'telegram-chat-item__status ' + (bound ? 'is-bound' : 'is-unbound')}>
                {bound ? 'Подключён' : 'Нужна привязка'}
              </span>
            </button>;
          })}</div>}

        {canBind && chats.some(chat => !isBound(chat)) && <div className="telegram-bind-box">
          <strong><Link2 size={16} /> Привязка чата</strong>
          <p>Выбери ресторан из своего рабочего контура. Идентификаторы система подставит сама.</p>
          <label>Чат<select value={bindingChat} onChange={event => setBindingChat(event.target.value)}>
            <option value="">Выберите чат</option>
            {chats.filter(chat => !isBound(chat)).map(chat =>
              <option key={chat.chat_id} value={chat.chat_id}>{chat.title || 'Telegram-группа'}</option>
            )}
          </select></label>
          <label><span><Building2 size={14} /> Ресторан</span><select value={restaurantId} onChange={event => setRestaurantId(event.target.value)} disabled={loadingRestaurants || restaurants.length === 0}>
            <option value="">{loadingRestaurants ? 'Загружаем рестораны…' : 'Выберите ресторан'}</option>
            {restaurants.map(restaurant => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
          </select></label>
          <small className="telegram-bind-limit">{managedRestaurantCount >= MAX_MANAGED_RESTAURANTS ? 'Лимит трёх ресторанов достигнут. Можно подключать дополнительные чаты к уже используемым ресторанам.' : 'Личный контур: до трёх ресторанов.'}</small>
          <button className="primary-button" type="button" onClick={() => void bindChat()} disabled={binding || !bindingChat || !restaurantId || !canAddRestaurant}>
            {binding ? 'Привязываем…' : 'Привязать к ресторану'}
          </button>
        </div>}
      </section>

      <section className="telegram-monitor-panel telegram-monitor-feed" aria-label="Лента сообщений">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>{feedScope === 'all' ? 'Все рабочие сообщения' : selected?.title || 'Лента сообщений'}</strong></div>
          <span>{feedScope === 'all' ? 'Все рестораны' : selected?.restaurant_name || 'Без привязки'}</span>
        </div>
        <div className="telegram-feed-tabs" role="group" aria-label="Область ленты">
          <button type="button" className={feedScope === 'all' ? 'is-active' : ''} onClick={() => setFeedScope('all')}>Все чаты</button>
          <button type="button" className={feedScope === 'selected' ? 'is-active' : ''} onClick={() => setFeedScope('selected')} disabled={!selected || !isBound(selected)}>Выбранный чат</button>
        </div>
        <label className="telegram-search">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по тексту сообщений" aria-label="Поиск по сообщениям" />
        </label>
        {feedScope === 'selected' && !selectedChat ? <div className="empty">Выберите привязанный чат, чтобы открыть сообщения.</div>
          : feedScope === 'selected' && selected && !isBound(selected) ? <div className="empty">Этот чат ещё не привязан к ресторану. Выберите ресторан в блоке привязки.</div>
          : loadingMessages ? <div className="empty" role="status">Загружаем сообщения…</div>
          : messages.length === 0 ? <div className="empty">Сообщений по этому запросу нет.</div>
          : <div className="telegram-message-list" aria-live="polite">{messages.map(message => <article className="telegram-message" key={message.chat_id + ':' + message.message_id}>
            {feedScope === 'all' && <span className="telegram-message__chat">{chats.find(chat => chat.chat_id === message.chat_id)?.restaurant_name || 'Ресторан'} · {chats.find(chat => chat.chat_id === message.chat_id)?.title || 'Telegram-группа'}</span>}
            <div className="telegram-message__meta">
              <strong>{message.sender_name || (message.sender_username ? '@' + message.sender_username : 'Участник группы')}</strong>
              <time>{dateTime(message.message_date || message.received_at)}</time>
            </div>
            <p>{message.message_text || 'Сообщение без текста'}</p>
            {message.edited_at && <small>Изменено: {dateTime(message.edited_at)}</small>}
          </article>)}</div>}
        <div className="telegram-monitor-footnote">{feedScope === 'all' ? 'Общая лента загружает последние 30 сообщений из каждого привязанного чата. ' : ''}Здесь отображаются сохранённые сообщения Telegram. Они не изменяют P&amp;L и другие финансовые данные автоматически. Отдельный статус webhook и история доставки через текущий API не доступны.</div>
      </section>
    </div>
  </div>;
}
