import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import TelegramFindingsPanel from '../features/telegram/TelegramFindingsPanel';
import '../styles/telegram-monitor.css';

type Chat = { chat_id: string; chat_type: string; title: string | null; organization_id: string | null; restaurant_id: string | null; restaurant_name: string | null; message_count: number };

export default function TelegramFindingsPage() {
  const [chats,setChats] = useState<Chat[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get<{chats:Chat[]}>('/api/telegram-monitor/chats');
      setChats(Array.isArray(response.chats) ? response.chats : []);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить список Telegram-групп.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="page telegram-monitor-page">
    <header className="page-header"><div><span className="sten-state-eyebrow">TELEGRAM · AI-КОНТРОЛЬ</span><h1>Найдено AI</h1><p>От AI-сигнала до подтверждённой и проверенной задачи.</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Обновить группы</button></header>
    {error && <div className="dashboard-note" role="alert"><AlertCircle size={16} />{error}</div>}
    {loading ? <div className="empty" role="status">Загружаем рабочие группы…</div> : <TelegramFindingsPanel chats={chats} />}
  </div>;
}
