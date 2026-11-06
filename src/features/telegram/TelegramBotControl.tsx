import { useCallback, useEffect, useState } from 'react';
import { Bot, Save, ShieldCheck, Clock3, Bell, RefreshCw, AlertCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
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
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState('');
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await api.get<{ chats: Chat[] }>('/api/telegram-monitor/chats');
      const bound = (response.chats || []).filter(chat => chat.organization_id && chat.restaurant_id);
      setChats(bound);
      setChatId(current => bound.some(chat => chat.chat_id === current) ? current : bound[0]?.chat_id || '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить подключённые группы.');
    } finally { setLoading(false); }
  }, []);

  const loadSettings = useCallback(async (id: string) => {
    if (!id) { setSettings(defaults); return; }
    try {
      const response = await api.get<{ settings: Settings | null }>('/api/telegram-bot/settings?chat_id=' + encodeURIComponent(id));
      setSettings({ ...defaults, ...(response.settings || {}) });
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Не удалось загрузить настройки бота.'); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSettings(chatId); }, [chatId, loadSettings]);

  const save = async () => {
    if (!chatId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.put('/api/telegram-bot/settings', { chat_id: chatId, ...settings });
      setNotice('Настройки сохранены для выбранной группы. Это не включает автоматическую отправку.');
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
      <div className="telegram-bot-control__automation-status" role="status" aria-live="polite">
        <AlertCircle size={17} />
        <span><strong>Автоматическая отправка отключена.</strong> Утренние и вечерние сводки, а также эскалация по расписанию пока не отправляются. Время и интервал ниже сохраняются только как предпочтения.</span>
      </div>
      <div className="telegram-bot-control__grid">
        <label className="telegram-bot-control__field"><span>Режим работы</span><select value={settings.mode} onChange={e => setSettings(v => ({ ...v, mode: e.target.value as Settings['mode'] }))}>
          <option value="observer">Наблюдатель — анализирует, не предлагает поручения</option>
          <option value="secretary">Секретарь — готовит предложения на подтверждение</option>
          <option value="controller" disabled>Операционный контролёр — будет доступен после запуска контура исполнения</option>
        </select></label>
        <label className="telegram-bot-control__field"><span>Какие события показывать</span><select value={settings.notification_level} onChange={e => setSettings(v => ({ ...v, notification_level: e.target.value as Settings['notification_level'] }))}>
          <option value="urgent_only">Только срочные</option><option value="deviations">Срочные и отклонения</option><option value="all">Все рабочие события</option>
        </select></label>
        <label className="telegram-bot-control__field"><span><Clock3 size={14} /> Желаемое время утренней сводки</span><input type="time" value={settings.morning_report_time} onChange={e => setSettings(v => ({ ...v, morning_report_time: e.target.value }))} /></label>
        <label className="telegram-bot-control__field"><span><Clock3 size={14} /> Желаемое время вечерней сводки</span><input type="time" value={settings.evening_report_time} onChange={e => setSettings(v => ({ ...v, evening_report_time: e.target.value }))} /></label>
        <label className="telegram-bot-control__field"><span><Bell size={14} /> Желаемый интервал эскалации</span><select value={settings.escalation_minutes} onChange={e => setSettings(v => ({ ...v, escalation_minutes: Number(e.target.value) }))}>
          <option value={60}>1 час</option><option value={120}>2 часа</option><option value={240}>4 часа</option><option value={480}>8 часов</option><option value={1440}>24 часа</option>
        </select></label>
      </div>
      <div className="telegram-bot-control__approval"><ShieldCheck size={17} /><span><strong>Подтверждение руководителя обязательно.</strong> В режиме «Секретарь» STEN готовит предложения. Автоматическая отправка команд, контроль исполнения и закрытие поручений пока не включены — они требуют отдельного контура утверждения и проверки.</span></div>
      <div className="telegram-bot-control__footer">{error && <p role="alert" className="telegram-bot-control__error">{error}</p>}{notice && <p role="status" className="telegram-bot-control__success">{notice}</p>}<button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !chatId}><Save size={16} /> {saving ? 'Сохраняем…' : 'Сохранить настройки'}</button></div>
    </>}
  </section>;
}
