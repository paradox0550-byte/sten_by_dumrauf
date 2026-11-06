import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Check, ChevronDown, ChevronUp, Clock3, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import '../../styles/telegram-operational-workflow.css';

type Analysis = {
  intent?: string;
  severity?: string;
  confidence?: number;
  summary?: string;
  title?: string | null;
  details?: string | null;
  actionProposal?: {
    title?: string;
    description?: string;
    assigneeMention?: string | null;
    dueAt?: string | null;
    requiresManagerApproval?: boolean;
  } | null;
};
type Finding = {
  finding_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'action_created';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  action_id: string | null;
  analysis_json: Analysis;
  created_at: string;
  restaurant_id: string;
  restaurant_name: string;
  chat_id: string;
  message_id: string;
  sender_name: string | null;
  sender_username: string | null;
  message_text: string | null;
  message_date: string | null;
  chat_title: string | null;
};
type Employee = { id: string; first_name: string | null; last_name: string | null; position: string | null };
type Health = {
  database?: { last_received_at?: string | null; received_24h?: number; pending?: number; processing?: number };
  recent_processing_errors?: Array<{ update_id: number; received_at: string; last_error: string; processing_attempts: number }>;
  bot_api?: { status?: string; webhook_url_configured?: boolean; pending_update_count?: number; last_error_message?: string | null; error_code?: string };
};
type Delivery = { id: string; chat_id: string; method: string; status: 'sent' | 'failed'; error_code: string | null; error_message: string | null; created_at: string };
type Diagnostic = { id: string; status: string; details_json: Record<string, unknown>; checked_at: string };

type Filter = 'pending' | 'action_created' | 'rejected' | 'all';

const statusLabels: Record<Finding['status'], string> = {
  pending: 'Ожидает решения',
  approved: 'Подтверждено',
  rejected: 'Отклонено',
  action_created: 'Задача создана',
};
const severityLabels: Record<string, string> = {
  low: 'Низкая', medium: 'Средняя', high: 'Высокая', critical: 'Критическая',
};
const intentLabels: Record<string, string> = {
  issue: 'Проблема', task: 'Поручение', commitment: 'Обязательство',
  urgent: 'Срочно', information: 'Информация', ignore: 'Не рабочее событие',
};
const dateTime = (value?: string | null) => {
  if (!value) return 'Время не указано';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Время не указано'
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const localDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function TelegramOperationalWorkflow({ selectedChatId }: { selectedChatId?: string }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acting, setActing] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [monitorError, setMonitorError] = useState('');

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter === 'all' ? '' : '?status=' + encodeURIComponent(filter);
      const response = await api.get<{ findings: Finding[] }>('/api/telegram-monitor/findings' + query);
      setFindings(Array.isArray(response.findings) ? response.findings : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить AI-находки.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadMonitoring = useCallback(async () => {
    setMonitorError('');
    try {
      const [healthResponse, deliveryResponse] = await Promise.all([
        api.get<Health>('/api/telegram-monitor/health'),
        api.get<{ deliveries: Delivery[] }>('/api/telegram-monitor/deliveries?limit=8'),
      ]);
      setHealth(healthResponse);
      setDeliveries(Array.isArray(deliveryResponse.deliveries) ? deliveryResponse.deliveries : []);
    } catch (e) {
      setMonitorError(e instanceof ApiError ? e.message : 'Не удалось загрузить состояние Telegram.');
    }
  }, []);

  useEffect(() => { void loadFindings(); }, [loadFindings]);
  useEffect(() => { void loadMonitoring(); }, [loadMonitoring]);

  const counts = useMemo(() => ({
    pending: findings.filter(item => item.status === 'pending').length,
    tasks: findings.filter(item => item.status === 'action_created').length,
    rejected: findings.filter(item => item.status === 'rejected').length,
  }), [findings]);

  const openReview = async (finding: Finding) => {
    if (expandedId === finding.finding_id) {
      setExpandedId('');
      return;
    }
    setExpandedId(finding.finding_id);
    setError('');
    setNotice('');
    const proposal = finding.analysis_json.actionProposal;
    setTitle(proposal?.title || finding.analysis_json.title || finding.analysis_json.summary || '');
    setDescription(proposal?.description || finding.analysis_json.details || '');
    setDueAt(localDateTimeInput(proposal?.dueAt));
    setAssigneeId('');
    setEmployees([]);
    setEmployeesLoading(true);
    try {
      const response = await api.get<{ employees: Employee[] }>(
        '/api/operational-control?restaurant_id=' + encodeURIComponent(finding.restaurant_id)
      );
      const available = Array.isArray(response.employees) ? response.employees : [];
      setEmployees(available);
      const mention = String(proposal?.assigneeMention || '').toLocaleLowerCase('ru');
      const suggested = mention
        ? available.find(person => [person.first_name, person.last_name, person.position].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(mention))
        : null;
      if (suggested) setAssigneeId(suggested.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить список исполнителей.');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const approve = async (finding: Finding) => {
    if (!assigneeId || !dueAt) {
      setError('Выберите исполнителя и срок выполнения.');
      return;
    }
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
      setError('Срок задачи должен быть в будущем.');
      return;
    }
    setActing(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/telegram-monitor/findings/' + encodeURIComponent(finding.finding_id) + '/approve', {
        assignee_id: assigneeId,
        due_at: due.toISOString(),
        title: title.trim() || undefined,
        description: description.trim(),
      });
      setNotice('Предложение подтверждено. Задача создана и назначена.');
      setExpandedId('');
      await loadFindings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось подтвердить предложение.');
    } finally {
      setActing(false);
    }
  };

  const reject = async (finding: Finding) => {
    setActing(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/telegram-monitor/findings/' + encodeURIComponent(finding.finding_id) + '/reject', { note: '' });
      setNotice('AI-находка отклонена. Решение сохранено в истории.');
      setExpandedId('');
      await loadFindings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось отклонить AI-находку.');
    } finally {
      setActing(false);
    }
  };

  const diagnoseSelected = async () => {
    if (!selectedChatId) return;
    setDiagnosing(true);
    setMonitorError('');
    try {
      await api.post('/api/telegram-monitor/chats/' + encodeURIComponent(selectedChatId) + '/diagnose', {});
      const response = await api.get<{ diagnostics: Diagnostic[] }>(
        '/api/telegram-monitor/chats/' + encodeURIComponent(selectedChatId) + '/diagnostics'
      );
      setDiagnostics(Array.isArray(response.diagnostics) ? response.diagnostics : []);
      await loadMonitoring();
    } catch (e) {
      setMonitorError(e instanceof ApiError ? e.message : 'Не удалось проверить Telegram-группу.');
    } finally {
      setDiagnosing(false);
    }
  };

  const loadDiagnostics = useCallback(async () => {
    if (!selectedChatId) { setDiagnostics([]); return; }
    try {
      const response = await api.get<{ diagnostics: Diagnostic[] }>(
        '/api/telegram-monitor/chats/' + encodeURIComponent(selectedChatId) + '/diagnostics'
      );
      setDiagnostics(Array.isArray(response.diagnostics) ? response.diagnostics : []);
    } catch { setDiagnostics([]); }
  }, [selectedChatId]);
  useEffect(() => { void loadDiagnostics(); }, [loadDiagnostics]);

  const botStatus = health?.bot_api?.status || 'unknown';
  return <section className="telegram-workflow" aria-label="AI-находки и состояние Telegram">
    <div className="telegram-workflow__head">
      <div>
        <span className="telegram-workflow__eyebrow"><Sparkles size={14} /> AI · ОПЕРАЦИОННЫЕ РЕШЕНИЯ</span>
        <h2>Найдено AI</h2>
        <p>Проблемы и поручения из рабочих сообщений. Любое действие создаётся только после подтверждения руководителя.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => { void loadFindings(); void loadMonitoring(); }} disabled={loading}>
        <RefreshCw size={15} /> Обновить
      </button>
    </div>

    <div className="telegram-workflow__stats">
      <div><strong>{counts.pending}</strong><span>Ожидают решения</span></div>
      <div><strong>{counts.tasks}</strong><span>Связаны с задачей</span></div>
      <div><strong>{counts.rejected}</strong><span>Отклонено</span></div>
    </div>

    <div className="telegram-workflow__filters" role="group" aria-label="Фильтр AI-находок">
      {([
        ['pending', 'Ожидают решения'], ['action_created', 'Созданы задачи'],
        ['rejected', 'Отклонённые'], ['all', 'Все'],
      ] as const).map(([value, label]) => (
        <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
      ))}
    </div>

    {error && <p className="telegram-workflow__message is-error" role="alert">{error}</p>}
    {notice && <p className="telegram-workflow__message is-success" role="status">{notice}</p>}
    {loading ? <p className="telegram-workflow__empty" role="status">Загружаем AI-находки…</p>
      : findings.length === 0 ? <p className="telegram-workflow__empty">В этом списке пока нет AI-находок.</p>
      : <div className="telegram-workflow__findings">
        {findings.map(finding => {
          const analysis = finding.analysis_json || {};
          const proposal = analysis.actionProposal;
          const expanded = expandedId === finding.finding_id;
          const confidence = Number(analysis.confidence);
          const confidenceLabel = Number.isFinite(confidence) ? Math.round(confidence * 100) + '%' : 'Не определена';
          const severity = severityLabels[String(analysis.severity || 'low')] || 'Не определена';
          return <article className="telegram-workflow__finding" key={finding.finding_id}>
            <div className="telegram-workflow__finding-head">
              <div className="telegram-workflow__finding-title">
                <span className={'telegram-workflow__severity severity-' + String(analysis.severity || 'low')}>{severity}</span>
                <span className="telegram-workflow__intent">{intentLabels[String(analysis.intent || '')] || 'Событие'}</span>
                <span className="telegram-workflow__status">{statusLabels[finding.status]}</span>
              </div>
              <button type="button" className="telegram-workflow__expand" aria-expanded={expanded}
                onClick={() => void openReview(finding)}>
                {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                {expanded ? 'Свернуть' : finding.status === 'pending' ? 'Рассмотреть' : 'Подробнее'}
              </button>
            </div>
            <h3>{analysis.summary || analysis.title || 'AI-находка без краткого описания'}</h3>
            {analysis.details && <p className="telegram-workflow__details">{analysis.details}</p>}
            <div className="telegram-workflow__metrics">
              <span><strong>Уверенность</strong> {confidenceLabel}</span>
              <span><strong>Ресторан</strong> {finding.restaurant_name || 'Не указан'}</span>
              <span><strong>Источник</strong> {finding.chat_title || 'Telegram'} · {dateTime(finding.message_date)}</span>
            </div>
            <div className="telegram-workflow__source">
              <span>Сообщение-источник · {finding.sender_name || finding.sender_username || 'Участник'}</span>
              <blockquote>{finding.message_text || 'Текст исходного сообщения отсутствует.'}</blockquote>
            </div>
            {finding.action_id && <p className="telegram-workflow__linked-task"><Check size={15} /> Задача создана: <code>{finding.action_id}</code></p>}
            {finding.review_note && <p className="telegram-workflow__review-note">Комментарий руководителя: {finding.review_note}</p>}
            {expanded && finding.status === 'pending' && <div className="telegram-workflow__review">
              {proposal ? <>
                <div className="telegram-workflow__proposal">
                  <ShieldCheck size={16} />
                  <span><strong>Предложение AI требует подтверждения.</strong> После согласования будет создана задача в операционном контроле.</span>
                </div>
                <label><span>Название задачи</span><input value={title} maxLength={180} onChange={event => setTitle(event.target.value)} /></label>
                <label><span>Описание</span><textarea value={description} rows={3} maxLength={1000} onChange={event => setDescription(event.target.value)} /></label>
                <div className="telegram-workflow__review-grid">
                  <label><span>Исполнитель</span>
                    <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} disabled={employeesLoading}>
                      <option value="">{employeesLoading ? 'Загружаем сотрудников…' : 'Выберите исполнителя'}</option>
                      {employees.map(person => <option key={person.id} value={person.id}>
                        {[person.first_name, person.last_name].filter(Boolean).join(' ') || 'Сотрудник'}{person.position ? ' · ' + person.position : ''}
                      </option>)}
                    </select>
                  </label>
                  <label><span>Срок выполнения</span><input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
                </div>
                <div className="telegram-workflow__review-actions">
                  <button type="button" className="primary-button" onClick={() => void approve(finding)} disabled={acting || employeesLoading || !employees.length}>
                    <Check size={15} /> {acting ? 'Сохраняем…' : 'Подтвердить и создать задачу'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void reject(finding)} disabled={acting}>
                    <X size={15} /> Отклонить
                  </button>
                </div>
              </> : <p className="telegram-workflow__empty">AI не сформировал предложение действия. Находка доступна для анализа, но задача не создаётся автоматически.</p>}
            </div>}
          </article>;
        })}
      </div>}

    <div className="telegram-workflow__monitor">
      <div className="telegram-workflow__monitor-head">
        <div><Activity size={17} /><strong>Состояние Telegram</strong></div>
        <button type="button" className="secondary-button" onClick={() => { void loadMonitoring(); void loadDiagnostics(); }}><RefreshCw size={14} /> Проверить статус</button>
      </div>
      {monitorError && <p className="telegram-workflow__message is-error" role="alert">{monitorError}</p>}
      <div className="telegram-workflow__health-grid">
        <div><span>Bot API</span><strong className={botStatus === 'connected' ? 'is-good' : 'is-warning'}>{botStatus === 'connected' ? 'Подключён' : botStatus === 'not_configured' ? 'Не настроен' : botStatus === 'unavailable' ? 'Недоступен' : 'Нет данных'}</strong></div>
        <div><span>Webhook URL</span><strong>{health?.bot_api?.webhook_url_configured ? 'Настроен' : health?.bot_api?.status === 'connected' ? 'Не настроен' : 'Нет данных'}</strong></div>
        <div><span>Сообщений за 24 часа</span><strong>{health?.database?.received_24h ?? '—'}</strong></div>
        <div><span>Ожидают обработки</span><strong>{health?.database?.pending ?? '—'}</strong></div>
        <div><span>Последнее сообщение</span><strong>{dateTime(health?.database?.last_received_at)}</strong></div>
      </div>
      {health?.bot_api?.last_error_message && <p className="telegram-workflow__message is-error"><AlertCircle size={14} /> {health.bot_api.last_error_message}</p>}
      {health?.recent_processing_errors?.length ? <div className="telegram-workflow__errors">
        <strong>Последние ошибки приёма</strong>
        {health.recent_processing_errors.map(item => <p key={item.update_id}>Update {item.update_id} · {item.last_error} · попыток: {item.processing_attempts}</p>)}
      </div> : null}
      <div className="telegram-workflow__diagnostics">
        <div>
          <strong>Диагностика выбранной группы</strong>
          <p>Проверка прав бота и доступности группы через Telegram Bot API.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void diagnoseSelected()} disabled={!selectedChatId || diagnosing}>
          <Activity size={14} /> {diagnosing ? 'Проверяем…' : 'Проверить группу'}
        </button>
      </div>
      {diagnostics.length > 0 && <div className="telegram-workflow__history">
        <strong>История диагностики</strong>
        {diagnostics.slice(0, 5).map(item => <p key={item.id}>
          <span className={item.status === 'connected' ? 'is-good' : 'is-warning'}>{item.status === 'connected' ? 'Подключена' : 'Требует внимания'}</span>
          {' · '}{dateTime(item.checked_at)}
        </p>)}
      </div>}
      <div className="telegram-workflow__history">
        <strong>Последние отправки</strong>
        {deliveries.length ? deliveries.map(item => <p key={item.id}>
          <span className={item.status === 'sent' ? 'is-good' : 'is-warning'}>{item.status === 'sent' ? 'Доставлено API' : 'Ошибка отправки'}</span>
          {' · '}{item.chat_id} · {dateTime(item.created_at)}
          {item.error_code ? ' · ' + item.error_code : ''}
        </p>) : <p>История отправок пока пуста.</p>}
      </div>
      <p className="telegram-workflow__footnote">«Доставлено API» означает, что Telegram принял запрос на отправку. Это не подтверждение прочтения сообщения участниками группы.</p>
    </div>
  </section>;
}
