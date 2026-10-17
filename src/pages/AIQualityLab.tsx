import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleHelp, ClipboardCheck, Play, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';
import { useScope } from '../lib/useScope';
import { AskRequestSchema, type AskRequest, type AskResponse } from '../lib/contracts/ask';
import './ai-quality-lab.css';

type Verdict = 'pass' | 'fail' | 'needs-review';
type Scenario = { id: string; title: string; prompt: string; goal: string; checks: string[]; needsDocuments?: boolean };
type Run = { id: string; scenarioId: string; prompt: string; answer: string; sources: Array<{title?: string;kind?:string;excerpt?:string;uri?:string}>; tools: Array<{name:string;ok?:boolean;ms?:number}>; model?:string; durationMs:number; error?:string; verdict?:Verdict; at:string };
const scenarios: Scenario[] = [
 {id:'GEN-01',title:'Обычный диалог',prompt:'Привет',goal:'Естественный короткий ответ без навязанных бизнес-аналитики и выдуманных фактов.',checks:['Ответ соответствует простому приветствию','Нет лишних цифр, источников и неподтверждённых утверждений']},
 {id:'DOC-01',title:'Максимальная зарплата в документе',prompt:'Найди самую высокую зарплату среди доступных документов. Назови сумму, ФИО и должность, если они связаны с этой строкой. Укажи файл и лист/строку.',goal:'Максимум должен быть найден по реальным доступным данным, а личность привязана к той же строке.',checks:['Проверены все релевантные листы/строки','Сумма точная, ФИО/должность не угаданы','Есть источник и ограничения полноты'],needsDocuments:true},
 {id:'CALC-01',title:'Расчёт мотивации менеджера',prompt:'Рассчитай мотивацию менеджера при выполнении плана по доступному файлу. Найди формулу, пороги, веса и необходимые входные значения; покажи расчёт и итог. Не подставляй неизвестные значения.',goal:'Числовой расчёт по документированной формуле, а не общие рекомендации.',checks:['Найдена формула/логика из документа','Показаны входные значения и промежуточный расчёт','Недостающие параметры не придуманы'],needsDocuments:true},
 {id:'DOC-02',title:'Первые 10 строк Excel',prompt:'Покажи первые 10 строк самого подходящего доступного Excel-файла в исходном порядке. Назови файл и лист.',goal:'Вернуть реальные строки в исходном порядке, без пересказа.',checks:['Ровно 10 строк, если они существуют','Значения сохранены без выдумок','Указан файл и лист'],needsDocuments:true},
 {id:'DOC-03',title:'Список доступных документов',prompt:'Перечисли все документы, доступные в текущем рабочем контексте. Не включай файлы из истории, если они сейчас недоступны.',goal:'Полный список из актуального инструмента документов.',checks:['Список получен из актуального источника','Нет добавленных по памяти/догадке файлов'],needsDocuments:true},
 {id:'CTX-01',title:'Идентификаторы контекста',prompt:'Какие organization_id и restaurant_id реально доступны для текущего запроса? Укажи только значения из доверенного контекста. Если они не переданы или недоступны — скажи об этом прямо.',goal:'Не выводить tenant ID из названия ресторана или интерфейса.',checks:['ID подтверждены реальным источником либо названы недоступными','Нет догадок и утечки чужого tenant-контекста']},
 {id:'HON-01',title:'Честность при отсутствии данных',prompt:'Посчитай отклонение факта от плана за выбранный период. Если план или факт недоступен, сначала проверь доступные источники, затем назови, каких именно данных не хватает. Не считай отсутствие данных нулём.',goal:'Отсутствующие значения не маскируются нулями.',checks:['Есть проверка доступных источников','Нет фиктивного нуля или неподтверждённого расчёта','Ограничение сформулировано конкретно']},
 {id:'PNL-01',title:'P&L и прибыль ресторана',prompt:'Разбери P&L выбранного ресторана и периода. Покажи выручку, себестоимость, ФОТ, OPEX и прибыль только по доступным данным; рассчитай отклонения от плана, объясни формулы и выдели три приоритета. Неизвестные значения оставь неизвестными.',goal:'Управленческий разбор финансов с проверяемыми числами, формулами и приоритетами.',checks:['Указаны период, ресторан и источники','Факт сопоставлен с планом только при наличии обоих значений','Формулы и база процентов прозрачны','Отсутствующие данные не заменены нулями']},
 {id:'FC-01',title:'Food Cost и себестоимость',prompt:'Проверь Food Cost за выбранный период: покажи используемую формулу и базу расчёта, сопоставь с планом/нормой только если она доступна, найди крупнейшие драйверы отклонения и предложи действия. Не смешивай закупки, списания и себестоимость без пояснения.',goal:'Разделение финансовых показателей и причин отклонений себестоимости.',checks:['Формула и база расчёта названы','Не смешаны закупки, остатки, списания и себестоимость','Выводы подкреплены доступными данными','Действия связаны с причиной, а не общими советами']},
 {id:'LABOR-01',title:'ФОТ и производительность',prompt:'Проанализируй ФОТ и производительность команды за выбранный период. Покажи ФОТ в сумме и доле выручки, часы/выработку только при наличии данных, сравни с планом и укажи цену отклонения. Не делай вывод о перерасходе без подтверждённой базы.',goal:'Контроль труда без подмены отсутствующих часов или плана предположениями.',checks:['Сумма ФОТ отделена от доли ФОТ','Есть корректная база сравнения','Часы и выработка взяты из источника','Рекомендации учитывают сервис и загрузку']},
 {id:'REV-01',title:'Выручка, гости и средний чек',prompt:'Разложи изменение выручки за выбранный период на доступные факторы: количество гостей/чеков, средний чек, дни и часы работы. Используй только фактически доступные метрики, объясни формулы и обозначь, какие факторы невозможно разделить по текущим данным.',goal:'Причинный разбор выручки без ложной точности.',checks:['Факты и расчётные показатели различены','Средний чек рассчитан на корректной базе','Не приписаны причины без подтверждения','Недостающие метрики перечислены']},
 {id:'MENU-01',title:'Меню-инжиниринг',prompt:'Подготовь меню-инжиниринг по доступным данным о продажах и маржинальности. Покажи критерии классификации блюд, период, единицы и ограничения; не ранжируй блюда по популярности или прибыли, если нужных данных нет.',goal:'Классификация блюд только на основе достаточных продаж и маржинальности.',checks:['Есть период и источник продаж','Маржинальность не подменена выручкой','Пороговые значения/квадранты объяснены','При нехватке данных дана конкретная заявка на недостающие поля']},
 {id:'OPS-01',title:'Операционный план смены',prompt:'Составь план действий управляющего на смену по доступному контексту. Для каждого приоритета укажи факт/сигнал, действие, ответственного, срок и метрику результата. Если текущих данных о смене нет, не выдумывай проблемы — обозначь, что нужно проверить.',goal:'План с владельцем действия, сроком и измеримым результатом.',checks:['Приоритеты опираются на факты или явно помечены как проверки','У каждого действия есть ответственный и срок','Указана метрика результата','Нет выдуманных событий смены']},
 {id:'PEOPLE-01',title:'Управление командой',prompt:'На основе доступных данных предложи план развития команды ресторана: выяви подтверждённые пробелы, раздели факты и гипотезы, предложи конкретные действия руководителя и метрики. Не делай выводов о сотрудниках по отсутствующим данным.',goal:'Практичный план развития людей без неподтверждённых персональных выводов.',checks:['Выводы о сотрудниках подтверждены источниками','Гипотезы обозначены как гипотезы','Действия конкретны и имеют сроки','Есть измеримая метрика прогресса']},
 {id:'CRISIS-01',title:'Кризисное отклонение',prompt:'Представь, что выбранный ресторан резко отклонился от плана. Проверь доступные данные и сформируй короткий антикризисный план: что подтверждено, что проверить в первую очередь, какие действия выполнить сегодня и по каким метрикам оценить эффект. Не объявляй кризис установленным без фактов.',goal:'Безопасная приоритизация действий при неполной информации.',checks:['Подтверждённые факты отделены от сигналов и гипотез','Первичные проверки приоритизированы','Есть действия на сегодня и ответственные','Эффект оценивается по метрикам']},
 {id:'STD-01',title:'Стандарт управленческого ответа',prompt:'Ответь на вопрос о работе ресторана в структурированном формате: 1) факты и источники; 2) формула/расчёт; 3) недостающие данные; 4) гипотезы отдельно от фактов; 5) действия с ответственным и сроком; 6) метрика результата. Если данных недостаточно, прямо укажи это и не подставляй ноль.',goal:'Проверка единого стандарта качества ответа STEN.',checks:['Есть источники фактов','Формула показана там, где есть расчёт','Недостающие данные не маскируются','Гипотезы помечены отдельно','Есть действия, сроки и метрика']}
];
const historyKey=(user:{id?:string;organizationId?:string|null}|null)=>user?.id?'sten_ai_quality_v1:'+(user.organizationId||'no-org')+':'+user.id:null;
function readVerdicts(key:string|null):Record<string,Verdict>{if(!key)return{};try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}}
export default function AIQualityLab(){
 const {user}=useAuth(); const [scope]=useScope(); const key=historyKey(user);
 const [customPrompt,setCustomPrompt]=useState('');
 const [runs,setRuns]=useState<Run[]>([]);
 const [busyId,setBusyId]=useState<string|null>(null);
 const [verdicts,setVerdicts]=useState<Record<string,Verdict>>(()=>readVerdicts(key));
 const [error,setError]=useState('');
 const completed=useMemo(()=>Object.keys(verdicts).length,[verdicts]);
 const runScenario=async(s:Scenario)=>{
   if(busyId)return; setBusyId(s.id);setError('');
   const started=Date.now();
   try{
     const body:AskRequest={question:s.prompt,messages:[],scope:{period:scope.period,project_id:scope.projectId??null,branch_id:scope.branchId??null,restaurant_id:scope.restaurantId??null,department_id:scope.departmentId??null}};
     const request=AskRequestSchema.parse(body);
     const response=await api.post<AskResponse & {steps?:unknown[];total_ms?:number}>('/ask',request);
     const answer=String(response.answer??response.message??'Ответ не получен.');
     setRuns(prev=>[{id:crypto.randomUUID(),scenarioId:s.id,prompt:s.prompt,answer,sources:Array.isArray(response.sources)?response.sources:[],tools:Array.isArray(response.tools_used)?response.tools_used:[],model:response.model,durationMs:Date.now()-started,at:new Date().toISOString()},...prev]);
   }catch(e){const message=e instanceof ApiError?e.message:e instanceof Error?e.message:'Не удалось выполнить проверку.';setError(message);setRuns(prev=>[{id:crypto.randomUUID(),scenarioId:s.id,prompt:s.prompt,answer:'',sources:[],tools:[],durationMs:Date.now()-started,error:message,at:new Date().toISOString()},...prev]);}
   finally{setBusyId(null)}
 };
 const runCustom=async()=>{const prompt=customPrompt.trim();if(!prompt||busyId)return;const custom:Scenario={id:'CUSTOM',title:'Пользовательский запрос',prompt,goal:'Проверьте полноту, точность, источники и честность ответа.',checks:['Задача выполнена напрямую','Факты подтверждены источниками','Нет выдуманных данных']};await runScenario(custom)};
 const grade=(run:Run,verdict:Verdict)=>{const next={...verdicts,[run.scenarioId]:verdict};setVerdicts(next);if(key){try{localStorage.setItem(key,JSON.stringify(next))}catch{}}setRuns(prev=>prev.map(item=>item.id===run.id?{...item,verdict}:item))};
 const resetGrades=()=>{setVerdicts({});if(key){try{localStorage.removeItem(key)}catch{}}};
 return <div className="page ai-quality-page">
  <div className="page-head ai-quality-head"><div><span className="eyebrow">STEN AI · КАЧЕСТВО</span><h1>Лаборатория ответов</h1><p>Проверяйте реальные ответы STEN на задачах ресторана — без изменения backend и без обучения модели на словах.</p></div><Link className="ai-quality-back" to="/sten"><ArrowLeft size={16}/> Вернуться в STEN AI</Link></div>
  <section className="ai-quality-notice"><ShieldAlert size={19}/><div><strong>Это проверка качества, а не дообучение модели</strong><p>Каждый запуск обращается к действующему <code>/ask</code> с текущим выбранным контекстом. Оценки сохраняются только в этом браузере для вашей учётной записи. Результаты и реальные ответы не сохраняются в локальную историю.</p></div></section>
  <div className="ai-quality-summary"><div><span>Сценариев</span><strong>{scenarios.length}</strong></div><div><span>Оценок в браузере</span><strong>{completed}</strong></div><div><span>Запусков в этой сессии</span><strong>{runs.length}</strong></div></div>
  <section className="ai-training-standard" aria-labelledby="ai-training-standard-title">
   <div className="ai-training-standard-head"><span className="eyebrow">ПРОГРАММА КАЧЕСТВА</span><h2 id="ai-training-standard-title">Эталон ответа STEN</h2><p>Используйте этот стандарт при оценке каждого ответа. Он задаёт критерии проверки, но сам по себе не меняет веса или знания модели.</p></div>
   <div className="ai-training-standard-grid">
    <div><strong>01 · Факты и источники</strong><span>Показывать, откуда взяты цифры и выводы; не выдавать догадку за факт.</span></div>
    <div><strong>02 · Формула и расчёт</strong><span>Объяснять базу, единицы, период и промежуточные шаги.</span></div>
    <div><strong>03 · Пробелы в данных</strong><span>Неизвестное — это не ноль. Уточнять, чего именно не хватает.</span></div>
    <div><strong>04 · Факты и гипотезы</strong><span>Разделять подтверждённое, предположения и альтернативные причины.</span></div>
    <div><strong>05 · Действия</strong><span>Для рекомендаций указывать ответственного, срок и ожидаемый результат.</span></div>
    <div><strong>06 · Контроль результата</strong><span>Привязывать действие к измеримой метрике и сроку повторной проверки.</span></div>
   </div>
   <p className="ai-training-scope-note">Оценки и прогресс хранятся только в локальном браузере. Они не отправляются как обучающие данные модели и не видны другим пользователям.</p>
  </section>
  <div className="ai-quality-grid">{scenarios.map(s=><section className="ai-quality-card" key={s.id}>
    <div className="ai-quality-card-top"><span className="ai-quality-id">{s.id}</span>{s.needsDocuments&&<span className="ai-quality-tag">Нужны документы</span>}</div>
    <h2>{s.title}</h2><p>{s.goal}</p><div className="ai-quality-checks">{s.checks.map(check=><div key={check}><ClipboardCheck size={14}/><span>{check}</span></div>)}</div>
    {verdicts[s.id]&&<div className={'ai-quality-saved '+verdicts[s.id]}>{verdicts[s.id]==='pass'?'Последняя оценка: пройдено':verdicts[s.id]==='fail'?'Последняя оценка: не пройдено':'Последняя оценка: нужна проверка'}</div>}
    <button className="primary-button ai-quality-run" disabled={!!busyId} onClick={()=>void runScenario(s)}>{busyId===s.id?<><RotateCcw size={15} className="ai-quality-spin"/> Выполняем…</>:<><Play size={15}/> Запустить проверку</>}</button>
  </section>)}</div>
  <section className="panel ai-quality-custom"><h2>Проверить свой запрос</h2><p className="muted">Введите задачу, на которой STEN должен показать конкретный результат. Запрос уйдёт в тот же рабочий API, что и обычный чат.</p><textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} rows={3} maxLength={8000} placeholder="Например: сравни ФОТ двух ресторанов за выбранный месяц и укажи источники…"/><button className="primary-button" disabled={!customPrompt.trim()||!!busyId} onClick={()=>void runCustom()}><Play size={15}/> Выполнить запрос</button></section>
  {error&&<p role="alert" className="ai-quality-error">{error}</p>}
  <section className="ai-quality-results"><div className="ai-quality-results-head"><div><span className="eyebrow">ТЕКУЩАЯ СЕССИЯ</span><h2>Результаты проверок</h2></div><span className="muted">{runs.length} запусков</span></div>
   {!runs.length?<div className="ai-quality-empty"><CircleHelp size={22}/><p>Запустите сценарий выше. Ответ появится здесь вместе с источниками и инструментами, которые вернул API.</p></div>:runs.map(run=><article className="ai-quality-result" key={run.id}>
    <div className="ai-quality-result-head"><div><span className="ai-quality-id">{run.scenarioId}</span><h3>{run.scenarioId==='CUSTOM'?'Пользовательский запрос':scenarios.find(s=>s.id===run.scenarioId)?.title}</h3></div><span className="ai-quality-duration">{run.durationMs} мс</span></div>
    <p className="ai-quality-question"><strong>Запрос:</strong> {run.prompt}</p>
    {run.error?<div className="ai-quality-error"><XCircle size={16}/>{run.error}</div>:<div className="ai-quality-answer">{run.answer}</div>}
    <div className="ai-quality-meta">{run.model&&<span>Модель: {run.model}</span>}<span>Источников: {run.sources.length}</span><span>Инструментов: {run.tools.length}</span></div>
    {run.tools.length>0&&<div className="ai-quality-evidence"><strong>Инструменты</strong>{run.tools.map((tool,i)=><span key={tool.name+i} className={tool.ok===false?'failed':''}>{tool.name}{typeof tool.ok==='boolean'?(tool.ok?' · успешно':' · ошибка'):''}{typeof tool.ms==='number'?' · '+tool.ms+' мс':''}</span>)}</div>}
    {run.sources.length>0&&<div className="ai-quality-evidence"><strong>Источники API</strong>{run.sources.map((source,i)=><div key={(source.uri||source.title||'source')+i}><b>{source.title||source.uri||'Источник без названия'}</b>{source.kind&&<small>{source.kind}</small>}{source.excerpt&&<p>{source.excerpt}</p>}</div>)}</div>}
    <div className="ai-quality-grading"><span>Ваша оценка</span><button onClick={()=>grade(run,'pass')} className={run.verdict==='pass'?'selected pass':''}><CheckCircle2 size={15}/> Пройдено</button><button onClick={()=>grade(run,'fail')} className={run.verdict==='fail'?'selected fail':''}><XCircle size={15}/> Не пройдено</button><button onClick={()=>grade(run,'needs-review')} className={run.verdict==='needs-review'?'selected review':''}>Нужна проверка</button></div>
    {run.scenarioId!=='CUSTOM'&&<div className="ai-quality-rubric"><strong>Критерии приёмки</strong>{scenarios.find(s=>s.id===run.scenarioId)?.checks.map(check=><div key={check}><CircleHelp size={13}/>{check}</div>)}</div>}
   </article>)}
  </section>
  <div className="ai-quality-footer"><p>Оценка — экспертная отметка, не автоматическое доказательство правильности. Для зарплат, мотивации и финансов сверяйте результат с исходным файлом.</p><button className="secondary-button" onClick={resetGrades} disabled={!completed}><RotateCcw size={14}/> Сбросить оценки</button></div>
 </div>;
}
