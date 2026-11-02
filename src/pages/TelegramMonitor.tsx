import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText, RefreshCw, Search, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
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
type ChatResponse = { chats: TelegramChat[]; canBind: boolean };
type MessageResponse = { messages: TelegramMessage[] };

const dateTime = (value?: string | null) => {
  if (!value) return 'Время не указано';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Время не указано'
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const isBound = (chat: TelegramChat) => Boolean(chat.organization_id && chat.restaurant_id);

export default function TelegramMonitor() {
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState('');
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canBind, setCanBind] = useState(false);
  const [bindingChat, setBindingChat] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [binding, setBinding] = useState(false);
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
        return nextChats.find(isBound)?.chat_id || '';
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
    if (!selectedChat || !selected || !isBound(selected)) {
      messageRequest.current += 1;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadMessages(selectedChat, search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selectedChat, selected, search, loadMessages]);

  const bindChat = async () => {
    if (!bindingChat || !organizationId.trim() || !restaurantId.trim()) {
      setError('Для привязки укажите чат, ID организации и ID ресторана.');
      return;
    }
    setBinding(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/telegram-monitor/chats/' + encodeURIComponent(bindingChat) + '/bind', {
        organization_id: organizationId.trim(),
        restaurant_id: restaurantId.trim(),
      });
      setNotice('Чат привязан к ресторану.');
      setSelectedChat(bindingChat);
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
        <p>Сообщения из рабочих групп — в одном месте, с привязкой к ресторану.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => void loadChats()} disabled={loadingChats}>
        <RefreshCw size={16} aria-hidden="true" /> Обновить
      </button>
    </header>

    {error && <div className="dashboard-note" role="alert"><AlertCircle size={16} />{error}</div>}
    {notice && <div className="dashboard-note" role="status"><CheckCircle2 size={16} />{notice}</div>}

    <div className="telegram-monitor-grid">
      <section className="telegram-monitor-panel" aria-label="Рабочие Telegram-чаты">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>Рабочие чаты</strong></div>
          <span>{chats.filter(isBound).length} подключено</span>
        </div>
        {loadingChats ? <p className="empty" role="status">Загружаем чаты…</p> : chats.length === 0
          ? <div className="empty">Пока нет доступных чатов. Новые групповые сообщения появятся здесь после поступления на сервер.</div>
          : <div className="telegram-chat-list">{chats.map(chat => {
            const bound = isBound(chat);
            return <button key={chat.chat_id} type="button"
              className={'telegram-chat-item' + (selectedChat === chat.chat_id ? ' is-active' : '')}
              aria-pressed={selectedChat === chat.chat_id}
              onClick={() => {
                setSelectedChat(chat.chat_id);
                if (!bound) setBindingChat(chat.chat_id);
              }}>
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
          <p>Привязку выполняет администратор STEN. После неё сообщения станут доступны пользователям соответствующей организации.</p>
          <label>Чат<select value={bindingChat} onChange={event => setBindingChat(event.target.value)}>
            <option value="">Выберите чат</option>
            {chats.filter(chat => !isBound(chat)).map(chat =>
              <option key={chat.chat_id} value={chat.chat_id}>{chat.title || 'Telegram-группа'} · {chat.chat_id}</option>
            )}
          </select></label>
          <label>ID организации<input value={organizationId} onChange={event => setOrganizationId(event.target.value)} placeholder="UUID организации" autoComplete="off" /></label>
          <label>ID ресторана<input value={restaurantId} onChange={event => setRestaurantId(event.target.value)} placeholder="UUID ресторана" autoComplete="off" /></label>
          <button className="primary-button" type="button" onClick={() => void bindChat()} disabled={binding || !bindingChat || !organizationId.trim() || !restaurantId.trim()}>
            {binding ? 'Привязываем…' : 'Привязать к ресторану'}
          </button>
        </div>}
      </section>

      <section className="telegram-monitor-panel telegram-monitor-feed" aria-label="Лента сообщений">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>{selected?.title || 'Лента сообщений'}</strong></div>
          {selected && <span>{selected.restaurant_name || 'Без привязки'}</span>}
        </div>
        <label className="telegram-search">
          <Search size={16} aria-hidden="true" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по тексту сообщений" aria-label="Поиск по сообщениям" />
        </label>
        {!selectedChat ? <div className="empty">Выберите привязанный чат, чтобы открыть сообщения.</div>
          : selected && !isBound(selected) ? <div className="empty">Этот чат ещё не привязан к ресторану. После привязки его сообщения появятся в ленте.</div>
          : loadingMessages ? <div className="empty" role="status">Загружаем сообщения…</div>
          : messages.length === 0 ? <div className="empty">Сообщений по этому запросу нет.</div>
          : <div className="telegram-message-list" aria-live="polite">{messages.map(message => <article className="telegram-message" key={message.chat_id + ':' + message.message_id}>
            <div className="telegram-message__meta">
              <strong>{message.sender_name || (message.sender_username ? '@' + message.sender_username : 'Участник группы')}</strong>
              <time>{dateTime(message.message_date || message.received_at)}</time>
            </div>
            <p>{message.message_text || 'Сообщение без текста'}</p>
            {message.edited_at && <small>Изменено: {dateTime(message.edited_at)}</small>}
          </article>)}</div>}
        <div className="telegram-monitor-footnote">Здесь отображаются сохранённые сообщения Telegram. Они не изменяют P&amp;L и другие финансовые данные автоматически.</div>
      </section>
    </div>
  </div>;
}
