import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CalendarDays, FileText, Mic, MicOff, Paperclip, Send, Sparkles, Trash2, UploadCloud, Eye, X, Database, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { api, ApiError, createMemory } from '../lib/api';
import { useScope } from '../lib/useScope';
import { useSearchParams } from 'react-router-dom';
import { useAuth, type User } from '../contexts/AuthContext';
import { hasScopeId, scopeQuery } from '../lib/scope';
import { AskRequestSchema, type AskRequest, type AskResponse, type AskSource } from '../lib/contracts/ask';
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
type MeetingDraft={title:string;date:string;time:string;location:string;description:string;awaitingConfirmation:boolean};
const localDateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function parseMeetingDetails(text:string):Partial<MeetingDraft>{
 const value=text.trim();
 const result:Partial<MeetingDraft>={};
 const now=new Date();
 // JavaScript \b is ASCII-only and fails around Russian words; use Unicode-aware boundaries.
 if(/(?<![\p{L}\p{N}_])послезавтра(?![\p{L}\p{N}_])/iu.test(value)){const date=new Date(now);date.setDate(date.getDate()+2);result.date=localDateKey(date)}
 else if(/(?<![\p{L}\p{N}_])завтра(?![\p{L}\p{N}_])/iu.test(value)){const date=new Date(now);date.setDate(date.getDate()+1);result.date=localDateKey(date)}
 else if(/(?<![\p{L}\p{N}_])сегодня(?![\p{L}\p{N}_])/iu.test(value)){result.date=localDateKey(now)}
 else{
  const dateMatch=value.match(/(?<![\p{L}\p{N}_])(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?![\p{L}\p{N}_])/u);
  if(dateMatch){let year=dateMatch[3]?Number(dateMatch[3]):now.getFullYear();if(year<100)year+=2000;const day=Number(dateMatch[1]),month=Number(dateMatch[2]);const date=new Date(year,month-1,day);if(date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day){if(!dateMatch[3]&&date<new Date(now.getFullYear(),now.getMonth(),now.getDate()))date.setFullYear(year+1);result.date=localDateKey(date)}}
 }
 const timeMatch=value.match(/(?<![\p{L}\p{N}_])(?:в\s*)?(\d{1,2})[:.](\d{2})(?![\p{L}\p{N}_])/iu)||value.match(/(?<![\p{L}\p{N}_])в\s*(\d{1,2})\s*(?:час(?:а|ов)?|ч)(?![\p{L}\p{N}_])/iu);
 if(timeMatch){const hour=Number(timeMatch[1]),minute=Number(timeMatch[2]||0);if(hour>=0&&hour<=23&&minute>=0&&minute<=59)result.time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')}
 const placeMatch=value.match(/(?<![\p{L}\p{N}_])(?:в|на)\s+((?:Сириус(?:е)?|Сочи|Адлере|Москве|Петербурге|ресторане|офисе|кафе|отеле|зале)(?:\s+(?:у|на|имени|[\p{L}-]+)){0,3})(?![\p{L}\p{N}_])/iu);
 if(placeMatch)result.location=placeMatch[1].trim().replace(/\s+/g,' ');
 return result;
}
function missingMeetingField(draft:MeetingDraft){if(!draft.date)return'дату';if(!draft.time)return'время';if(!draft.location)return'место';return'';}
function meetingDateLabel(value:string){if(!value)return'не указана';const today=new Date();const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);if(value===localDateKey(today))return'сегодня';if(value===localDateKey(tomorrow))return'завтра';return new Date(value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}

const starters=[
 {eyebrow:'Финансы',title:'Разобрать P&L',description:'Выручка, расходы и причины отклонений',prompt:'Проанализируй текущий P&L и найди главные причины падения прибыли'},
 {eyebrow:'Контроль',title:'Найти отклонения',description:'Что вышло за план и требует внимания',prompt:'Что сильнее всего отклонилось от плана?'},
 {eyebrow:'Операции',title:'План на сегодня',description:'Приоритеты и конкретные действия управляющего',prompt:'Собери план действий для управляющего на сегодня'},
 {eyebrow:'Команда',title:'Проверить ФОТ',description:'Часы, производительность и цена отклонения',prompt:'Проверь ФОТ: часы, производительность и стоимость отклонения'},
];
const supported=new Set(['pdf','docx','xlsx','xlsm','xls','csv','txt','md','json','png','jpg','jpeg','webp','tiff','bmp']);
type PersonalMode='concise'|'analyst'|'coach';
const PERSONAL_MODES:{id:PersonalMode;label:string;instruction:string}[]=[
 {id:'concise',label:'Кратко',instruction:'Режим общения: КРАТКО И ПО ДЕЛУ. Сначала дай прямой вывод, затем до 3 главных аргументов и конкретные следующие действия. Не перегружай ответ.'},
 {id:'analyst',label:'Аналитик',instruction:'Режим общения: АНАЛИТИК. Проверяй доступные данные, отделяй факты от гипотез, показывай причины, финансовые последствия, риски и формулы, если они применимы. Не выдумывай отсутствующие данные; явно отмечай ограничения.'},
 {id:'coach',label:'Наставник',instruction:'Режим общения: НАСТАВНИК УПРАВЛЯЮЩЕГО. Объясняй логику решений, помогай развивать управленческое мышление и давай последовательный план действий с ответственными и критериями результата, если контекст это позволяет.'},
];
const PERSONAL_MODE_KEY='sten_ai_personal_mode';const MAX_DOC_BYTES=15*1024*1024;const LEGACY_KEY='sten_chat_v5';
const AI_VOICE_GENDER_KEY='sten_ai_voice_gender';
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
 const meetingNotesKey=`sten_meeting_notes_v1:${user?.organizationId||'no-org'}:${user?.id||'anonymous'}:${scope.restaurantId||scope.branchId||scope.projectId||scope.departmentId||'general'}`;
 const[messages,setMessages]=useState<Msg[]>(()=>readMessages(key));
 const hydrateRef=useRef<string|null>(key);
 const[prompt,setPrompt]=useState('');
 const[docs,setDocs]=useState<Doc[]>([]);
 const loadSeqRef=useRef(0);
 const[busy,setBusy]=useState(false);
  const[personalMode,setPersonalMode]=useState<PersonalMode>(()=>{try{const value=localStorage.getItem(PERSONAL_MODE_KEY);return PERSONAL_MODES.some(mode=>mode.id===value)?value as PersonalMode:'analyst'}catch{return 'analyst'}});
  useEffect(()=>{try{localStorage.setItem(PERSONAL_MODE_KEY,personalMode)}catch{}},[personalMode]);
 const[upload,setUpload]=useState(false);
 const[previewDoc,setPreviewDoc]=useState<DocPreview|null>(null);
 const[previewBusy,setPreviewBusy]=useState(false);
 const[docsCollapsed,setDocsCollapsed]=useState(()=>{try{const v=localStorage.getItem('sten_docs_collapsed');return v===null?true:v==='1'}catch{return true}});
 const[contextAt,setContextAt]=useState('');
 const[contextStatus,setContextStatus]=useState<'loading'|'both'|'partial'|'unavailable'>('loading');
 const[listening,setListening]=useState(false);
 const[voiceMode,setVoiceMode]=useState(false);
 const[meetingDraft,setMeetingDraft]=useState<MeetingDraft|null>(null);
 const[meetingSaving,setMeetingSaving]=useState(false);
 const[meetingNotesOpen,setMeetingNotesOpen]=useState(false);
 const[meetingTranscript,setMeetingTranscript]=useState('');
 const[meetingNoteInterim,setMeetingNoteInterim]=useState('');
 const[meetingNoteRecording,setMeetingNoteRecording]=useState(false);
 const[meetingNotesLoadedKey,setMeetingNotesLoadedKey]=useState<string|null>(null);
 const meetingTranscriptRef=useRef('');
 const meetingNoteRecog=useRef<any>(null);
 const meetingSaveRef=useRef(false);
 const[voiceState,setVoiceState]=useState<'idle'|'listening'|'thinking'|'speaking'>('idle');
 const[voiceAutoplay,setVoiceAutoplay]=useState(()=>{try{return localStorage.getItem('sten_ai_voice_autoplay')==='true'}catch{return false}});
 const[composerFocused,setComposerFocused]=useState(false);
 useEffect(()=>{if(initialQuery)setPrompt(initialQuery)},[initialQuery]);
 useEffect(()=>{voiceModeRef.current=voiceMode},[voiceMode]);
 useEffect(()=>{voiceAutoplayRef.current=voiceAutoplay},[voiceAutoplay]);
 useEffect(()=>{try{const saved=localStorage.getItem(meetingNotesKey)||'';meetingTranscriptRef.current=saved;setMeetingTranscript(saved);setMeetingNotesLoadedKey(meetingNotesKey)}catch{meetingTranscriptRef.current='';setMeetingTranscript('');setMeetingNotesLoadedKey(meetingNotesKey)}setMeetingNoteInterim('');setMeetingNoteRecording(false);try{meetingNoteRecog.current?.abort?.()}catch{}},[meetingNotesKey]);
 useEffect(()=>{if(meetingNotesLoadedKey!==meetingNotesKey)return;try{localStorage.setItem(meetingNotesKey,meetingTranscript)}catch{}},[meetingTranscript,meetingNotesKey,meetingNotesLoadedKey]);
 useEffect(()=>()=>{try{recog.current?.abort?.()}catch{}try{meetingNoteRecog.current?.abort?.()}catch{} if(typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel()},[]);

 useEffect(()=>{window.dispatchEvent(new CustomEvent('sten:ai-status',{detail:busy?'working':'ready'}))},[busy]);
 const[chatToast,setChatToast]=useState<string|null>(null);
 const[dragOver,setDragOver]=useState(false);
 const file=useRef<HTMLInputElement>(null);
 const promptRef=useRef<HTMLTextAreaElement>(null);
 const recog=useRef<any>(null);
 const speechRef=useRef<SpeechSynthesisUtterance|null>(null);
 const voiceModeRef=useRef(false);
 const voiceAutoplayRef=useRef(voiceAutoplay);
 const maleVoiceNoticeRef=useRef(false);
 const finalTranscriptRef=useRef('');
 const askRef=useRef<(value?:string)=>Promise<void>>(async()=>{});
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

 function appendLocalAssistant(answer:string){
   setMessages(current=>[...current,{id:crypto.randomUUID(),role:'assistant',text:answer,createdAt:new Date().toISOString()}]);
   if(voiceModeRef.current||voiceAutoplayRef.current)speakAnswer(answer);
 }
 async function confirmMeeting(draft:MeetingDraft){
   if(meetingSaveRef.current)return;
   const missing=missingMeetingField(draft);
   if(missing){const answer=`Чтобы записать встречу, уточни ${missing}.`;setMeetingDraft({...draft,awaitingConfirmation:false});appendLocalAssistant(answer);return}
   const start=new Date(`${draft.date}T${draft.time}:00`);
   if(Number.isNaN(start.getTime())){appendLocalAssistant('Не удалось проверить дату и время встречи. Уточни их, пожалуйста.');return}
   meetingSaveRef.current=true;setMeetingSaving(true);
   try{
     await api.post('/api/secretary/events',{title:draft.title.trim()||'Встреча',description:draft.description.trim(),location:draft.location.trim(),start_at:start.toISOString(),event_type:'meeting',status:'planned',reminder_minutes:30});
     setMeetingDraft(null);
     appendLocalAssistant(`Готово, встреча «${draft.title||'Встреча'}» записана в Секретарь: ${meetingDateLabel(draft.date)} в ${draft.time}, место — ${draft.location}. Напоминание установлено за 30 минут.`);
   }catch(e){
     appendLocalAssistant(e instanceof Error?`Не удалось сохранить встречу в Секретаре: ${e.message}`:'Не удалось сохранить встречу в Секретаре. Попробуй ещё раз.');
   }finally{meetingSaveRef.current=false;setMeetingSaving(false)}
 }
 async function handleMeetingUtterance(text:string){
   const value=text.trim();
   const affirmative=/^(да|давай|подтверждаю|подтвердить|согласен|верно|всё верно|создавай|записывай|ок|okay|окей)[!.\s]*$/i.test(value);
   const negative=/^(нет|не надо|отмена|отмени|не подтверждаю|не записывай|стоп)[!.\s]*$/i.test(value);
   if(meetingDraft){
     if(meetingDraft.awaitingConfirmation&&affirmative){await confirmMeeting(meetingDraft);return true}
     if(negative){setMeetingDraft(null);appendLocalAssistant('Хорошо, отменил. Встреча не записана.');return true}
     const parsed=parseMeetingDetails(value);
     const location=parsed.location||(meetingDraft.awaitingConfirmation?'':(!parsed.date&&!parsed.time?value.replace(/^(?:место(?: встречи)?\s*[:—-]?|локация\s*[:—-]?)\s*/i,'').trim():meetingDraft.location));
     const next:MeetingDraft={...meetingDraft,date:parsed.date||meetingDraft.date,time:parsed.time||meetingDraft.time,location:location||meetingDraft.location,awaitingConfirmation:false};
     setMeetingDraft(next);
     const missing=missingMeetingField(next);
     if(missing){appendLocalAssistant(`Уточни, пожалуйста, ${missing} встречи.`);return true}
     const ready={...next,awaitingConfirmation:true};setMeetingDraft(ready);
     appendLocalAssistant(`Проверь детали: ${ready.title} — ${meetingDateLabel(ready.date)} в ${ready.time}, место: ${ready.location}. Записать встречу в Секретарь?`);return true;
   }
   // Route calendar/meeting commands locally before /ask. Cover inflected Russian
   // commands ("внеси", "поставь", "записать") and explicit calendar wording too.
   const meetingAction=/(?<![\p{L}\p{N}_])(?:запиши(?:те|сь|тесь)?|запланируй(?:те)?|назначь(?:те)?|добавь(?:те)?|создай(?:те)?|организуй(?:те)?|внеси(?:те)?|поставь(?:те)?|заведи(?:те)?|записать|запланировать|назначить|добавить|создать|внести|поставить|записаться)(?![\p{L}\p{N}_])/iu.test(value);
   const meetingObject=/(?<![\p{L}\p{N}_])(?:встреч\p{L}*|секретар\p{L}*|календар\p{L}*|совещан\p{L}*|созвон\p{L}*|звон\p{L}*|событи\p{L}*|appointment|calendar|meeting)(?![\p{L}\p{N}_])/iu.test(value);
   const hasMeetingWord=/(?<![\p{L}\p{N}_])встреч\p{L}*(?![\p{L}\p{N}_])/iu.test(value);
   const hasMeetingDate=/(?<![\p{L}\p{N}_])(?:завтра|сегодня|послезавтра)(?![\p{L}\p{N}_])/iu.test(value)||/(?<![\p{L}\p{N}_])\d{1,2}[.:]\d{2}(?![\p{L}\p{N}_])/u.test(value);
   const intent=(meetingAction&&meetingObject)||(hasMeetingWord&&hasMeetingDate);
   if(!intent)return false;
   const parsed=parseMeetingDetails(value);
   const draft:MeetingDraft={title:'Встреча',date:parsed.date||'',time:parsed.time||'',location:parsed.location||'',description:'',awaitingConfirmation:false};
   setMeetingDraft(draft);
   const missing=missingMeetingField(draft);
   if(missing){appendLocalAssistant(`Хорошо, подготовлю встречу в Секретаре. Уточни, пожалуйста, ${missing} встречи.`);return true}
   const ready={...draft,awaitingConfirmation:true};setMeetingDraft(ready);
   appendLocalAssistant(`Проверь детали: ${ready.title} — ${meetingDateLabel(ready.date)} в ${ready.time}, место: ${ready.location}. Записать встречу в Секретарь?`);return true;
 }
 async function ask(value=prompt){
   const text=value.trim();
   if(!text||busy)return;
   setPrompt('');
   const nextMsgs=[...messages,{id:crypto.randomUUID(),role:'user' as const,text,createdAt:new Date().toISOString()}];
   shouldAutoScrollRef.current=true;
   setMessages(nextMsgs);
   setBusy(true);
   try{
     if(await handleMeetingUtterance(text))return;
     const body: AskRequest = {
       question: text,
       messages: [
          { role: 'system', content: [
            `Пользователя зовут ${user?.firstName?.trim()||'Александр'}. ${user?.position?.trim()?`Должность пользователя: ${user.position.trim()}.`:''} Обращайся по имени естественно и уместно, не повторяй имя в каждом сообщении. Отвечай на русском языке.`,
            PERSONAL_MODES.find(mode=>mode.id===personalMode)?.instruction||PERSONAL_MODES[1].instruction,
            voiceModeRef.current?'Голосовой диалог: отвечай естественно и кратко для устной речи. Для расчётов называй ключевые цифры, формулу и период; отделяй подтверждённые данные от предположений. Если данных нет, прямо скажи об этом. Не утверждай, что выполнил действие без подтверждения результата.': '',
            'Правила STEN: не выдумывай показатели; отсутствие данных не равно нулю; явно указывай источник, формулу и ограничения, когда это важно. Не утверждай, что выполнил действие, если оно не выполнено. Не предлагай прямые записи в БД, SQL-команды для изменения данных, обход API или ручное редактирование серверного хранилища. Для изменения данных направляй только через штатные функции интерфейса STEN и отдельно обозначай, что требуется подтверждение пользователя. Не утверждай, что изменение выполнено без подтверждённого результата. Не переключай ресторан, филиал, проект или организацию самостоятельно. Если рабочий контекст не выбран, отвечай на общие вопросы без него; для анализа данных конкретного ресторана используй только доступные пользователю данные и явно уточни, какой контекст нужен, если без него нельзя ответить. Никогда не подставляй данные другого ресторана и не придумывай отсутствующие показатели.'
          ].join(' ') },
          ...nextMsgs.slice(-49).map(m => ({ role: m.role, content: m.text })),
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
     const answer=String(p.answer??p.message??'Ответ не получен.');
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:answer,sources:Array.isArray(p.sources)?p.sources:[],steps:Array.isArray(p.steps)?p.steps:undefined,totalMs:typeof p.total_ms==='number'?p.total_ms:undefined,proposedMemory:Array.isArray(p.proposed_memory)?p.proposed_memory:p.proposed_memory===null?null:undefined,model:typeof p.model==='string'?p.model:undefined,toolsUsed:Array.isArray(p.tools_used)?p.tools_used.map(t=>({name:t.name,ok:t.ok,ms:t.ms})):p.tools_used===null?null:undefined,createdAt:new Date().toISOString()}]);
     if(voiceModeRef.current||voiceAutoplayRef.current)speakAnswer(answer);
   }catch(e){
     window.dispatchEvent(new CustomEvent('sten:ai-status',{detail:'error'}));
     const message = e instanceof ApiError && e.code === 'ORG_ACCESS_CLOSED'
       ? 'Доступ к организации закрыт. Проверьте статус подписки или обратитесь к администратору.'
       : e instanceof ApiError && e.code === 'RESTAURANT_FORBIDDEN'
         ? 'Нет доступа к выбранному ресторану. Выберите другой рабочий контур в Настройках или обратитесь к администратору.'
         : e instanceof ApiError && e.status === 403
           ? 'Нет доступа к данным выбранного рабочего контура. Выберите другой ресторан или обратитесь к администратору.'
       : e instanceof ApiError && e.status === 503
       ? 'AI временно недоступен.'
       : e instanceof ApiError && e.status === 502
         ? `AI вернул ошибку. Код: ${e.code}. ID запроса: ${e.requestId||'не указан'}.`
         : e instanceof Error ? e.message : 'Не удалось получить ответ.';
     setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text:message,createdAt:new Date().toISOString()}]);
     if(voiceModeRef.current){setVoiceState('idle');finalTranscriptRef.current='';window.setTimeout(()=>{if(voiceModeRef.current&&!speechRef.current)startRecognition()},350)}
   }finally{setBusy(false)}
 }

 useEffect(()=>{askRef.current=ask},[ask]);

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

 function stopSpeech(){
   if(typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel();
   speechRef.current=null;
   setVoiceState('idle');
 }
 function speakAnswer(answer:string){
   if(!answer.trim()){setVoiceState('idle');return}
   if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined'){setVoiceState('idle');showChatToast('Озвучивание не поддерживается этим браузером.');return}
   window.speechSynthesis.cancel();
   const plain=answer.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/<[^>]*>/g,' ').replace(/```[\s\S]*?```/g,' Код опущен. ').replace(/[*_#>|]/g,' ').replace(/\s+/g,' ').trim();
   if(!plain){setVoiceState('idle');return}
   const utterance=new SpeechSynthesisUtterance(plain.slice(0,12000));
   utterance.lang='ru-RU';utterance.rate=1;
   const russianVoices=window.speechSynthesis.getVoices().filter(voice=>/^ru([-_]|$)/i.test(voice.lang));
   const preferMale=(()=>{try{return localStorage.getItem(AI_VOICE_GENDER_KEY)!=='system'}catch{return true}})();
   const maleNamePattern=/(\bmale\b|\bman\b|муж|александр|алексей|юрий|иван|дмитри|максим|павел|андрей|сергей|николай|михаил|борис|арт[её]м|владимир|евгений|константин|yuri|alexander|alexey|dmitri|dmitry|maxim|pavel|andrey|sergey|nikolai|mikhail|boris|vladimir|eugene)/i;
   const russian=russianVoices.find(voice=>maleNamePattern.test(`${voice.name} ${voice.voiceURI}`));
   if(preferMale&&russian)utterance.voice=russian;
   else if(russianVoices[0]){
     utterance.voice=russianVoices[0];
     if(preferMale&&!maleVoiceNoticeRef.current){maleVoiceNoticeRef.current=true;showChatToast('Русский мужской голос не найден в голосах устройства. Используется доступный системный голос; можно проверить настройки озвучивания устройства.');}
   }
   utterance.onstart=()=>setVoiceState('speaking');
   utterance.onerror=(event)=>{speechRef.current=null;setVoiceState('idle');if(event.error!=='canceled'&&event.error!=='interrupted')showChatToast('Браузер не смог озвучить ответ. Попробуйте кнопку «Прослушать» ещё раз.');};
   utterance.onend=()=>{speechRef.current=null;if(voiceModeRef.current)startRecognition();else setVoiceState('idle')};
   speechRef.current=utterance;setVoiceState('speaking');window.speechSynthesis.speak(utterance);
 }
 function startRecognition(){
   if(!SR){setVoiceState('idle');setListening(false);return}
   try{recog.current?.abort?.()}catch{}
   const r=new SR();r.lang='ru-RU';r.interimResults=true;r.continuous=false;finalTranscriptRef.current='';
   const base=voiceModeRef.current?'':prompt.trim();
   r.onstart=()=>{setListening(true);setVoiceState('listening')};
   r.onresult=(e:any)=>{
     let interim='';let finalText='';
     for(let i=e.resultIndex;i<e.results.length;i++){const item=e.results[i];if(item.isFinal)finalText+=item[0].transcript;else interim+=item[0].transcript}
     const recognized=(finalText||interim).replace(/\\s+/g,' ').trim();if(recognized)setPrompt(((base?base+' ':'')+recognized).trim());
     if(finalText.trim()&&voiceModeRef.current&&!finalTranscriptRef.current){
       finalTranscriptRef.current=finalText.trim();const question=((base?base+' ':'')+finalText).replace(/\\s+/g,' ').trim();setPrompt('');setListening(false);setVoiceState('thinking');window.speechSynthesis?.cancel?.();void askRef.current(question);
     }
   };
   r.onerror=(event:any)=>{setListening(false);if(voiceModeRef.current){setVoiceState('idle');if(event?.error==='not-allowed'||event?.error==='service-not-allowed'){voiceModeRef.current=false;setVoiceMode(false);showChatToast('Разрешите доступ к микрофону в настройках браузера.');}else if(event?.error!=='aborted'&&event?.error!=='no-speech'){showChatToast('Не удалось распознать речь. Проверьте микрофон и попробуйте ещё раз.');if(event?.error==='audio-capture'){voiceModeRef.current=false;setVoiceMode(false);}}}};
   r.onend=()=>{setListening(false);if(!voiceModeRef.current){setVoiceState('idle');return;}if(finalTranscriptRef.current)return;window.setTimeout(()=>{if(voiceModeRef.current&&!speechRef.current)startRecognition()},350)};recog.current=r;
   try{r.start()}catch{setListening(false);setVoiceState('idle');showChatToast('Не удалось запустить микрофон. Проверьте разрешения браузера.')}
 }
 function stopMeetingNoteRecording(){
   try{meetingNoteRecog.current?.stop?.()}catch{try{meetingNoteRecog.current?.abort?.()}catch{}}
   meetingNoteRecog.current=null;setMeetingNoteRecording(false);setMeetingNoteInterim('');
 }
 function startMeetingNoteRecording(){
   if(!SR){showChatToast('Распознавание речи недоступно в этом браузере. Можно вставить или набрать текст заметки вручную.');return}
   if(voiceModeRef.current){voiceModeRef.current=false;setVoiceMode(false);try{recog.current?.abort?.()}catch{}stopSpeech();setListening(false)}
   try{meetingNoteRecog.current?.abort?.()}catch{}
   const recognition=new SR();recognition.lang='ru-RU';recognition.continuous=true;recognition.interimResults=true;
   recognition.onstart=()=>{setMeetingNoteRecording(true);setMeetingNoteInterim('')};
   recognition.onresult=(event:any)=>{
     let finalText='';let interim='';
     for(let i=event.resultIndex;i<event.results.length;i++){
       const result=event.results[i];const phrase=String(result?.[0]?.transcript||'').trim();
       if(result.isFinal&&phrase)finalText+=`${finalText?' ':''}${phrase}`;else if(phrase)interim+=`${interim?' ':''}${phrase}`;
     }
     if(finalText){const next=`${meetingTranscriptRef.current}${meetingTranscriptRef.current&&!/\\s$/.test(meetingTranscriptRef.current)?' ':''}${finalText}`.trim();meetingTranscriptRef.current=next;setMeetingTranscript(next)}
     setMeetingNoteInterim(interim);
   };
   recognition.onerror=(event:any)=>{setMeetingNoteRecording(false);setMeetingNoteInterim('');if(event?.error==='not-allowed'||event?.error==='service-not-allowed')showChatToast('Разрешите микрофон в браузере. Если распознавание недоступно, заметку можно ввести вручную.');else if(event?.error!=='aborted'&&event?.error!=='no-speech')showChatToast('Распознавание остановилось. Сохранённый текст заметки остался на экране.');};
   recognition.onend=()=>{setMeetingNoteRecording(false);setMeetingNoteInterim('')};
   meetingNoteRecog.current=recognition;
   try{recognition.start()}catch{setMeetingNoteRecording(false);showChatToast('Не удалось запустить микрофон. Проверьте разрешения браузера.')}
 }
 function toggleVoice(){
    if(voiceState==='speaking'){interruptVoice();return}
    if(voiceMode){voiceModeRef.current=false;setVoiceMode(false);try{recog.current?.abort?.()}catch{}stopSpeech();setListening(false);return}
    if(!('speechSynthesis' in window)&&!SR){showChatToast('В этом браузере недоступны голосовой ввод и голосовой ответ.');return}
    voiceModeRef.current=true;setVoiceMode(true);
    if(!SR){
      promptRef.current?.focus();
      showChatToast('Встроенное распознавание речи недоступно. Используйте микрофон диктовки на клавиатуре — ответ STEN будет озвучен.');
      return;
    }
    if(!('speechSynthesis' in window))showChatToast('Голосовой ответ не поддерживается этим браузером.');
    if(window.speechSynthesis?.speaking)stopSpeech();startRecognition();
  }
 function interruptVoice(){stopSpeech();try{recog.current?.abort?.()}catch{}if(voiceModeRef.current)startRecognition()}

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
       <button className="secondary-button" onClick={clearChat}><span>Новый диалог</span></button>
     </div>
   </header><div className={'ai-grid '+(docsCollapsed?'docs-collapsed':'')}>
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
         <span className="chat-head__documents"><FileText size={13}/>{readyCount} {readyCount===1?'документ готов':'документов готовы'}</span>
       </div>

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
               onSpeak={()=>voiceState==='speaking'?stopSpeech():speakAnswer(m.text)}
               onToSecretary={()=>void createSecretaryEvent(m.text)}
               onAnalyzePnl={analyzePnl}
               showSaveMemory={m.role==='assistant' && Array.isArray(m.proposedMemory) && m.proposedMemory.length>0}
               onSaveMemory={()=>void saveProposedMemory(m.id,m.proposedMemory??[])}
             >
               {m.role === 'assistant' && m.steps && (
                 <AskSteps steps={m.steps} totalMs={m.totalMs} />
               )}
             </MessageRow>
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
         {meetingDraft&&<section className="sten-meeting-confirm" aria-label="Подтверждение встречи">
           <div className="sten-meeting-confirm__heading"><CalendarDays size={18}/><div><strong>{meetingDraft.awaitingConfirmation?'Подтверди встречу':'Уточняем детали встречи'}</strong><span>Запись в Секретарь — только после подтверждения</span></div></div>
           <dl>
             <div><dt>Событие</dt><dd>{meetingDraft.title||'Встреча'}</dd></div>
             <div><dt>Дата</dt><dd>{meetingDateLabel(meetingDraft.date)}</dd></div>
             <div><dt>Время</dt><dd>{meetingDraft.time||'Нужно уточнить'}</dd></div>
             <div><dt>Место</dt><dd>{meetingDraft.location||'Нужно уточнить'}</dd></div>
           </dl>
           {meetingDraft.awaitingConfirmation?<div className="sten-meeting-confirm__actions"><button type="button" className="primary-button" disabled={meetingSaving} onClick={()=>void confirmMeeting(meetingDraft)}>{meetingSaving?'Сохраняем…':'Подтвердить и записать'}</button><button type="button" className="secondary-button" disabled={meetingSaving} onClick={()=>{setMeetingDraft(null);appendLocalAssistant('Встреча отменена и не была записана.')}}>Отменить</button></div>:<p className="sten-meeting-confirm__hint">Ответь голосом или текстом на уточнение STEN. После заполнения деталей можно будет подтвердить запись.</p>}
         </section>}
       </div>
       {chatToast&&<div className="chat-toast" role="status" aria-live="polite">{chatToast}</div>}

       <div className={'composer sten-composer '+(composerFocused?'is-focused ':'')+(dragOver?'is-dragover':'')}
         onDragOver={e=>{e.preventDefault();if(!upload)setDragOver(true)}}
         onDragLeave={()=>setDragOver(false)}
         onDrop={e=>{e.preventDefault();setDragOver(false);void uploadFiles(e.dataTransfer.files)}}>
         {dragOver&&<div className="composer-drop-hint"><UploadCloud size={16}/> Отпустите файл — STEN добавит его в документы</div>}
         <div className="sten-meeting-notes">
           <button className="sten-meeting-notes__toggle" type="button" aria-expanded={meetingNotesOpen} onClick={()=>setMeetingNotesOpen(value=>!value)}><CalendarDays size={15}/><span>Заметки встречи</span>{meetingTranscript.trim()&&<span className="sten-meeting-notes__count">{meetingTranscript.trim().split(/\\s+/).length} слов</span>}<span className="sten-meeting-notes__chevron">{meetingNotesOpen?'Скрыть':'Открыть'}</span></button>
           {meetingNotesOpen&&<div className="sten-meeting-notes__panel">
             <p>Надиктуйте или вставьте заметки встречи. Текст хранится в этом браузере отдельно для выбранного пользователя и рабочего контура. Распознавание зависит от браузера и может обрабатываться его речевым сервисом; STEN не записывает звук собеседников или системный звук.</p>
             <textarea value={meetingTranscript} onChange={event=>{meetingTranscriptRef.current=event.target.value;setMeetingTranscript(event.target.value)}} rows={4} placeholder="Например: договорились пересмотреть food cost, ответственный — управляющий, срок — пятница…" aria-label="Текст заметок встречи"/>
             {meetingNoteInterim&&<div className="sten-meeting-notes__interim" aria-live="polite">Распознано: {meetingNoteInterim}</div>}
             <div className="sten-meeting-notes__actions">
               <button type="button" className={meetingNoteRecording?'is-recording':''} onClick={()=>meetingNoteRecording?stopMeetingNoteRecording():startMeetingNoteRecording()}>{meetingNoteRecording?<MicOff size={15}/>:<Mic size={15}/>} {meetingNoteRecording?'Остановить диктовку':'Надиктовать'}</button>
               <button type="button" disabled={!meetingTranscript.trim()||busy} onClick={()=>{setMeetingNotesOpen(false);void ask(`Разбери заметки встречи. Составь краткий протокол: ключевые решения, задачи, ответственные, сроки и вопросы без ответа. Не придумывай отсутствующие сведения.\\n\\nЗаметки:\\n${meetingTranscript.trim()}`)}}><Sparkles size={15}/> Разобрать в STEN AI</button>
               <button type="button" className="is-secondary" disabled={!meetingTranscript.trim()} onClick={()=>{meetingTranscriptRef.current='';setMeetingTranscript('');setMeetingNoteInterim('');showChatToast('Текст заметки очищен')}}>Очистить</button>
             </div>
           </div>}
         </div>
         <div className="composer-box" onPointerDown={e=>{if((e.target as HTMLElement).closest("button,textarea"))return;promptRef.current?.focus()}} onClick={e=>{if((e.target as HTMLElement).closest("button"))return;promptRef.current?.focus()}}>
           <button className="icon-button composer-attach" onClick={()=>file.current?.click()} aria-label="Прикрепить документ" title="Добавить документ"><Paperclip size={18}/></button>
           <textarea ref={promptRef} value={prompt} onFocus={()=>{setComposerFocused(true);const textarea=promptRef.current;if(textarea)requestAnimationFrame(()=>textarea.scrollIntoView({behavior:'auto',block:'nearest'}))}} onBlur={()=>setComposerFocused(false)} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask()}}} placeholder={listening?'Говорите…':'Спросите про P&L, ФОТ или ситуацию в смене…'} rows={1} aria-label="Запрос к STEN AI"/>
           {voiceState==='speaking'&&<button className="icon-button voice-stop" onClick={interruptVoice} aria-label="Перебить ответ STEN" title="Перебить ответ"><MicOff size={18}/></button>}
           <button className={'icon-button'+(listening?' mic-active':'')+(voiceMode?' voice-mode-active':'')} onClick={toggleVoice} aria-label={voiceMode?'Завершить голосовой диалог':'Начать голосовой диалог'} title={SR?'Голосовой диалог (Chrome / Edge)':'Голосовой ввод не поддерживается этим браузером'}>
             {listening?<MicOff size={18}/>:<Mic size={18}/>}
           </button>
           <button className="send" disabled={!prompt.trim()||busy} onClick={()=>void ask()} aria-label="Отправить" title="Отправить (Enter)"><Send size={18}/></button>
         </div>
         {voiceMode&&<div className="sten-voice-status" role="status" aria-live="polite"><span className={'sten-voice-status__dot is-'+voiceState}/>{voiceState==='listening'?'Слушаю — говорите':voiceState==='thinking'||busy?'Обрабатываю вопрос…':voiceState==='speaking'?'Отвечаю голосом — нажмите микрофон, чтобы перебить':'Голосовой диалог включён'}</div>}
         <div className="composer-footer">
           <span>{upload?'Обрабатываем документ…':dragOver?'Добавление документа':voiceMode?'Голосовой режим · микрофон завершает диалог':'Enter — отправить · Shift+Enter — новая строка'}</span>
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