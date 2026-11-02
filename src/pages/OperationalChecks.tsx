import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import './OperationalChecks.css';

type Checkpoint = { key: 'availability' | 'sanitation' | 'cash_team' | 'hall'; title: string };
type Observation = {
  id: string; restaurant_id: string; checkpoint_key: string; checkpoint_title: string;
  status: 'ok' | 'problem' | 'needs_help'; note: string; reporter_name: string;
  reported_at: string; verification_status: string;
};
type Action = {
  id: string; observation_id: string; title: string; description: string;
  assignee_id: string; assignee_name: string; due_at: string; status: string;
  checkpoint_title: string; observation_note: string; completed_by?: string | null;
};
type Employee = { id: string; first_name: string | null; last_name: string | null; position: string | null };
type Payload = { checkpoints: Checkpoint[]; observations: Observation[]; actions: Action[]; employees: Employee[] };

const statusLabel: Record<string, string> = {
  open: 'Открыта', overdue: 'Просрочена', awaiting_verification: 'Ожидает перепроверки',
  verified: 'Проверена', cancelled: 'Отменена',
};
const formatTime = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const employeeName = (e: Employee) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.position || 'Сотрудник';

export default function OperationalChecks({ restaurantId }: { restaurantId: string | null | undefined }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkpointKey, setCheckpointKey] = useState<Checkpoint['key']>('availability');
  const [result, setResult] = useState<'ok' | 'problem' | 'needs_help'>('ok');
  const [note, setNote] = useState('');
  const [actionFor, setActionFor] = useState<Observation | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const load = useCallback(async () => {
    if (!restaurantId) { setData(null); return; }
    setLoading(true); setError('');
    try {
      const next = await api.get<Payload>('/api/operational-control?restaurant_id=' + encodeURIComponent(restaurantId));
      setData(next);
      setAssigneeId(current => current || next.employees?.[0]?.id || '');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить операционный контроль.');
    } finally { setLoading(false); }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  async function submitObservation() {
    if (!restaurantId) return;
    if (result !== 'ok' && !note.trim()) { setError('Опишите отклонение или запрос помощи.'); return; }
    setSaving('observation'); setError(''); setNotice('');
    try {
      const response = await api.post<{ observation: Observation; confirmed: boolean }>('/api/operational-control/observations', {
        restaurant_id: restaurantId, checkpoint_key: checkpointKey, status: result, note: note.trim(),
      });
      if (!response.confirmed || !response.observation?.id) throw new Error('Сервер не подтвердил сохранение проверки.');
      setNote('');
      setResult('ok');
      setNotice('Проверка сохранена. Отчёт сотрудника не считается независимой перепроверкой.');
      await load();
      if (response.observation.status !== 'ok') {
        setActionFor(response.observation);
        setTitle(response.observation.checkpoint_title);
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Не удалось сохранить проверку.'); }
    finally { setSaving(''); }
  }

  async function createAction() {
    if (!restaurantId || !actionFor || !title.trim() || !assigneeId || !dueAt) return;
    setSaving('action'); setError(''); setNotice('');
    try {
      const response = await api.post<{ action: Action; confirmed: boolean }>('/api/operational-control/actions', {
        restaurant_id: restaurantId, observation_id: actionFor.id, title: title.trim(),
        description: description.trim(), assignee_id: assigneeId, due_at: new Date(dueAt).toISOString(),
      });
      if (!response.confirmed || !response.action?.id) throw new Error('Сервер не подтвердил создание задачи.');
      setActionFor(null); setTitle(''); setDescription('');
      setNotice('Ответственный и срок сохранены. После выполнения потребуется независимая перепроверка.');
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Не удалось создать задачу.'); }
    finally { setSaving(''); }
  }

  async function transition(action: Action, type: 'complete' | 'verify' | 'reopen', reason?: string) {
    setSaving(action.id); setError(''); setNotice('');
    try {
      const response = await api.patch<{ action: Action; confirmed: boolean }>('/api/operational-control/actions/' + encodeURIComponent(action.id), { type, ...(reason ? { reason } : {}) });
      if (!response.confirmed) throw new Error('Сервер не подтвердил изменение задачи.');
      setNotice(type === 'complete' ? 'Выполнение отмечено. Задача ожидает независимой перепроверки.' : type === 'verify' ? 'Результат независимо подтверждён.' : 'Задача повторно открыта.');
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Не удалось изменить задачу.'); }
    finally { setSaving(''); }
  }

  if (!restaurantId) return <section className="panel operational-checks"><div className="panel-title"><ClipboardCheck size={17} /> Контроль готовности</div><p>Выберите ресторан в рабочем контуре, чтобы открыть контрольные точки.</p></section>;

  return <section className="panel operational-checks" aria-labelledby="operational-checks-title">
    <div className="operational-checks__header">
      <div><span className="eyebrow"><ClipboardCheck size={12} /> ОПЕРАЦИОННЫЙ КОНТРОЛЬ</span><h2 id="operational-checks-title">Готовность ресторана к пику</h2><p>Факт → ответственный → срок → независимая перепроверка.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Обновить</button>
    </div>
    {error && <div className="operational-checks__notice is-error" role="alert"><AlertTriangle size={15} />{error}</div>}
    {notice && <div className="operational-checks__notice" role="status"><CheckCircle2 size={15} />{notice}</div>}
    <div className="operational-checks__form">
      <label className="settings-field"><span>Контрольная точка</span><select value={checkpointKey} onChange={e => setCheckpointKey(e.target.value as Checkpoint['key'])}>{(data?.checkpoints ?? []).map(c => <option key={c.key} value={c.key}>{c.title}</option>)}</select></label>
      <label className="settings-field"><span>Результат проверки</span><select value={result} onChange={e => setResult(e.target.value as typeof result)}><option value="ok">В порядке</option><option value="problem">Есть отклонение</option><option value="needs_help">Нужна помощь</option></select></label>
      <label className="settings-field operational-checks__note"><span>{result === 'ok' ? 'Комментарий (необязательно)' : 'Что обнаружено? (обязательно)'}</span><textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder={result === 'ok' ? 'Что проверено' : 'Конкретное отклонение и что требуется'} /></label>
      <button className="primary-button" type="button" onClick={() => void submitObservation()} disabled={loading || saving !== '' || !data || (result !== 'ok' && !note.trim())}>{saving === 'observation' ? 'Сохраняем…' : 'Зафиксировать проверку'}</button>
    </div>
    {actionFor && <div className="operational-checks__action-form">
      <h3>Назначить исправление</h3><p>{actionFor.checkpoint_title}: {actionFor.note}</p>
      <label className="settings-field"><span>Что нужно исправить</span><input value={title} maxLength={180} onChange={e => setTitle(e.target.value)} /></label>
      <label className="settings-field"><span>Подробности</span><textarea value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} /></label>
      <label className="settings-field"><span>Ответственный</span><select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}><option value="">Выберите сотрудника</option>{(data?.employees ?? []).map(person => <option key={person.id} value={person.id}>{employeeName(person)}</option>)}</select></label>
      <label className="settings-field"><span>Срок</span><input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
      <div className="operational-checks__actions"><button className="secondary-button" type="button" onClick={() => setActionFor(null)} disabled={saving !== ''}>Позже</button><button className="primary-button" type="button" onClick={() => void createAction()} disabled={saving !== '' || !title.trim() || !assigneeId || !dueAt}>{saving === 'action' ? 'Назначаем…' : 'Назначить и сохранить'}</button></div>
    </div>}
    <div className="operational-checks__lists">
      <div><h3>Последние проверки</h3>{loading ? <p>Загрузка…</p> : !data?.observations.length ? <p>Проверок пока нет.</p> : <ul>{data.observations.slice(0, 8).map(o => <li key={o.id}><span className={'operational-checks__status is-' + o.status}>{o.status === 'ok' ? 'В порядке' : o.status === 'problem' ? 'Отклонение' : 'Нужна помощь'}</span><strong>{o.checkpoint_title}</strong><p>{o.note || 'Комментарий не добавлен'}</p><small>{o.reporter_name || 'Сотрудник'} · {formatTime(o.reported_at)} · {o.verification_status === 'verified' ? 'Проверено' : 'Отчёт не перепроверен'}</small>{o.status !== 'ok' && <button type="button" className="operational-checks__link" onClick={() => { setActionFor(o); setTitle(o.checkpoint_title); }}>Назначить исправление</button>}</li>)}</ul>}</div>
      <div><h3>Задачи и перепроверка</h3>{loading ? <p>Загрузка…</p> : !data?.actions.length ? <p>Открытых задач нет.</p> : <ul>{data.actions.slice(0, 12).map(a => <li key={a.id}><span className={'operational-checks__status is-' + a.status}>{statusLabel[a.status] || a.status}</span><strong>{a.title}</strong><p>{a.description || a.observation_note || a.checkpoint_title}</p><small>{a.assignee_name} · срок {formatTime(a.due_at)}</small><div className="operational-checks__actions">{['open','overdue'].includes(a.status) && <button type="button" className="operational-checks__link" disabled={saving !== ''} onClick={() => void transition(a,'complete')}>Отметить выполненной</button>}{a.status === 'awaiting_verification' && <button type="button" className="operational-checks__link" disabled={saving !== ''} onClick={() => void transition(a,'verify')}>Подтвердить результат</button>}{['awaiting_verification','verified'].includes(a.status) && <button type="button" className="operational-checks__link" disabled={saving !== ''} onClick={() => { const reason = window.prompt('Почему задачу нужно открыть повторно?'); if (reason?.trim()) void transition(a,'reopen',reason.trim()); }}>Открыть повторно</button>}</div></li>)}</ul>}</div>
    </div>
  </section>;
}
