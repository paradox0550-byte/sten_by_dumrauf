import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FileText, Mic, MicOff, MoreHorizontal, Paperclip, Send, Sparkles, Trash2, UploadCloud, Eye, X, Database, PanelLeftClose, PanelLeftOpen, Volume2, VolumeX, Play, Square } from 'lucide-react';
import { api, ApiError, createMemory } from '../lib/api';
import { useScope } from '../lib/useScope';
import { useSearchParams } from 'react-router-dom';
import { useAuth, type User } from '../contexts/AuthContext';
import { hasScopeId, scopeQuery } from '../lib/scope';
import { AskRequestSchema, type AskRequest, type AskResponse, type AskSource } from '../lib/contracts/ask';
import { AppearanceDrawer } from '../features/chat-appearance/AppearanceDrawer';
import { AppearanceProvider, useAppearanceContext } from '../features/chat-appearance/AppearanceContext';
import { ChatBackground } from '../features/chat-appearance/ChatBackground';
import { MessageRow } from '../features/chat-appearance/MessageRow';
import { AskSteps, type AskStep } from '../features/ai-steps/AskSteps';
import ProposedMemoryChips from '../components/ProposedMemoryChips';
import type { ProposedMemory } from '../lib/contracts/memory';
import type { ChatMessage } from '../features/chat-appearance/types';
import '../features/chat-appearance/themes.css';
import '../features/chat-appearance/avatars.css';
import '../styles/chat.css';

type Msg={id:string;role:'user'|'assistant';text:string;sources?:AskSource[];createdAt?:string;proposedMemory?:ProposedMemory[]|null;steps?:AskStep[];totalMs?:number;model?:string;toolsUsed?:Array<{name:string;ok?:boolean;ms?:number}>|null};
type Doc={id:string;name:string;size:number;status:string;chars?:number};
type DocPreview={id:string;name:string;preview:string;chars:number;truncated:boolean;readOnly:true};
const starters=[
 {eyebrow:'Финансы',title:'Разобрать P&L',description:'Выручка, расходы и причины отклонений',prompt:'Проанализируй текущий P&L и найди главные причины падения прибыли'},
 {eyebrow:'Контроль',title:'Найти отклонения',description:'Что вышло за план и требует внимания',prompt:'Что сильнее всего отклонилось от плана?'},
 {eyebrow:'Операции',title:'План на сегодня',description:'Приоритеты и конкретные действия управляющего',prompt:'Собери план действий для управляющего на сегодня'},
 {eyebrow:'Команда',title:'Проверить ФОТ',description:'Часы, производительность и цена отклонения',prompt:'Проверь ФОТ: часы, производительность и стоимость отклонения'},
];
const supported=new Set(['pdf','docx','xlsx','xlsm','xls','csv','txt','md','json','png','jpg','jpeg','webp','tiff','bmp']);const MAX_DOC_BYTES=15*1024*1024;const LEGACY_KEY='sten_chat_v5';
const speechSupported=typeof window!=='undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance!=='undefined';
export function cleanTextForSpeech(text:string):string{
 return text
  .replace(/```[\\s\\S]*?```/g,' ')
  .replace(/!?\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'$1')
  .replace(/`([^`]*)`/g,'$1')
  .replace(/^\\s{0,3}#{1,6}\\s+/gm,'')
  .replace(/^\\s*>\\s?/gm,'')
  .replace(/^\\s*(?:[-*+]\\s+|\\d+[.)]\\s+)/gm,'')
  .replace(/^\\s*[-*_]{3,}\\s*$/gm,' ')
  .replace(/\\|/g,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/\\*\\*(.*?)\\*\\*/gs,'$1')
  .replace(/__(.*?)__/gs,'$1')
  .replace(/~~(.*?)~~/gs,'$1')
  .replace(/\\*(.*?)\\*/gs,'$1')
  .replace(/_(.*?)_/gs,'$1')
  .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'$1')
  .replace(/https?:\\/\\/\\S+/g,'ссылка')
  .replace(/[#*_`~]/g,'')
  .replace(/[ \\t]+/g,' ')
  .replace(/ *\\n */g,'\\n')
  .replace(/\\n{3,}/g,'\\n\\n')
  .trim();
}
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
 const navigate=useNavigate();
 const[searchParams,setSearchParams]=useSearchParams();
 const initialQuery=searchParams.get('q')?.trim()||'';
 const{settings}=useAppearanceContext();
 const key=chatKey(user);
 const[messages,setMessages]=useState<Msg[]>(()=>readMessages(key));
 const hydrateRef=useRef<string|null>(key);
 const[prompt,setPrompt]=useState('');
 const[docs,setDocs]=useState<Doc[]>([]);
 const loadSeqRef=useRef(0);
 const[busy,setBusy]=useState(false);
  const[isAudioMuted,setIsAudioMuted]=useState(()=>{try{return localStorage.getItem('sten_ai_mute')==='1'}catch{return false}});
  const[speakingMessageId,setSpeakingMessageId]=useState<string|null>(null);
  const speechUtteranceRef=useRef<SpeechSynthesisUtterance|null>(null);
 const[upload,setUpload]=useState(false);
 const[previewDoc,setPreviewDoc]=useState<DocPreview|null>(null);
 const[previewBusy,setPreviewBusy]=useState(false);
 const[docsCollapsed,setDocsCollapsed]=useState(()=>{try{const v=localStorage.getItem('sten_docs_collapsed');return v===null?true:v==='1'}catch{return true}});
 const[contextAt,setContextAt]=useState('');
 const[contextStatus,setContextStatus]=useState<'loading'|'both'|'partial'|'unavailable'>('loading');
 const[listening,setListening]=useState(false);
 const[appearanceOpen,setAppearanceOpen]=useState(false);
 const[composerFocused,setComposerFocused]=useState(false);
 useEffect(()=>{if(initialQuery)setPrompt(initialQuery)},[initialQuery]);
  useEffect(()=>{try{localStorage.setItem('sten_ai_mute',isAudioMuted?'1':'0')}catch{};if(isAudioMuted&&speechSupported){window.speechSynthesis.cancel();speechUtteranceRef.current=null;setSpeakingMessageId(null)}},[isAudioMuted]);
  useEffect(()=>()=>{if(speechSupported)window.speechSynthesis.cancel()},[]);
  const stopSpeech=()=>{if(speechSupported)window.speechSynthesis.cancel();speechUtteranceRef.current=null;setSpeakingMessageId(null)};
  const toggleSpeech=(messageId:string,text:string)=>{
    if(!speechSupported||isAudioMuted||busy)return;
    if(speakingMessageId===messageId){stopSpeech();return;}
    window.speechSynthesis.cancel();speechUtteranceRef.current=null;setSpeakingMessageId(null);
    const cleaned=cleanTextForSpeech(text);
    if(!cleaned)return;
    const utterance=new SpeechSynthesisUtterance(cleaned);
    utterance.lang='ru-RU';utterance.rate=1.0;
    utterance.onend=()=>{if(speechUtteranceRef.current===utterance){speechUtteranceRef.current=null;setSpeakingMessageId(null)}};
    utterance.onerror=()=>{if(speechUtteranceRef.current===utterance){speechUtteranceRef.current=null;setSpeakingMessageId(null)}};
    speechUtteranceRef.current=utterance;setSpeakingMessageId(messageId);window.speechSynthesis.speak(utterance);
  };

 useEffect(()=>{window.dispatchEvent(new CustomEvent('sten:ai-status',{detail:busy?'working':'ready'}))},[busy]);
 const[chatToast,setChatToast]=useState<string|null>(null);
 const[dragOver,setDragOver]=useState(false);
 const file=useRef<HTMLInputElement>(null);
 const promptRef=useRef<HTMLTextAreaElement>(null);
 const recog=useRef<any>(null);
 const chatBodyRef=useRef<HTMLDivElement>(null);
 const shouldAutoScrollRef=useRef(true);

 useEffect(()=>{
   if(!key)return;
   const loaded=readMessages(key);
   hydrateRef.current=key;
   setMessages(loaded);
 },[key]);
 useEffect(()=>{if(searchParams.get('new')!=='1')return;setMessages([]);setPrompt('');setSearchParams(params=>{const next=new URLSearchParams(params);next.delete('new');return next},{replace:true})},[searchParams,setSearchParams]);
 useEffect(()=>{
   if(!key||hydrateRef.current!==key)return;
   try{const persisted=messages.slice(-80).map(({proposedMemory,...message})=>message);localStorage.setItem(key,JSON.stringify(persisted));localStorage.removeItem(LEGACY_KEY)}catch{}
 },[messages,key]);
 useEffect(()=>{try{localStorage.setItem('sten_docs_collapsed',docsCollapsed?'1':'0')}catch{}},[docsCollapsed]);
 useEffect(()=>{if(!chatToast)return;const timer=window.setTimeout(()=>setChatToast(null),2200);return()=>window.clearTimeout(timer)},[chatToast]);
 useEffect(()=>{
   const el=document.querySelector<HTMLTextAreaElement>('.sten-ai-page .composer-box textarea');
   if(!el)return;
   el.style.height='22px';
   el.style.height=Math.min(el.scrollHeight,120)+'px';
 },[prompt]);

 useEffect(()=>{
   const element=chatBodyRef.current;
   if(!element||!shouldAutoScrollRef.current)return;
   const frame=window.requestAnimationFrame(()=>{
     const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
     element.scrollTo({top:element.scrollHeight,behavior:reduced?'auto':'smooth'});
   });
   return()=>window.cancelAnimationFrame(frame);
 },[messages,busy]);

 const load=async()=>{
   const seq=++loadSeqRef.current;
   const q=scopeQuery(scope);
   const [documents,pnlOk,fotOk]=await Promise.all([
     api.get<{documents:Doc[]}>('/ai/documents').then(r=>Array.isArray(r?.documents)?r.documents:null).catch(()=>null),
     api.get<any>('/api/pnl?'+q).then(value=>value!==null&&value!==undefined).catch(()=>false),
     api.get<any>('/fot-analytics?'+q).then(value=>value!==null&&value!==undefined).catch(()=>false),
   ]);
   if(seq!==loadSeqRef.current)return;
   if(documents!==null)setDocs(documents);
   const status=pnlOk&&fotOk?'both':pnlOk||fotOk?'partial':'unavailable';
   setContextStatus(status);
   setContextAt(status==='unavailable'?'':new Date().toISOString());
 };
 useEffect(()=>{void load()},[scope.period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);

 async function ask(value=prompt){
   const text=value.trim();
   if(!text||busy)return;
   setPrompt('');
   const nextMsgs=[...messages,{id:crypto.randomUUID(),role:'user' as const,text,createdAt:new Date().toISOString()}];
   shouldAutoScrollRef.current=true;
   setMessages(nextMsgs);
   setBusy(true);
   try{
     const body: AskRequest = {
       question: text,
       messages: [
          { role: 'system', content: 'Пользователя зовут Александр. Обращайся к нему по имени естественно и уместно, без повторения имени в каждом сообщении. Отвечай на русском языке, профессионально и по делу.' },
          ...nextMsgs.map(m => ({ role: m.role, content: m.text })),
        ],
       scope: {
         period: scope.period,
         project_id: scope.projectId ?? null,
         branch_id: scope.branchId ?? null,
         restaurant_id: scope.restaurantId ?? null,
         department_id: scope.departmentId ?? null,
       },
     };
     const r = await api.post<AskResponse & { steps?: AskStep[]; total_ms?: number }>('/ask', AskRequestSchema.parse(body));
     const p = r;
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:String(p.answer??p.message??'Ответ не получен.'),sources:Array.isArray(p.sources)?p.sources:[],steps:Array.isArray(p.steps)?p.steps:undefined,totalMs:typeof p.total_ms==='number'?p.total_ms:undefined,proposedMemory:Array.isArray(p.proposed_memory)?p.proposed_memory:p.proposed_memory===null?null:undefined,model:typeof p.model==='string'?p.model:undefined,toolsUsed:Array.isArray(p.tools_used)?p.tools_used.map(t=>({name:t.name,ok:t.ok,ms:t.ms})):p.tools_used===null?null:undefined,createdAt:new Date().toISOString()}]);
   }catch(e){
     window.dispatchEvent(new CustomEvent('sten:ai-status',{detail:'error'}));
     const message = e instanceof ApiError && e.status === 503
       ? 'AI временно недоступен.'
       : e instanceof ApiError && e.status === 502
         ? 'AI вернул ошибку. Повторите.'
         : e instanceof Error ? e.message : 'Не удалось получить ответ.';
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:message,createdAt:new Date().toISOString()}]);
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
 const createSecretaryEvent=async(answer:string)=>{
   try{
     const start=new Date(Date.now()+60*60*1000);
     await api.post('/api/secretary/events',{title:'Разобрать ответ STEN AI',description:answer,start_at:start.toISOString(),event_type:'task',status:'planned',reminder_minutes:30});
     showChatToast('Задача добавлена в Секретарь');
   }catch(e){showChatToast(e instanceof Error?e.message:'Не удалось создать задачу в Секретаре');}
 };
 const saveProposedMemory=async(messageId:string,items:ProposedMemory[])=>{
   if(!items.length)return;
   try{
     for(const item of items)await createMemory({scope:{project_id:scope.projectId??null,branch_id:scope.branchId??null,restaurant_id:scope.restaurantId??null,department_id:scope.departmentId??null},kind:item.kind,title:item.title,content:item.content,evidence:item.evidence??{}});
     setMessages(current=>current.map(item=>item.id===messageId?{...item,proposedMemory:undefined}:item));
     showChatToast('Предложения сохранены в память');
   }catch(e){showChatToast(e instanceof Error?e.message:'Не удалось сохранить память');}
 };
 const analyzePnl=()=>navigate('/pnl?'+scopeQuery(scope));

 const clearChat=()=>{
   setMessages([]);
   if(key){try{localStorage.removeItem(key)}catch{}}
   try{localStorage.removeItem(LEGACY_KEY)}catch{}
 };

 const pageClass='page sten-ai-page theme-'+settings.theme+' density-'+settings.density+(settings.showAvatars?'':' appearance-no-avatars')+(settings.showTime?'':' appearance-no-time')+(settings.showSources?'':' appearance-no-sources')+(settings.showActions?'':' appearance-no-actions');
 const formatTime=(value?:string)=>value?new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';

 return <div className={pageClass}>
   <header className="sten-ai-topbar">
     <div className="sten-ai-topbar__brand">
       <span className="sten-ai-topbar__mark" aria-hidden="true"><Sparkles size={19}/></span>
       <div className="sten-ai-topbar__title">
         <div className="sten-ai-topbar__name"><h1>STEN AI</h1><span className="sten-ai-topbar__status" aria-label={busy?'STEN AI формирует ответ':'STEN AI готов к анализу'} title={busy?'Формирует ответ':'Готов к анализу'}/></div>
         <p>Аналитический партнёр руководителя</p>
       </div>
     </div>
     <div className="sten-ai-topbar__actions">
       <span className={'sten-ai-context-pill '+(hasScopeId(scope)?'is-selected':'')}><Database size={14}/>{hasScopeId(scope)?'Контур выбран':'Контур не выбран'}</span>
        {speechSupported&&<button className="sten-ai-audio-toggle" onClick={()=>setIsAudioMuted(value=>!value)} aria-label={isAudioMuted?'Включить озвучку ответов':'Выключить озвучку ответов'} aria-pressed={isAudioMuted} title={isAudioMuted?'Озвучка выключена':'Озвучка включена'}>{isAudioMuted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>}
       <button className="chat-appearance-trigger" onClick={()=>setAppearanceOpen(v=>!v)} aria-label="Настроить оформление STEN AI" aria-expanded={appearanceOpen} title="Настроить оформление"><MoreHorizontal size={18}/></button>
       <button className="secondary-button" onClick={clearChat}><span>Новый диалог</span></button>
     </div>
   </header>

   {!hasScopeId(scope)&&<div className="import-result warn">Для точного AI-контекста выберите рабочий контур в Настройках.</div>}

   <div className={'ai-grid '+(docsCollapsed?'docs-collapsed':'')}>
     <aside className="docs-panel">
       <div className="panel-title">
         <FileText size={17}/> Документы <span>{docs.length}</span>
         <button className="docs-toggle" onClick={()=>setDocsCollapsed(v=>!v)} aria-label={docsCollapsed?'Показать документы':'Скрыть документы'}>
           {docsCollapsed?<PanelLeftOpen size={15}/>:<PanelLeftClose size={15}/>}
         </button>
       </div>
       <div className="dashboard-note" role="status" aria-live="polite"><Database size={14}/> {contextStatus==='loading'?'Проверяем доступность финансового контекста…':contextStatus==='both'?'Сервисы P&L и ФОТ ответили':contextStatus==='partial'?'Ответ получен только от части финансовых сервисов':'Финансовые данные не подтверждены — отсутствие данных не равно нулю.'}{contextAt?' · '+new Date(contextAt).toLocaleTimeString('ru-RU'):''}</div>
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
       <div className="chat-head" aria-label="Состав контекста диалога">
         <span className="chat-head__label">РАБОЧИЙ ДИАЛОГ</span>
         <span className="chat-head__context"><span className="chat-head__dot"/>{hasScopeId(scope)?'Используется выбранный контур':'Финансовый контур не выбран'}</span>
         <span className="chat-head__documents"><FileText size={13}/>{readyCount} {readyCount===1?'документ готов':'документов готовы'}</span>
       </div>
       {appearanceOpen&&<AppearanceDrawer onClose={()=>setAppearanceOpen(false)}/>}

       <div ref={chatBodyRef} className="chat-body" role="log" aria-live="polite" aria-label="История чата со STEN" onScroll={()=>{const element=chatBodyRef.current;if(element)shouldAutoScrollRef.current=element.scrollHeight-element.scrollTop-element.clientHeight<120;}}>
         <ChatBackground kind={settings.background}/>
         {!messages.length?<div className="welcome sten-ai-welcome">
           <div className="sten-ai-welcome__eyebrow"><span className="sten-ai-welcome__pulse"/><Sparkles size={13}/> ИНТЕЛЛЕКТУАЛЬНЫЙ РАБОЧИЙ КОНТУР</div>
           <div className="sten-ai-welcome__hero">
             <div className="welcome-mark"><Bot size={27}/></div>
             <h2>Давайте разберёмся,<br/><span>что происходит в бизнесе.</span></h2>
             <p>STEN AI помогает увидеть причины отклонений, расставить приоритеты и превратить данные в конкретные действия. Без выдуманных цифр — только доступный контекст и проверяемые выводы.</p>
           </div>
           <div className="sten-ai-welcome__context">
             <div className="sten-ai-welcome__context-item"><span className="sten-ai-welcome__context-icon"><Database size={16}/></span><span><b>Рабочий контур</b><small>{hasScopeId(scope)?'Выбранная область данных':'Не выбран — точность анализа ограничена'}</small></span></div>
             <div className="sten-ai-welcome__context-item"><span className="sten-ai-welcome__context-icon"><FileText size={16}/></span><span><b>Документы</b><small>{docs.length?`${readyCount} из ${docs.length} готовы к работе`:'Нет загруженных документов'}</small></span></div>
           </div>
           <div className="sten-ai-welcome__section-head"><div><span>БЫСТРЫЙ СТАРТ</span><h3>С чего начнём?</h3></div><p>Выберите задачу или напишите свой вопрос ниже.</p></div>
           <div className="starter-grid">{starters.map((item,index)=><button className="sten-ai-starter" key={item.title} onClick={()=>void ask(item.prompt)}>
             <span className="sten-ai-starter__top"><span>{item.eyebrow}</span><span className="sten-ai-starter__number">0{index+1}</span></span>
             <b>{item.title}</b><small>{item.description}</small><span className="sten-ai-starter__arrow" aria-hidden="true">↗</span>
           </button>)}</div>
         </div>:messages.map((m,i)=>{
           const message:ChatMessage={
             id:m.id,
             role:m.role,
             content:m.text,
             createdAt:m.createdAt??'',
             sources:m.sources,
             model:m.model,
           };
           const previousMessage=i>0?{
             id:messages[i-1].id,
             role:messages[i-1].role,
             content:messages[i-1].text,
             createdAt:messages[i-1].createdAt??'',
             sources:messages[i-1].sources,
           }:undefined;
           return <Fragment key={m.id}>
             <MessageRow
               key={m.id}
               message={message}
               previousMessage={previousMessage}
               user={user}
               onCopy={()=>void copyMessage(m.text)}
               onToSecretary={()=>void createSecretaryEvent(m.text)}
               onAnalyzePnl={analyzePnl}
               showSaveMemory={m.role==='assistant' && Array.isArray(m.proposedMemory) && m.proposedMemory.length>0}
               onSaveMemory={()=>void saveProposedMemory(m.id,m.proposedMemory??[])}
             >
               {m.role === 'assistant' && m.steps && (
                 <AskSteps steps={m.steps} totalMs={m.totalMs} />
               )}
             </MessageRow>
              {speechSupported&&m.role==='assistant'&&<div className="sten-ai-speech-action"><button type="button" className="sten-ai-speech-button" onClick={()=>toggleSpeech(m.id,m.text)} disabled={isAudioMuted||busy||!cleanTextForSpeech(m.text)} aria-label={speakingMessageId===m.id?'Остановить озвучку':'Прослушать ответ'} title={isAudioMuted?'Озвучка выключена':busy?'Дождитесь завершения ответа':speakingMessageId===m.id?'Остановить озвучку':'Прослушать ответ'}>{speakingMessageId===m.id?<Square size={15}/>:<Play size={15}/>}<span>{speakingMessageId===m.id?'Стоп':'Прослушать'}</span></button></div>
             {m.role === 'assistant' && m.toolsUsed && m.toolsUsed.length > 0 && (
               <div className="sten-ai-tools" aria-label="Использованные инструменты">
                 {m.model && <span>Модель · {m.model}</span>}
                 <span>Инструменты</span>
                 {m.toolsUsed.map((tool,index)=><span className="sten-ai-tools__item" key={tool.name+'-'+index}>
                   <b>{tool.name}</b>{tool.ok===false?' · ошибка':''}{typeof tool.ms==='number'?' · '+(tool.ms<1000?Math.round(tool.ms)+' ms':(tool.ms/1000).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' с'):''}
                 </span>)}
               </div>
             )}
             {m.role === 'assistant' && m.proposedMemory && m.proposedMemory.length > 0 && (
               <ProposedMemoryChips
                 items={m.proposedMemory}
                 messageId={m.id}
                 onResolve={(index) => setMessages(current => current.map(item => item.id === m.id
                   ? { ...item, proposedMemory: item.proposedMemory?.filter((_, itemIndex) => itemIndex !== index) }
                   : item
                 ))}
               />
             )}
           </Fragment>;
         })}
         {busy&&<div className="typing" role="status" aria-live="polite" aria-label="STEN AI обрабатывает запрос"><span className="typing__label">STEN AI думает...</span><i/><i/><i/></div>}
       </div>
       {chatToast&&<div className="chat-toast" role="status" aria-live="polite">{chatToast}</div>}

       <div className={'composer sten-composer '+(composerFocused?'is-focused ':'')+(dragOver?'is-dragover':'')}
         onDragOver={e=>{e.preventDefault();if(!upload)setDragOver(true)}}
         onDragLeave={()=>setDragOver(false)}
         onDrop={e=>{e.preventDefault();setDragOver(false);void uploadFiles(e.dataTransfer.files)}}>
         {dragOver&&<div className="composer-drop-hint"><UploadCloud size={16}/> Отпустите файл — STEN добавит его в документы</div>}
         <div className="composer-box" onPointerDown={e=>{if((e.target as HTMLElement).closest("button,textarea"))return;promptRef.current?.focus()}} onClick={e=>{if((e.target as HTMLElement).closest("button"))return;promptRef.current?.focus()}}>
           <button className="icon-button composer-attach" onClick={()=>file.current?.click()} aria-label="Прикрепить документ" title="Добавить документ"><Paperclip size={18}/></button>
           <textarea ref={promptRef} value={prompt} onFocus={()=>{setComposerFocused(true);const textarea=promptRef.current;if(textarea)requestAnimationFrame(()=>textarea.scrollIntoView({behavior:'auto',block:'nearest'}))}} onBlur={()=>setComposerFocused(false)} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={listening?'Говорите…':'Спросите про P&L, ФОТ или ситуацию в смене…'} rows={1} aria-label="Запрос к STEN AI"/>
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