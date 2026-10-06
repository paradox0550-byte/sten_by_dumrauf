import { useEffect, useRef, useState } from 'react';
import { Bot, FileText, Mic, MicOff, MoreHorizontal, Paperclip, Send, Sparkles, Trash2, UploadCloud, Eye, X, Database, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useScope } from '../lib/useScope';
import { useAuth, type User } from '../contexts/AuthContext';
import { hasScopeId, scopeQuery } from '../lib/scope';
import { AskRequestSchema, type AskRequest, type AskResponse, type AskSource } from '../lib/contracts/ask';
import { AppearanceDrawer } from '../features/chat-appearance/AppearanceDrawer';
import { AppearanceProvider, useAppearanceContext } from '../features/chat-appearance/AppearanceContext';
import { ChatBackground } from '../features/chat-appearance/ChatBackground';
import { MessageRow } from '../features/chat-appearance/MessageRow';
import type { ChatMessage } from '../features/chat-appearance/types';
import '../features/chat-appearance/themes.css';
import '../features/chat-appearance/avatars.css';

type Msg={id:string;role:'user'|'assistant';text:string;sources?:AskSource[];createdAt?:string};
type Doc={id:string;name:string;size:number;status:string;chars?:number};
type DocPreview={id:string;name:string;preview:string;chars:number;truncated:boolean;readOnly:true};
const starters=['Проанализируй текущий P&L и найди главные причины падения прибыли','Что сильнее всего отклонилось от плана?','Собери план действий для управляющего на сегодня','Проверь ФОТ: часы, производительность и стоимость отклонения'];
const supported=new Set(['pdf','docx','xlsx','xlsm','xls','csv','txt','md','json','png','jpg','jpeg','webp','tiff','bmp']);const MAX_DOC_BYTES=15*1024*1024;const LEGACY_KEY='sten_chat_v5';
function chatKey(user:{id?:string;organizationId?:string|null}|null){return user?.id?`sten_chat_v5:${user.organizationId||'no-org'}:${user.id}`:null;}
function readMessages(key:string|null):Msg[]{if(!key)return[];try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function to64(file:File){return new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>{const s=String(r.result);ok(s.includes(',')?s.split(',')[1]:s)};r.onerror=()=>no(r.error);r.readAsDataURL(file)})}

const SR:any = typeof window!=='undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

export default function AI(){
 const{user}=useAuth();
 return <AppearanceProvider user={user}><AIContent user={user}/></AppearanceProvider>;
}

function AIContent({user}:{user:User|null}){
 const[scope]=useScope();
 const{settings}=useAppearanceContext();
 const key=chatKey(user);
 const[messages,setMessages]=useState<Msg[]>(()=>readMessages(key));
 const hydrateRef=useRef<string|null>(key);
 const[prompt,setPrompt]=useState('');
 const[docs,setDocs]=useState<Doc[]>([]);
 const loadSeqRef=useRef(0);
 const[busy,setBusy]=useState(false);
 const[upload,setUpload]=useState(false);
 const[previewDoc,setPreviewDoc]=useState<DocPreview|null>(null);
 const[previewBusy,setPreviewBusy]=useState(false);
 const[docsCollapsed,setDocsCollapsed]=useState(()=>{try{const v=localStorage.getItem('sten_docs_collapsed');return v===null?true:v==='1'}catch{return true}});
 const[contextAt,setContextAt]=useState('');
 const[listening,setListening]=useState(false);
 const[appearanceOpen,setAppearanceOpen]=useState(false);
 const[composerFocused,setComposerFocused]=useState(false);
 const[chatToast,setChatToast]=useState<string|null>(null);
 const[dragOver,setDragOver]=useState(false);
 const file=useRef<HTMLInputElement>(null);
 const recog=useRef<any>(null);

 useEffect(()=>{
   if(!key)return;
   const loaded=readMessages(key);
   hydrateRef.current=key;
   setMessages(loaded);
 },[key]);
 useEffect(()=>{
   if(!key||hydrateRef.current!==key)return;
   try{localStorage.setItem(key,JSON.stringify(messages.slice(-80)));localStorage.removeItem(LEGACY_KEY)}catch{}
 },[messages,key]);
 useEffect(()=>{try{localStorage.setItem('sten_docs_collapsed',docsCollapsed?'1':'0')}catch{}},[docsCollapsed]);
 useEffect(()=>{if(!chatToast)return;const timer=window.setTimeout(()=>setChatToast(null),2200);return()=>window.clearTimeout(timer)},[chatToast]);
 useEffect(()=>{
   const el=document.querySelector<HTMLTextAreaElement>('.sten-ai-page .composer-box textarea');
   if(!el)return;
   el.style.height='auto';
   el.style.height=Math.min(el.scrollHeight,144)+'px';
 },[prompt]);

 const load=async()=>{
   const seq=++loadSeqRef.current;
   try{
     const r=await api.get<{documents:Doc[]}>('/ai/documents');
     if(seq!==loadSeqRef.current)return;
     setDocs(r.documents||[]);
     const q=scopeQuery(scope);
     await Promise.all([api.get<any>('/api/pnl?'+q).catch(()=>null),api.get<any>('/fot-analytics?'+q).catch(()=>null)]);
     if(seq!==loadSeqRef.current)return;
     setContextAt(new Date().toISOString());
   }catch{}
 };
 useEffect(()=>{void load()},[scope.period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);

 async function ask(value=prompt){
   const text=value.trim();
   if(!text||busy)return;
   setPrompt('');
   const nextMsgs=[...messages,{id:crypto.randomUUID(),role:'user' as const,text,createdAt:new Date().toISOString()}];
   setMessages(nextMsgs);
   setBusy(true);
   try{
     const body: AskRequest = {
       question: text,
       messages: nextMsgs.map(m => ({ role: m.role, content: m.text })),
       scope: {
         period: scope.period,
         project_id: scope.projectId ?? null,
         branch_id: scope.branchId ?? null,
         restaurant_id: scope.restaurantId ?? null,
         department_id: scope.departmentId ?? null,
       },
     };
     const r = await api.post<AskResponse>('/ask', AskRequestSchema.parse(body));
     const p = r;
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:String(p.answer??p.message??'Ответ не получен.'),sources:Array.isArray(p.sources)?p.sources:[],createdAt:new Date().toISOString()}]);
   }catch(e){
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:e instanceof Error?e.message:'Не удалось получить ответ.',createdAt:new Date().toISOString()}]);
   }finally{setBusy(false)}
 }

 async function makeTask(m:Msg){
   setBusy(true);
   try{
     await api.post('/api/secretary/events',{title:'STEN · действие по аналитике',description:m.text,start_at:new Date(Date.now()+60*60*1000).toISOString(),event_type:'task',status:'planned',reminder_minutes:30});
     setMessages(v=>[...v,{id:crypto.randomUUID(),role:'assistant',text:'Действие передано в Секретарь на контроль через 1 час.',createdAt:new Date().toISOString()}]);
   }catch(e){
     setMessages(v=>[...v,{id:crypto.randomUUID(),role:'assistant',text:e instanceof Error?e.message:'Не удалось передать действие в Секретарь.',createdAt:new Date().toISOString()}]);
   }finally{setBusy(false)}
 }

 async function uploadFiles(list:FileList|null){
   if(!list||upload)return;
   setUpload(true);
   try{
     for(const f of Array.from(list).slice(0,6)){
       const ext=f.name.split('.').pop()?.toLowerCase();
       if(!ext||!supported.has(ext)){setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'Формат «.'+(ext||'?')+'» не поддерживается.',createdAt:new Date().toISOString()}]);continue}
       if(f.size>MAX_DOC_BYTES)throw new Error(f.name+': файл больше 15 МБ');
       await api.post('/ai/documents/upload',{name:f.name,mimeType:f.type||'application/octet-stream',dataBase64:await to64(f)});
     }
     await load();
   }catch(e){
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:e instanceof Error?e.message:'Файл не обработан.',createdAt:new Date().toISOString()}]);
   }finally{setUpload(false)}
 }

 async function showPreview(d:Doc){
   setPreviewBusy(true);
   try{const r=await api.get<DocPreview>('/ai/documents/'+d.id+'/preview');setPreviewDoc((r as any)?.data??r)}
   catch(e){setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:e instanceof Error?e.message:'Не удалось открыть содержимое документа.',createdAt:new Date().toISOString()}])}
   finally{setPreviewBusy(false)}
 }

 async function removeDoc(d:Doc){
   try{await api.delete('/ai/documents/'+d.id);await load()}
   catch(e){setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:e instanceof Error?e.message:'Не удалось удалить документ.',createdAt:new Date().toISOString()}])}
 }

 function toggleVoice(){
   if(!SR){setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:'Голосовой ввод не поддерживается этим браузером. Откройте STEN в Chrome или Edge.',createdAt:new Date().toISOString()}]);return}
   if(listening){try{recog.current?.stop?.()}catch{}return}
   const r=new SR();
   r.lang='ru-RU';
   r.interimResults=true;
   r.continuous=false;
   const base=prompt.trim();
   r.onstart=()=>setListening(true);
   r.onresult=(e:any)=>{
     let text='';
     for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript;
     setPrompt(((base?base+' ':'')+text).replace(/\s+/g,' ').trim());
   };
   r.onerror=()=>setListening(false);
   r.onend=()=>setListening(false);
   recog.current=r;
   try{r.start()}catch{setListening(false)}
 }

 const readyCount=docs.filter(d=>d.status==='ready').length;
 const showChatToast=(message:string)=>setChatToast(message);
 const copyMessage=async(text:string)=>{
   try{
     await navigator.clipboard.writeText(text);
     showChatToast('Скопировано');
   }catch{
     showChatToast('Не удалось скопировать');
   }
 };
 const secretaryToast=()=>showChatToast('Скоро: сохранение в Секретаря');

 const clearChat=()=>{
   setMessages([]);
   if(key){try{localStorage.removeItem(key)}catch{}}
   try{localStorage.removeItem(LEGACY_KEY)}catch{}
 };

 const pageClass='page sten-ai-page theme-'+settings.theme+' density-'+settings.density+(settings.showAvatars?'':' appearance-no-avatars')+(settings.showTime?'':' appearance-no-time')+(settings.showSources?'':' appearance-no-sources')+(settings.showActions?'':' appearance-no-actions');
 const formatTime=(value?:string)=>value?new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';

 return <div className={pageClass}>
   <div className="page-head">
     <div>
       <span className="eyebrow"><span className="status-dot"/> AI · ДАННЫЕ → ДЕЙСТВИЯ</span>
       <h1>STEN</h1>
       <p>AI видит выбранный рабочий контур, текущий P&L и ФОТ. Ответ отделён от факта, а действие можно передать в Секретарь.</p>
     </div>
     <button className="secondary-button" onClick={clearChat}>Новый диалог</button>
   </div>

   {!hasScopeId(scope)&&<div className="import-result warn">Для точного AI-контекста выберите рабочий контур в Настройках.</div>}

   <div className={'ai-grid '+(docsCollapsed?'docs-collapsed':'')}>
     <aside className="docs-panel">
       <div className="panel-title">
         <FileText size={17}/> Документы <span>{docs.length}</span>
         <button className="docs-toggle" onClick={()=>setDocsCollapsed(v=>!v)} aria-label={docsCollapsed?'Показать документы':'Скрыть документы'}>
           {docsCollapsed?<PanelLeftOpen size={15}/>:<PanelLeftClose size={15}/>}
         </button>
       </div>
       <div className="dashboard-note"><Database size={14}/> {contextAt?'P&L/ФОТ обновлены '+new Date(contextAt).toLocaleTimeString('ru-RU'):'Текущий финансовый контекст не загружен.'}</div>
       <button className="upload-box" onClick={()=>file.current?.click()} disabled={upload}>
         <UploadCloud size={22}/><b>{upload?'Сохраняем…':'Загрузить документ'}</b>
         <small>PDF · Excel · DOCX · CSV · TXT · JSON · изображения · до 15 МБ</small>
       </button>
       <input ref={file} hidden type="file" multiple accept=".pdf,.docx,.xlsx,.xlsm,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.tiff,.bmp" onChange={e=>{void uploadFiles(e.target.files);e.currentTarget.value=''}}/>
       <div className="doc-list">
         {docs.length?docs.map(d=><div className="doc-row" key={d.id}>
           <FileText size={16}/>
           <div>
             <b title={d.name}>{d.name}</b>
             <small>{Math.round(d.size/1024)} КБ · {d.status==='ready'?'готов · '+(d.chars??0)+' символов':'статус: '+d.status}</small>
           </div>
           <button className="icon-button compact" onClick={()=>void showPreview(d)} disabled={previewBusy} aria-label={'Открыть документ '+d.name}><Eye size={14}/></button>
           <button className="icon-button compact" onClick={()=>void removeDoc(d)} aria-label={'Удалить документ '+d.name}><Trash2 size={14}/></button>
         </div>):<div className="empty">Документов пока нет.</div>}
       </div>
       <p className="dashboard-note">Документы не меняют P&L автоматически. Запись в финансовый контур требует подтверждения.</p>
     </aside>

     <section className="chat">
       <div className="chat-head">
         <div>
           <b><span className="avatar small"><Sparkles size={13}/></span> STEN</b>
           <small>{readyCount} документов готовы</small>
         </div>
         <div className="chat-head-actions">
           <span>факты · расчёты · действия</span>
           <button className="chat-appearance-trigger" onClick={()=>setAppearanceOpen(v=>!v)} aria-label="Оформление чата" aria-expanded={appearanceOpen} title="Оформление чата"><MoreHorizontal size={18}/></button>
         </div>
       </div>
       {appearanceOpen&&<AppearanceDrawer onClose={()=>setAppearanceOpen(false)}/>}

       <div className="chat-body" role="log" aria-live="polite" aria-label="История чата со STEN">
         <ChatBackground kind={settings.background}/>
         {!messages.length?<div className="welcome">
           <div className="welcome-mark"><Bot size={28}/></div>
           <h2>Что разбираем?</h2>
           <p>STEN получает текущие цифры выбранного контура и отвечает только в пределах подтверждённых данных.</p>
           <div className="starter-grid">{starters.map(s=><button key={s} onClick={()=>void ask(s)}>{s}</button>)}</div>
         </div>:messages.map((m,i)=>{
           const message:ChatMessage={
             id:m.id,
             role:m.role,
             content:m.text,
             createdAt:m.createdAt??'',
             sources:m.sources,
           };
           const previousMessage=i>0?{
             id:messages[i-1].id,
             role:messages[i-1].role,
             content:messages[i-1].text,
             createdAt:messages[i-1].createdAt??'',
             sources:messages[i-1].sources,
           }:undefined;
           return <MessageRow
             key={m.id}
             message={message}
             previousMessage={previousMessage}
             user={user}
             onCopy={()=>void copyMessage(m.text)}
             onToSecretary={secretaryToast}
             onDetails={()=>undefined}
           />;
         })}
         {busy&&<div className="typing" aria-label="STEN готовит ответ"><i/><i/><i/></div>}
       </div>
       {chatToast&&<div className="chat-toast" role="status" aria-live="polite">{chatToast}</div>}

       <div className={'composer '+(composerFocused?'is-focused ':'')+(dragOver?'is-dragover':'')}
         onDragOver={e=>{e.preventDefault();if(!upload)setDragOver(true)}}
         onDragLeave={()=>setDragOver(false)}
         onDrop={e=>{e.preventDefault();setDragOver(false);void uploadFiles(e.dataTransfer.files)}}>
         {dragOver&&<div className="composer-drop-hint"><UploadCloud size={16}/> Отпустите файл — STEN добавит его в документы</div>}
         <div className="composer-box">
           <button className="icon-button composer-attach" onClick={()=>file.current?.click()} aria-label="Прикрепить документ" title="Добавить документ"><Paperclip size={18}/></button>
           <textarea value={prompt} onFocus={()=>setComposerFocused(true)} onBlur={()=>setComposerFocused(false)} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={listening?'Говорите…':'Напишите запрос к текущим данным…'} rows={1} aria-label="Запрос к STEN AI"/>
           <button className={'icon-button'+(listening?' mic-active':'')} onClick={toggleVoice} aria-label={listening?'Остановить запись':'Голосовой ввод'} title={SR?'Голосовой ввод (Chrome / Edge)':'Голосовой ввод не поддерживается этим браузером'}>
             {listening?<MicOff size={18}/>:<Mic size={18}/>}
           </button>
           <button className="send" disabled={!prompt.trim()||busy} onClick={()=>void ask()} aria-label="Отправить" title="Отправить (Enter)"><Send size={18}/></button>
         </div>
         <div className="composer-footer">
           <span>{upload?'Обрабатываем документ…':dragOver?'Добавление документа':'Enter — отправить · Shift+Enter — новая строка'}</span>
           <span className="composer-context">{readyCount} док. готовы</span>
         </div>
       </div>
     </section>
   </div>

   {previewDoc&&<div className="modal-backdrop" onMouseDown={e=>e.currentTarget===e.target&&setPreviewDoc(null)}>
     <section className="modal-card document-preview" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
       <button className="modal-close" onClick={()=>setPreviewDoc(null)} aria-label="Закрыть"><X size={18}/></button>
       <small>ПРЕДПРОСМОТР · ТОЛЬКО ЧТЕНИЕ</small>
       <h2 id="document-preview-title">{previewDoc.name}</h2>
       <div className="dashboard-note"><FileText size={14}/> Извлечено {previewDoc.chars} символов.</div>
       <pre className="document-preview-text">{previewDoc.preview||'Содержимое не извлечено.'}</pre>
       {previewDoc.truncated&&<p className="muted">Показана первая часть содержимого.</p>}
     </section>
   </div>}
 </div>;
}