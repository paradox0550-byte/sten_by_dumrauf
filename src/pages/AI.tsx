import { useEffect, useRef, useState } from 'react';
import { Bot, Copy, FileText, Paperclip, Send, Sparkles, Trash2, UploadCloud, Eye, X } from 'lucide-react';
import { api } from '../lib/api';

import { useScope } from '../lib/useScope';
import { hasScopeId } from '../lib/scope';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; sources?: { title: string }[] };
type Doc = { id: string; name: string; size: number; status: string; chars?: number; createdAt?: string; extraction?: unknown };
type DocPreview = { id:string; name:string; preview:string; chars:number; truncated:boolean; extraction?:unknown; readOnly:true };

const starters = [
  'Проанализируй текущий P&L и найди главные причины падения прибыли',
  'Что сильнее всего отклонилось от плана?',
  'Посмотри загруженные документы и объясни, где проблема',
  'Составь план действий для управляющего по выбранной области',
];
const supported = new Set(['pdf', 'docx', 'xlsx', 'xlsm', 'xls', 'csv', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp']);
const MAX_DOC_BYTES = 15 * 1024 * 1024;
const KEY = 'sten_chat_v5';

function to64(file: File) {
  return new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); ok(s.includes(',') ? s.split(',')[1] : s) };
    r.onerror = () => no(r.error);
    r.readAsDataURL(file);
  });
}

export default function AI() {
  const [scope, setScope] = useScope();
  const [messages, setMessages] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } });
  const [prompt, setPrompt] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(messages.slice(-80))) }, [messages]);
  const load = async () => {
    try { const r = await api.get<{ documents: Doc[] }>('/ai/documents'); setDocs(r.documents || []) } catch { /* список документов останется пустым; повторим при обновлении */ }
  };
  useEffect(() => { void load() }, []);

  async function ask(value = prompt) {
    const text = value.trim();
    if (!text || busy) return;
    setPrompt('');
    setMessages(m => [...m, { id: crypto.randomUUID(), role: 'user', text }]);
    setBusy(true);
    try {
      const r = await api.post<any>('/ask', {
        question: text, prompt: text,
        messages: messages.map(m => ({ role: m.role, content: m.text })),
        scope: { period: scope.period, project_id: scope.projectId ?? null, branch_id: scope.branchId ?? null, restaurant_id: scope.restaurantId ?? null, department_id: scope.departmentId ?? null },
      });
      const p = r?.data ?? r;
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: String(p.answer ?? p.message ?? 'Ответ не получен.'), sources: Array.isArray(p.sources) ? p.sources : [] }]);
    } catch (e) {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: e instanceof Error ? e.message : 'Не удалось получить ответ.' }]);
    } finally { setBusy(false) }
  }

  async function uploadFiles(list: FileList | null) {
    if (!list || upload) return;
    setUpload(true);
    try {
      for (const f of Array.from(list).slice(0, 6)) {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (!ext || !supported.has(ext)) { setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: `Формат «.${ext || '?'}» не поддерживается. Доступны PDF, Excel, Word, CSV, TXT, Markdown, JSON и изображения.` }]); continue }
        if (f.size > MAX_DOC_BYTES) throw new Error(`${f.name}: файл больше 15 МБ`);
        await api.post('/ai/documents/upload', { name: f.name, mimeType: f.type || 'application/octet-stream', dataBase64: await to64(f) });
      }
      await load();
    } catch (e) {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: e instanceof Error ? e.message : 'Файл не обработан.' }]);
    } finally { setUpload(false) }
  }

  async function showPreview(d: Doc) {
    setPreviewBusy(true);
    try {
      const r = await api.get<DocPreview>('/ai/documents/' + d.id + '/preview');
      setPreviewDoc((r as any)?.data ?? r);
    } catch (e) {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: e instanceof Error ? e.message : 'Не удалось открыть содержимое документа.' }]);
    } finally { setPreviewBusy(false) }
  }

  async function removeDoc(d: Doc) {
    try { await api.delete('/ai/documents/' + d.id); await load() }
    catch (e) { setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text: e instanceof Error ? e.message : 'Не удалось удалить документ.' }]) }
  }

  const readyCount = docs.filter(d => d.status === 'ready').length;

  return <div className="page">
    <div className="page-head">
      <div><span className="eyebrow"><span className="status-dot" /> ЛИЧНЫЙ АНАЛИТИЧЕСКИЙ КОНТУР</span><h1>STEN</h1><p>Документы, цифры и управленческие решения — в одном рабочем окне. STEN отвечает только по данным выбранной области и загруженным документам.</p></div>
      <button className="secondary-button" onClick={() => { setMessages([]); localStorage.removeItem(KEY) }}>Новый диалог</button>
    </div>
    
    {!hasScopeId(scope) && <div className="import-result warn">Область не выбрана: STEN анализирует все проекты сразу. Для точного ответа выберите проект, филиал или ресторан.</div>}
    <div className="ai-grid">
      <aside className="docs-panel">
        <div className="panel-title"><FileText size={17} /> Документы <span>{docs.length}</span></div>
        <button className="upload-box" onClick={() => file.current?.click()} disabled={upload}>
          <UploadCloud size={22} /><b>{upload ? 'Сохраняем…' : 'Загрузить документ'}</b>
          <small>PDF · Excel · DOCX · CSV · TXT · Markdown · JSON · изображения · до 15 МБ</small>
        </button>
        <input ref={file} hidden type="file" multiple accept=".pdf,.docx,.xlsx,.xlsm,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.tiff,.bmp" onChange={e => { void uploadFiles(e.target.files); e.currentTarget.value = '' }} />
        <div className="doc-list">
          {docs.length ? docs.map(d => <div className="doc-row" key={d.id}>
            <FileText size={16} />
            <div><b title={d.name}>{d.name}</b><small>{Math.round(d.size / 1024)} КБ · {d.status === 'ready' ? `готов · ${d.chars ?? 0} символов` : 'статус: ' + d.status}</small></div>
            <button className="icon-button compact" onClick={() => void showPreview(d)} disabled={previewBusy} aria-label={'Открыть документ ' + d.name}><Eye size={14} /></button>
            <button className="icon-button compact" onClick={() => void removeDoc(d)} aria-label={'Удалить документ ' + d.name}><Trash2 size={14} /></button>
          </div>) : <div className="empty">Документов пока нет. Загрузите Excel, PDF или Word — STEN будет использовать их в анализе.</div>}
        </div>
        <p className="dashboard-note">Документы не изменяют финансовые данные автоматически: запись в P&L возможна только после вашего подтверждения на экране импорта.</p>
      </aside>
      <section className="chat">
        <div className="chat-head">
          <div><b><span className="avatar small"><Sparkles size={13} /></span> STEN</b><small>{readyCount} документов готовы</small></div>
          <span>факты · расчёты · источники</span>
        </div>
        <div className="chat-body">
          {!messages.length ? <div className="welcome">
            <div className="welcome-mark"><Bot size={28} /></div>
            <h2>Что разбираем?</h2>
            <p>Задайте задачу обычным языком. При нехватке данных STEN скажет об этом прямо, а не придумает факт.</p>
            <div className="starter-grid">{starters.map(s => <button key={s} onClick={() => void ask(s)}>{s}</button>)}</div>
          </div> : messages.map(m => <article className={'message ' + m.role} key={m.id}>
            <div className="message-avatar">{m.role === 'assistant' ? <Sparkles size={14} /> : 'Вы'}</div>
            <div className="message-body"><div>{m.text}</div>
              {m.sources?.length ? <small className="sources">Источники: {m.sources.map(s => s.title).join(' · ')}</small> : null}
              {m.role === 'assistant' && <button className="copy" onClick={() => void navigator.clipboard?.writeText(m.text)}><Copy size={13} /> Копировать</button>}
            </div>
          </article>)}
          {busy && <div className="typing" aria-label="STEN готовит ответ"><i /><i /><i /></div>}
        </div>
        <div className="composer">
          <div className="composer-box">
            <button className="icon-button" onClick={() => file.current?.click()} aria-label="Прикрепить документ"><Paperclip size={18} /></button>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }} placeholder="Сообщите STEN, что нужно сделать…" rows={1} />
            <button className="send" disabled={!prompt.trim() || busy} onClick={() => void ask()} aria-label="Отправить"><Send size={18} /></button>
          </div>
          <small>Enter — отправить · Shift+Enter — новая строка</small>
        </div>
      </section>
    </div>
    {previewDoc && <div className="modal-backdrop" onMouseDown={e => e.currentTarget === e.target && setPreviewDoc(null)}>
      <section className="modal-card document-preview" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
        <button className="modal-close" onClick={() => setPreviewDoc(null)} aria-label="Закрыть"><X size={18} /></button>
        <small>ПРЕДПРОСМОТР · ТОЛЬКО ЧТЕНИЕ</small>
        <h2 id="document-preview-title">{previewDoc.name}</h2>
        <div className="dashboard-note"><FileText size={14} /> Извлечено {previewDoc.chars} символов. Этот просмотр не изменяет P&L и другие финансовые данные.</div>
        <pre className="document-preview-text">{previewDoc.preview || 'Содержимое не извлечено.'}</pre>
        {previewDoc.truncated && <p className="muted">Показана первая часть содержимого. Полный текст используется STEN в аналитическом контуре.</p>}
      </section>
    </div>}
  </div>;
}
