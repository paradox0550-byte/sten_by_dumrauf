import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareText, RefreshCw, Search, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';

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

const dateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'Время не указано';

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

  const loadChats = useCallback(async (keepSelection = true) => {
    setLoadingChats(true);
    setError('');
    try {
      const response = await api.get<ChatResponse>('/api/telegram-monitor/chats');
      const nextChats = Array.isArray(response.chats) ? response.chats : [];
      setChats(nextChats);
      setCanBind(Boolean(response.canBind));
      setSelectedChat(current => keepSelection && nextChats.some(chat => chat.chat_id === current)
        ? current : nextChats.find(chat => chat.organization_id && chat.restaurant_id)?.chat_id || '');
      setNotice('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить Telegram-чаты.');
    } finally {
      setLoadingChats(false);
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string, query: string) => {
    if (!chatId) { setMessages([]); return; }
    setLoadingMessages(true);
    setError('');
    try {
      const params = new URLSearchParams({ chat_id: chatId, limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      const response = await api.get<MessageResponse>('/api/telegram-monitor/messages?' + params.toString());
      setMessages(Array.isArray(response.messages) ? response.messages : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить сообщения.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => { void loadChats(false); }, [loadChats]);
  useEffect(() => {
    if (!selectedChat) { setMessages([]); return; }
    const timer = window.setTimeout(() => { void loadMessages(selectedChat, search); }, 250);
    return () => window.clearTimeout(timer);
  }, [selectedChat, search, loadMessages]);

  const selected = useMemo(() => chats.find(chat => chat.chat_id === selectedChat), [chats, selectedChat]);
  const bindChat = async () => {
    if (!bindingChat || !organizationId.trim() || !restaurantId.trim()) {
      setError('Для привязки укажите чат, ID организации и ID ресторана.');
      return;
    }
    setBinding(true);
    setError('');
    try {
      await api.post('/api/telegram-monitor/chats/' + encodeURIComponent(bindingChat) + '/bind', {
        organization_id: organizationId.trim(),
        restaurant_id: restaurantId.trim(),
      });
      setNotice('Чат привязан к ресторану.');
      await loadChats(false);
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
        <RefreshCw size={16} /> Обновить
      </button>
    </header>

    {error && <div className="dashboard-note" role="alert"><AlertCircle size={16} />{error}</div>}
    {notice && <div className="dashboard-note" role="status"><CheckCircle2 size={16} />{notice}</div>}

    <div className="telegram-monitor-grid">
      <section className="telegram-monitor-panel">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>Рабочие чаты</strong></div>
          <span>{chats.filter(chat => chat.organization_id && chat.restaurant_id).length} подключено</span>
        </div>
        {loadingChats ? <p className="empty">Загружаем чаты…</p> : chats.length === 0
          ? <div className="empty">Пока нет доступных чатов. Проверьте, что сообщения поступают, а чат привязан к организации и ресторану.</div>
          : <div className="telegram-chat-list">{chats.map(chat => {
            const bound = Boolean(chat.organization_id && chat.restaurant_id);
            return <button key={chat.chat_id} type="button"
              className={'telegram-chat-item' + (selectedChat === chat.chat_id ? ' is-active' : '')}
              onClick={() => { setSelectedChat(chat.chat_id); if (!bound) setBindingChat(chat.chat_id); }}>
              <span className="telegram-chat-item__icon"><MessageSquareText size={17} /></span>
              <span className="telegram-chat-item__copy">
                <strong>{chat.title || 'Telegram-группа'}</strong>
                <small>{chat.chat_type} · {chat.message_count} сообщ.</small>
                <small>{bound ? chat.restaurant_name || 'Ресторан привязан' : 'Не привязан к ресторану'} · {dateTime(chat.last_seen_at)}</small>
              </span>
              <span className={'telegram-chat-item__status ' + (bound ? 'is-bound' : 'is-unbound')}>{bound ? 'Подключён' : 'Нужна привязка'}</span>
            </button>;
          })}</div>}
        {canBind && chats.some(chat => !chat.organization_id || !chat.restaurant_id) && <div className="telegram-bind-box">
          <strong><Link2 size={16} /> Привязка чата</strong>
          <p>Доступна только администратору STEN. Укажите ID организации и ресторана — данные не будут показаны другим организациям.</p>
          <label>Чат<select value={bindingChat} onChange={event => setBindingChat(event.target.value)}>
            <option value="">Выберите чат</option>
            {chats.filter(chat => !chat.organization_id || !chat.restaurant_id).map(chat => <option key={chat.chat_id} value={chat.chat_id}>{chat.title || chat.chat_id} · {chat.chat_id}</option>)}
          </select></label>
          <label>ID организации<input value={organizationId} onChange={event => setOrganizationId(event.target.value)} placeholder="UUID организации" /></label>
          <label>ID ресторана<input value={restaurantId} onChange={event => setRestaurantId(event.target.value)} placeholder="UUID ресторана" /></label>
          <button className="primary-button" type="button" onClick={() => void bindChat()} disabled={binding}>{binding ? 'Привязываем…' : 'Привязать к ресторану'}</button>
        </div>}
      </section>

      <section className="telegram-monitor-panel telegram-monitor-feed">
        <div className="telegram-monitor-panel__head">
          <div><MessageSquareText size={18} /><strong>{selected?.title || 'Лента сообщений'}</strong></div>
          {selected && <span>{selected.restaurant_name || 'Без привязки'}</span>}
        </div>
        <label className="telegram-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по тексту сообщений" /></label>
        {!selectedChat ? <div className="empty">Выберите чат, чтобы открыть сообщения.</div>
          : loadingMessages ? <div className="empty">Загружаем сообщения…</div>
          : messages.length === 0 ? <div className="empty">Сообщений по этому запросу нет.</div>
          : <div className="telegram-message-list">{messages.map(message => <article className="telegram-message" key={message.chat_id + ':' + message.message_id}>
            <div className="telegram-message__meta"><strong>{message.sender_name || (message.sender_username ? '@' + message.sender_username : 'Участник группы')}</strong><time>{dateTime(message.message_date || message.received_at)}</time></div>
            <p>{message.message_text || 'Сообщение без текста'}</p>
            {message.edited_at && <small>Изменено: {dateTime(message.edited_at)}</small>}
          </article>)}</div>}
        <div className="telegram-monitor-footnote">Показаны реальные сохранённые сообщения. AI-анализ и изменение финансовых данных пока не запускаются автоматически.</div>
      </section>
    </div>
  </div>;
}
