import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, History, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/telegram-findings.css';
import '../../styles/telegram-findings.css';

type Chat = { chat_id: string; title: string | null; restaurant_id: string | null; restaurant_name: string | null; organization_id: string | null };
type Analysis = {
  intent: string; severity: 'low' | 'medium' | 'high' | 'critical'; confidence: number;
  summary: string; title: string | null; details: string | null; needsManagerAttention: boolean;
  actionProposal: { title: string; description: string; assigneeMention: string | null; dueAt: string | null; requiresManagerApproval: boolean } | null;
};
type Finding = {
  chat_id: string; message_id: string; restaurant_id: string; analysis_json: Analysis; created_at: string;
  source_message: string; source_sender: string | null; source_username: string | null; source_date: string | null;
  chat_title: string | null; restaurant_name: string; proposal_id: string | null;
  proposal_json: { title?: string; description?: string; assigneeMention?: string | null; dueAt?: string | null } | null;
  proposal_status: 'pending' | 'approved' | 'rejected' | null; reviewed_by: string | null; reviewed_at: string | null;
  review_reason: string | null; action_id: string | null;
  action_status: 'open' | 'overdue' | 'awaiting_verification' | 'verified' | 'cancelled' | null;
  action_title: string | null; assignee_name: string | null; due_at: string | null; completed_at: string | null; verified_at: string | null;
};
type Employee = { id: string; first_name: string; last_name: string; position: string | null };
type FindingStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'not_proposed';
type EventRow = { id: string; actor_id: string; event_type: string; details: Record<string, unknown>; created_at: string };
type Health = {
  webhook: { secret_configured: boolean; last_received_at: string | null; last_processed_at: string | null; pending: number | null; processing: number | null; failed: number | null; last_error_at: string | null };
  groups: { bound_groups: number; last_message_at: string | null };
  scheduler: { implemented: boolean; runtime_verified: boolean; required_trigger_interval: string };
};
type Diagnostic = { status: 'connected' | 'error'; bot_username: string | null; chat_title: string | null; bot_membership: string | null; can_send_messages: boolean; code?: string; message?: string; checked_at: string };
type Delivery = { id: string; chat_id: string; delivery_type: string; status: 'sending' | 'sent' | 'failed'; attempts: number; last_error: string | null; sent_at: string | null; created_at: string };
type BotSettings = {
  mode: 'observer' | 'secretary' | 'controller'; notification_level: 'urgent_only' | 'deviations' | 'all';
  morning_report_time: string; evening_report_time: string; escalation_minutes: number;
  morning_report_enabled: boolean; evening_report_enabled: boolean; timezone: string;
};
const defaultBotSettings: BotSettings = {
  mode: 'secretary', notification_level: 'deviations', morning_report_time: '10:00', evening_report_time: '21:00',
  escalation_minutes: 120, morning_report_enabled: false, evening_report_enabled: false, timezone: 'Europe/Moscow',
};
const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const severityLabel: Record<Analysis['severity'], string> = { low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая' };
const proposalStatusLabel: Record<Exclude<Finding['proposal_status'], null>, string> = { pending: 'Ожидает решения', approved: 'Подтверждено', rejected: 'Отклонено' };
const actionStatusLabel: Record<Exclude<Finding['action_status'], null>, string> = { open: 'Назначена · в работе', overdue: 'Просрочена', awaiting_verification: 'Ожидает проверки', verified: 'Проверена', cancelled: 'Отменена' };
const eventLabel: Record<string, string> = { created: 'Задача создана', created_from_ai_approval: 'Создана после подтверждения AI', complete: 'Исполнитель отметил выполнение', verify: 'Результат независимо проверен', reopen: 'Задача открыта повторно', cancel: 'Задача отменена', escalated: 'Отправлена эскалация', history_unavailable: 'История пока недоступна' };

export default function TelegramFindingsPanel({ chats }: { chats: Chat[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canApprove = ['super_admin','owner','admin','director'].includes(String(user?.role || '').toLowerCase());
  const scheduleRequest = useRef(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<FindingStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState('');
  const boundChats = useMemo(() => chats.filter(chat => chat.organization_id && chat.restaurant_id), [chats]);
  const [selectedChat, setSelectedChat] = useState('');
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveryError, setDeliveryError] = useState('');
  const [activeProposal, setActiveProposal] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [expandedEvents, setExpandedEvents] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [botSettings, setBotSettings] = useState<BotSettings>(defaultBotSettings);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleLoadFailed, setScheduleLoadFailed] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleNotice, setScheduleNotice] = useState('');
  const selectedChatInfo = useMemo(() => boundChats.find(chat => chat.chat_id === selectedChat), [boundChats, selectedChat]);

  const loadFindings = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get<{ findings: Finding[] }>('/api/telegram-monitor/findings?status=' + status + '&limit=100');
      setFindings(Array.isArray(response.findings) ? response.findings : []);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 404
        ? 'API AI-находок ещё не опубликован. После обновления backend здесь появятся реальные результаты; демонстрационные данные не подставляются.'
        : caught instanceof ApiError ? caught.message : 'Не удалось загрузить AI-находки.');
      setFindings([]);
    } finally { setLoading(false); }
  }, [status]);

  const loadHealth = useCallback(async () => {
    setHealthError('');
    try { setHealth(await api.get<Health>('/api/telegram-monitor/health')); }
    catch (caught) {
      setHealth(null);
      setHealthError(caught instanceof ApiError && caught.status === 404 ? 'Диагностика появится после публикации новой версии backend.' : caught instanceof ApiError ? caught.message : 'Не удалось получить состояние webhook.');
    }
  }, []);

  const loadDeliveries = useCallback(async (chatId: string) => {
    setDeliveryError('');
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (chatId) params.set('chat_id', chatId);
      const response = await api.get<{ deliveries: Delivery[] }>('/api/telegram-monitor/deliveries?' + params.toString());
      setDeliveries(Array.isArray(response.deliveries) ? response.deliveries : []);
    } catch (caught) {
      setDeliveries([]);
      setDeliveryError(caught instanceof ApiError && caught.status === 404 ? 'История доставки появится после публикации новой версии backend.' : caught instanceof ApiError ? caught.message : 'Не удалось загрузить историю доставки.');
    }
  }, []);

  useEffect(() => { void loadFindings(); }, [loadFindings]);
  useEffect(() => { void loadHealth(); }, [loadHealth]);
  useEffect(() => {
    if (!selectedChat && boundChats[0]?.chat_id) setSelectedChat(boundChats[0].chat_id);
    if (selectedChat && !boundChats.some(chat => chat.chat_id === selectedChat)) setSelectedChat(boundChats[0]?.chat_id || '');
  }, [boundChats, selectedChat]);
  useEffect(() => { void loadDeliveries(selectedChat); }, [loadDeliveries, selectedChat]);
  useEffect(() => {
    const request = ++scheduleRequest.current;
    if (!selectedChat) { setBotSettings(defaultBotSettings); setScheduleLoading(false); return; }
    setScheduleLoading(true); setScheduleError(''); setScheduleNotice(''); setScheduleLoadFailed(false);
    api.get<{ settings: BotSettings | null }>('/api/telegram-bot/settings?chat_id=' + encodeURIComponent(selectedChat))
      .then(response => { if (request === scheduleRequest.current) setBotSettings({ ...defaultBotSettings, ...(response.settings || {}) }); })
      .catch(caught => { if (request === scheduleRequest.current) { setScheduleLoadFailed(true); setScheduleError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить расписание группы.'); } })
      .finally(() => { if (request === scheduleRequest.current) setScheduleLoading(false); });
  }, [selectedChat]);

  const saveSchedule = async () => {
    if (!selectedChat) return;
    setScheduleSaving(true); setScheduleError(''); setScheduleNotice('');
    try {
      await api.put('/api/telegram-bot/settings', { chat_id: selectedChat, ...botSettings });
      setScheduleNotice('Расписание сохранено. Реальная отправка зависит от публикации backend и минутного Timer trigger в Yandex Cloud.');
    } catch (caught) { setScheduleError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить расписание.'); }
    finally { setScheduleSaving(false); }
  };

  const checkGroup = async () => {
    if (!selectedChat) return;
    setDiagnosticLoading(true); setDiagnostic(null);
    try {
      const response = await api.get<{ diagnostic: Diagnostic }>('/api/telegram-monitor/chats/' + encodeURIComponent(selectedChat) + '/diagnostics');
      setDiagnostic(response.diagnostic);
    } catch (caught) {
      setDiagnostic({ status: 'error', code: caught instanceof ApiError ? caught.code : 'DIAGNOSTIC_FAILED',
        message: caught instanceof ApiError ? caught.message : 'Не удалось проверить группу.', checked_at: new Date().toISOString(),
        bot_username: null, chat_title: null, bot_membership: null, can_send_messages: false });
    } finally { setDiagnosticLoading(false); }
  };

  const openApproval = async (finding: Finding) => {
    setActiveProposal(finding.proposal_id); setAssigneeId('');
    setDueAt(finding.proposal_json?.dueAt ? finding.proposal_json.dueAt.slice(0,16) : '');
    setDecisionError(''); setEmployees([]); setEmployeesLoading(true);
    try {
      const response = await api.get<{ employees: Employee[] }>('/api/operational-control?restaurant_id=' + encodeURIComponent(finding.restaurant_id));
      const next = Array.isArray(response.employees) ? response.employees : [];
      setEmployees(next);
      if (next.length === 1) setAssigneeId(String(next[0].id));
    } catch (caught) { setDecisionError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить сотрудников ресторана.'); }
    finally { setEmployeesLoading(false); }
  };

  const submitDecision = async (finding: Finding, decision: 'approve' | 'reject') => {
    if (!finding.proposal_id) return;
    setSavingDecision(true); setDecisionError('');
    try {
      if (decision === 'approve') {
        if (!assigneeId || !dueAt) { setDecisionError('Выберите исполнителя и срок задачи.'); return; }
        const deadline = new Date(dueAt);
        if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) { setDecisionError('Срок задачи должен быть в будущем.'); return; }
        await api.post('/api/telegram-monitor/findings/' + encodeURIComponent(finding.proposal_id) + '/decision', { decision, assignee_id: assigneeId, due_at: deadline.toISOString() });
      } else {
        await api.post('/api/telegram-monitor/findings/' + encodeURIComponent(finding.proposal_id) + '/decision', { decision, reason: 'Отклонено руководителем' });
      }
      setActiveProposal(null); await loadFindings();
    } catch (caught) { setDecisionError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить решение руководителя.'); }
    finally { setSavingDecision(false); }
  };

  const toggleEvents = async (actionId: string) => {
    if (expandedEvents === actionId) { setExpandedEvents(null); return; }
    setExpandedEvents(actionId); setEvents([]); setEventsLoading(true);
    try {
      const response = await api.get<{ events: EventRow[] }>('/api/operational-control/actions/' + encodeURIComponent(actionId) + '/events');
      setEvents(Array.isArray(response.events) ? response.events : []);
    } catch {
      setEvents([{ id: 'unavailable', actor_id: '', event_type: 'history_unavailable', details: {}, created_at: new Date().toISOString() }]);
    } finally { setEventsLoading(false); }
  };

  return <section className="telegram-findings" aria-labelledby="telegram-findings-title">
    <div className="telegram-findings__header">
      <div><span className="telegram-findings__eyebrow"><Sparkles size={14} /> AI · РАБОЧИЕ СИГНАЛЫ</span><h2 id="telegram-findings-title">Найдено AI</h2><p>Проблемы и предложения из сообщений Telegram. Задачи появляются только после решения руководителя.</p></div>
      <button type="button" className="secondary-button" onClick={() => { void loadFindings(); void loadHealth(); void loadDeliveries(selectedChat); }} disabled={loading}><RefreshCw size={15} /> Обновить</button>
    </div>
    <div className="telegram-findings__filters" role="group" aria-label="Фильтр AI-находок">
      {([{value:'all',label:'Все'},{value:'pending',label:'Ожидают решения'},{value:'approved',label:'Подтверждены'},{value:'rejected',label:'Отклонены'},{value:'not_proposed',label:'Без предложения'}] as const).map(item =>
        <button type="button" key={item.value} className={status === item.value ? 'is-active' : ''} onClick={() => setStatus(item.value)} aria-pressed={status === item.value}>{item.label}</button>
      )}
    </div>
    {error && <p className="telegram-findings__error" role="alert">{error}</p>}
    {loading ? <p className="telegram-findings__empty" role="status">Загружаем AI-находки…</p>
      : findings.length === 0 ? <p className="telegram-findings__empty">По выбранному фильтру AI-находок нет.</p>
      : <div className="telegram-findings__list">{findings.map(finding => {
        const analysis = finding.analysis_json;
        const pending = finding.proposal_status === 'pending';
        const active = activeProposal === finding.proposal_id;
        return <article className="telegram-finding" key={finding.chat_id + ':' + finding.message_id}>
          <div className="telegram-finding__top"><div className="telegram-finding__scope">{finding.restaurant_name} · {finding.chat_title || 'Telegram-группа'}</div><div className={'telegram-finding__severity is-' + analysis.severity}>{severityLabel[analysis.severity] || 'Не указана'}</div></div>
          <div className="telegram-finding__summary"><h3>{analysis.title || analysis.summary || 'AI-находка'}</h3><p>{analysis.summary}</p>{analysis.details && <p className="telegram-finding__details">{analysis.details}</p>}</div>
          <div className="telegram-finding__meta">
            <span>Уверенность AI: <strong>{Math.round(Math.max(0,Math.min(1,Number(analysis.confidence) || 0)) * 100)}%</strong></span>
            <span>Тип: <strong>{analysis.intent}</strong></span><span>Анализ: <strong>{dateTime(finding.created_at)}</strong></span>
          </div>
          <details className="telegram-finding__source"><summary>Сообщение-источник · {finding.source_sender || finding.source_username || 'Участник'} · {dateTime(finding.source_date)}</summary><blockquote>{finding.source_message || 'Текст сообщения отсутствует.'}</blockquote></details>
          <div className="telegram-finding__decision">
            {finding.proposal_status ? <span className={'telegram-finding__status is-' + finding.proposal_status}>{proposalStatusLabel[finding.proposal_status]}</span> : <span className="telegram-finding__status">Предложение действия не сформировано</span>}
            {finding.action_status && <span className={'telegram-finding__status is-action-' + finding.action_status}>{actionStatusLabel[finding.action_status]}</span>}
            {finding.action_id && <button type="button" className="telegram-findings__text-button" onClick={() => void toggleEvents(finding.action_id as string)}><History size={14} /> История задачи</button>}
            {finding.action_id && <button type="button" className="telegram-findings__text-button" onClick={() => navigate('/ops')}><ExternalLink size={14} /> Открыть задачи</button>}
          </div>
          {finding.action_id && expandedEvents === finding.action_id && <div className="telegram-finding__history">{eventsLoading ? <span>Загружаем историю…</span> : events.length === 0 ? <span>История событий пока пуста.</span> : events.map(event => <div key={event.id}><strong>{eventLabel[event.event_type] || event.event_type}</strong><time>{dateTime(event.created_at)}</time></div>)}</div>}
          {pending && canApprove && <div className="telegram-finding__actions">
            {!active ? <button type="button" className="primary-button" onClick={() => void openApproval(finding)}><ShieldCheck size={15} /> Подтвердить и назначить</button>
              : <div className="telegram-finding__approval-form">
                  <label>Исполнитель<select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} disabled={employeesLoading || employees.length === 0}><option value="">{employeesLoading ? 'Загружаем сотрудников…' : 'Выберите сотрудника'}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{[employee.first_name,employee.last_name].filter(Boolean).join(' ')}{employee.position ? ' · ' + employee.position : ''}</option>)}</select></label>
                  <label>Срок выполнения<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
                  {decisionError && <p role="alert" className="telegram-findings__error">{decisionError}</p>}
                  <div><button type="button" className="primary-button" onClick={() => void submitDecision(finding,'approve')} disabled={savingDecision || employeesLoading || !employees.length}><CheckCircle2 size={15} /> {savingDecision ? 'Создаём задачу…' : 'Создать и назначить'}</button><button type="button" className="secondary-button" onClick={() => setActiveProposal(null)} disabled={savingDecision}>Отмена</button></div>
                </div>}
            <button type="button" className="telegram-findings__reject" onClick={() => void submitDecision(finding,'reject')} disabled={savingDecision || active}><XCircle size={15} /> Отклонить</button>
          </div>}
          {pending && !canApprove && <p className="telegram-finding__assigned">Ожидает решения руководителя. Подтверждение доступно владельцу, администратору или директору.</p>}
          {finding.proposal_status === 'approved' && finding.action_id && <p className="telegram-finding__assigned">Назначено: {finding.assignee_name || 'Исполнитель указан'} · срок {dateTime(finding.due_at)}. Отметка выполнения и независимая проверка ведутся в операционном контроле.</p>}
          {finding.proposal_status === 'rejected' && finding.review_reason && <p className="telegram-finding__assigned">Причина: {finding.review_reason}</p>}
        </article>;
      })}</div>}

    <section className="telegram-findings__diagnostics" aria-labelledby="telegram-diagnostics-title">
      <div className="telegram-findings__diagnostics-head"><div><h3 id="telegram-diagnostics-title">Связь и доставка</h3><p>Состояние входящих сообщений, доступ бота к группе и журнал исходящих отправок.</p></div><button type="button" className="secondary-button" onClick={() => { void loadHealth(); void loadDeliveries(selectedChat); }}><RefreshCw size={14} /> Проверить</button></div>
      {healthError && <p className="telegram-findings__error" role="alert">{healthError}</p>}
      {health && <div className="telegram-findings__health">
        <span><strong>Webhook:</strong> {health.webhook.secret_configured ? 'секрет настроен' : 'секрет не настроен'}</span>
        <span><strong>Последнее сообщение:</strong> {dateTime(health.webhook.last_received_at)}</span>
        <span><strong>В очереди:</strong> {health.webhook.pending ?? '—'} · <strong>ошибок:</strong> {health.webhook.failed ?? '—'}</span>
        <span><strong>Привязано групп:</strong> {health.groups.bound_groups ?? '—'}</span>
        <span className="is-warning"><AlertCircle size={14} /> Таймер: {health.scheduler.runtime_verified ? 'работа подтверждена' : 'интервал запуска в Yandex Cloud не подтверждён'}; требуется запуск раз в минуту.</span>
      </div>}
      <div className="telegram-findings__schedule">
        <h3>Плановые сводки</h3>
        <p>Расписание хранится отдельно для каждой группы. Отправка не считается включённой, пока не опубликован backend и не подтверждён минутный Timer trigger.</p>
        {scheduleLoading ? <p role="status">Загружаем настройки группы…</p> : <>
          <div className="telegram-findings__schedule-grid">
            <label className="telegram-findings__toggle"><input type="checkbox" checked={botSettings.morning_report_enabled} onChange={event => setBotSettings(value => ({ ...value, morning_report_enabled: event.target.checked }))} /><span>Утренняя сводка</span></label>
            <label>Время<input type="time" value={botSettings.morning_report_time} onChange={event => setBotSettings(value => ({ ...value, morning_report_time: event.target.value }))} /></label>
            <label className="telegram-findings__toggle"><input type="checkbox" checked={botSettings.evening_report_enabled} onChange={event => setBotSettings(value => ({ ...value, evening_report_enabled: event.target.checked }))} /><span>Вечерняя сводка</span></label>
            <label>Время<input type="time" value={botSettings.evening_report_time} onChange={event => setBotSettings(value => ({ ...value, evening_report_time: event.target.value }))} /></label>
            <label>Часовой пояс<select value={botSettings.timezone} onChange={event => setBotSettings(value => ({ ...value, timezone: event.target.value }))}>
              <option value="Europe/Moscow">Москва · Europe/Moscow</option><option value="Europe/Berlin">Берлин · Europe/Berlin</option><option value="Europe/London">Лондон · Europe/London</option><option value="Europe/Istanbul">Стамбул · Europe/Istanbul</option><option value="Asia/Dubai">Дубай · Asia/Dubai</option>
            </select></label>
          </div>
          {scheduleError && <p className="telegram-findings__error" role="alert">{scheduleError}</p>}
          {scheduleNotice && <p className="telegram-findings__notice" role="status">{scheduleNotice}</p>}
          <button type="button" className="primary-button" onClick={() => void saveSchedule()} disabled={scheduleSaving || scheduleLoading || scheduleLoadFailed || !selectedChat}><Clock3 size={15} /> {scheduleSaving ? 'Сохраняем…' : 'Сохранить расписание'}</button>
        </>}
      </div>
      <div className="telegram-findings__group-check">
        <label>Группа для диагностики<select value={selectedChat} onChange={event => { setSelectedChat(event.target.value); setDiagnostic(null); }}>
          <option value="">Выберите группу</option>{boundChats.map(chat => <option key={chat.chat_id} value={chat.chat_id}>{chat.restaurant_name || 'Ресторан'} · {chat.title || chat.chat_id}</option>)}
        </select></label>
        <button type="button" className="secondary-button" onClick={() => void checkGroup()} disabled={!selectedChat || diagnosticLoading}>{diagnosticLoading ? 'Проверяем…' : 'Проверить группу'}</button>
      </div>
      {diagnostic && <p className={'telegram-findings__diagnostic-result ' + (diagnostic.status === 'connected' && diagnostic.can_send_messages ? 'is-ok' : 'is-error')} role="status">
        {diagnostic.status === 'connected' && diagnostic.can_send_messages ? <><CheckCircle2 size={15} /> Бот доступен: @{diagnostic.bot_username || 'bot'} · статус {diagnostic.bot_membership} · может отправлять сообщения.</> : <><AlertCircle size={15} /> {diagnostic.message || 'Нет подтверждения, что бот может отправлять сообщения в выбранную группу.'} {diagnostic.code ? '(' + diagnostic.code + ')' : ''}</>}
      </p>}
      <div className="telegram-findings__delivery-head"><strong>История доставки</strong><span>{selectedChatInfo ? selectedChatInfo.title || selectedChatInfo.restaurant_name : 'Все группы организации'}</span></div>
      {deliveryError && <p className="telegram-findings__error" role="alert">{deliveryError}</p>}
      {deliveries.length === 0 ? <p className="telegram-findings__empty">Записей доставки пока нет.</p> : <div className="telegram-findings__deliveries">{deliveries.map(item =>
        <div key={item.id}><span className={'telegram-findings__delivery-state is-' + item.status}>{item.status === 'sent' ? 'Отправлено' : item.status === 'failed' ? 'Ошибка' : 'Отправляется'}</span><strong>{item.delivery_type === 'morning' ? 'Утренняя сводка' : item.delivery_type === 'evening' ? 'Вечерняя сводка' : item.delivery_type === 'escalation' ? 'Эскалация' : item.delivery_type}</strong><time>{dateTime(item.sent_at || item.created_at)}</time><small>Попыток: {item.attempts}{item.last_error ? ' · ' + item.last_error : ''}</small></div>
      )}</div>}
    </section>
  </section>;
}
