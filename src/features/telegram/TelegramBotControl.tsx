import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Save, ShieldCheck, Clock3, Bell, RefreshCw, AlertCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/telegram-bot-control.css';

type Chat = { chat_id: string; title: string | null; restaurant_id: string | null; restaurant_name: string | null; organization_id: string | null };
type Settings = {
  mode: 'observer' | 'secretary' | 'controller';
  notification_level: 'urgent_only' | 'deviations' | 'all';
  morning_report_time: string;
  evening_report_time: string;
  escalation_minutes: number;
};
const defaults: Settings = { mode: 'secretary', notification_level: 'deviations', morning_report_time: '10:00', evening_report_time: '21:00', escalation_minutes: 120 };

export default function TelegramBotControl() {
  const { user } = useAuth();
  const settingsRequest = useRef(0);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState('');
  const [settings, setSettings] = useState<Settings>(defaults);
  const [settingsConfigured, setSettingsConfigured] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await api.get<{ chats: Chat[] }>('/api/telegram-monitor/chats');
      const bound = (response.chats || []).filter(chat => chat.organization_id === user?.organizationId && chat.restaurant_id);
      setChats(bound);
      setChatId(current => bound.some(chat => chat.chat_id === current) ? current : bound[0]?.chat_id || '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить подключённые группы.');
    } finally { setLoading(false); }
  }, [user?.organizationId]);

  const loadSettings = useCallback(async (id: string) => {
    const request = ++settingsRequest.current;
    if (!id) { setSettings(defaults); setSettingsConfigured(false); setSettingsLoadFailed(false); return; }
    setSettings(defaults);
    setSettingsConfigured(false);
    setSettingsLoading(true);
    setSettingsLoadFailed(false);
    setError('');
    try {
      const response = await api.get<{ settings: Settings | null }>('/api/telegram-bot/settings?chat_id=' + encodeURIComponent(id));
      if (request !== settingsRequest.current) return;
      setSettings({ ...defaults, ...(response.settings || {}) });
      setSettingsConfigured(Boolean(response.settings));
    } catch (e) {
      if (request === settingsRequest.current) {
        setSettingsLoadFailed(true);
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить настройки бота.');
      }
    } finally { if (request === settingsRequest.current) setSettingsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSettings(chatId); }, [chatId, loadSettings]);

  const save = async () => {
    if (!chatId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.put('/api/telegram-bot/settings', { chat_id: chatId, ...settings });
      setSettingsConfigured(true);
      setNotice('Правила сохранены для выбранной группы. Автоматическая отправка и эскалация не запускаются.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось сохранить настройки.'); }
    finally { setSaving(false); }
  };

  const selected = chats.find(chat => chat.chat_id === chatId);
  return <section className="telegram-bot-control panel" aria-labelledby="telegram-bot-control-title">
    <div className="telegram-bot-control__header">
      <div><span className="telegram-bot-control__icon"><Bot size={19} /></span><div><span className="eyebrow">УПРАВЛЕНИЕ</span><h2 id="telegram-bot-control-title">Настройка бота</h2><p>Выберите группу и задайте режим работы. Правила применяются только к выбранному ресторану.</p></div></div>
      <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Обновить</button>
    </div>
    {loading ? <div className="telegram-bot-control__empty">Загружаем подключённые группы…</div> : chats.length === 0 ? <div className="telegram-bot-control__empty">Нет привязанных Telegram-групп. Сначала подключите группу к ресторану в разделе мониторинга.</div> : <>
      <label className="telegram-bot-control__field"><span>Рабочая группа</span><select value={chatId} onChange={e => setChatId(e.target.value)}>{chats.map(chat => <option key={chat.chat_id} value={chat.chat_id}>{chat.restaurant_name || 'Ресторан'} · {chat.title || 'Telegram-группа'}</option>)}</select></label>
      {selected && <div className="telegram-bot-control__scope"><ShieldCheck size={15} /> {selected.restaurant_name || 'Ресторан'} · настройки изолированы от остальных групп</div>}
      {settingsLoading ? <p className="telegram-bot-control__config-state" role="status">Загружаем сохранённые правила…</p>
        : settingsLoadFailed ? <p className="telegram-bot-control__config-state is-error" role="alert">Не удалось прочитать настройки. Сохранение отключено, чтобы не перезаписать неизвестные серверные значения.</p>
        : <p className="telegram-bot-control__config-state" role="status">{settingsConfigured ? 'Правила этой группы сохранены на сервере.' : 'Для этой группы правила ещё не сохранены. Ниже показаны начальные значения — они не применятся, пока вы не нажмёте «Сохранить настройки».'}</p>}
      <div className="telegram-bot-control__automation-status" role="status" aria-live="polite">
        <AlertCircle size={17} />
        <span><strong>Автоматическая отправка отключена.</strong> Утренние и вечерние сводки, а также эскалация по расписанию пока не отправляются. Время и интервал ниже сохраняются только как предпочтения.</span>
      </div>
      <div className="telegram-bot-control__grid">
        <label className="telegram-bot-control__field"><span>Режим работы</span><select value={settings.mode} onChange={e => setSettings(v => ({ ...v, mode: e.target.value as Settings['mode'] }))}>
          <option value="observer">Наблюдатель — анализ без предложений действий</option>
          <option value="secretary">Секретарь — AI готовит предложения; выполнение требует подтверждения</option>
          <option value="controller" disabled>Операционный контролёр — автоматическое исполнение ещё не подключено</option>
        </select></label>
        <label className="telegram-bot-control__field"><span>Уровень событий (сохраняемое правило)</span><select value={settings.notification_level} onChange={e => setSettings(v => ({ ...v, notification_level: e.target.value as Settings['notification_level'] }))}>
          <option value="urgent_only">Только срочные</option><option value="deviations">Срочные и отклонения</option><option value="all">Все рабочие события</option>
        </select></label>
        <label className="telegram-bot-control__field"><span><Clock3 size={14} /> Предпочтительное время утренней сводки</span><input type="time" value={settings.morning_report_time} onChange={e => setSettings(v => ({ ...v, morning_report_time: e.target.value }))} /></label>
        <label className="telegram-bot-control__field"><span><Clock3 size={14} /> Предпочтительное время вечерней сводки</span><input type="time" value={settings.evening_report_time} onChange={e => setSettings(v => ({ ...v, evening_report_time: e.target.value }))} /></label>
        <label className="telegram-bot-control__field"><span><Bell size={14} /> Предпочтительный интервал эскалации</span><select value={settings.escalation_minutes} onChange={e => setSettings(v => ({ ...v, escalation_minutes: Number(e.target.value) }))}>
          <option value={60}>1 час</option><option value={120}>2 часа</option><option value={240}>4 часа</option><option value={480}>8 часов</option><option value={1440}>24 часа</option>
        </select></label>
      </div>
      <div className="telegram-bot-control__approval"><ShieldCheck size={17} /><span><strong>Подтверждение руководителя обязательно.</strong> AI-анализатор может подготовить предложение действия для подходящего сообщения. Создание задачи, принятие её исполнителем, контроль срока, эскалация и закрытие поручения из Telegram пока не подключены.</span></div>
      <p className="telegram-bot-control__filter-note">Уровень событий, время сводок и интервал эскалации сохраняются для группы. Фильтрация результатов по уровню, отправка сводок по расписанию и автоматическая эскалация сейчас не выполняются.</p>
      <div className="telegram-bot-control__footer">{error && <p role="alert" className="telegram-bot-control__error">{error}</p>}{notice && <p role="status" className="telegram-bot-control__success">{notice}</p>}<button type="button" className="primary-button" onClick={() => void save()} disabled={saving || settingsLoading || settingsLoadFailed || !chatId}><Save size={16} /> {saving ? 'Сохраняем…' : 'Сохранить настройки'}</button></div>
    </>}
  </section>;
}
