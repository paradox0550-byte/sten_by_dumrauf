import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { CalendarDays, ChevronLeft, ChevronRight, HeartPulse, Plus, StickyNote, Target, Trash2, TrendingUp } from 'lucide-react';
import './planner.css';

type Task = { id: string; title: string; event_type: string; start_at: string; status: string };
type Habit = { id: string; name: string; createdAt?: string };
type RecordDay = { done: string[]; mood?: number; motivation?: number };
type HabitState = { habits: Habit[]; records: Record<string, RecordDay> };
const GOALS_KEY = 'sten_plan_weekly_goals_v1';
const NOTES_KEY = 'sten_plan_weekly_notes_v1';
const HABITS_KEY = 'sten_habit_tracker_v1';

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback as object, ...JSON.parse(raw) } as T : fallback; }
  catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage unavailable. */ } }
function keyOf(d: Date) { return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function fromKey(key: string) { const p = key.split('-').map(Number); return new Date(p[0], p[1]-1, p[2], 12); }
function addDays(d: Date, n: number) { const next = new Date(d); next.setDate(next.getDate()+n); return next; }
function monday(d: Date) { const next = new Date(d); next.setHours(0,0,0,0); next.setDate(next.getDate()-((next.getDay()+6)%7)); return next; }
function dateLabel(d: Date) { return d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}).replace('.', ''); }
function done(status: string) { return ['done','completed','complete','confirmed'].includes(String(status).toLowerCase()); }
function Donut({value, label}:{value:number|null;label:string}) {
  const r=17, c=2*Math.PI*r, v=Math.max(0,Math.min(100,value??0));
  return <svg className="sten-plan-donut" viewBox="0 0 44 44" role="img" aria-label={label + (value===null?': нет данных':': '+Math.round(v)+'%')}><circle className="sten-plan-donut-track" cx="22" cy="22" r={r}/><circle className="sten-plan-donut-value" cx="22" cy="22" r={r} strokeDasharray={c+' '+c} strokeDashoffset={value===null?c:c*(1-v/100)}/><text x="22" y="25" textAnchor="middle">{value===null?'—':Math.round(v)+'%'}</text></svg>;
}

export function WeeklyPlanner() {
  const [offset,setOffset]=useState(0);
  const start=useMemo(()=>addDays(monday(new Date()),offset*7),[offset]);
  const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(start,i)),[start]);
  const wk=keyOf(start);
  const [selected,setSelected]=useState(keyOf(new Date()));
  const [events,setEvents]=useState<Task[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [title,setTitle]=useState('');
  const [taskDate,setTaskDate]=useState(keyOf(new Date()));
  const [goalsByWeek,setGoalsByWeek]=useState<Record<string,string[]>>(()=>read(GOALS_KEY,{}));
  const [notesByWeek,setNotesByWeek]=useState<Record<string,string>>(()=>read(NOTES_KEY,{}));
  const goals=goalsByWeek[wk]||['','',''];
  const tasks=events.filter(e=>e.event_type==='task'||e.event_type==='todo');
  const finished=tasks.filter(e=>done(e.status)).length;
  const progress=tasks.length?finished/tasks.length*100:0;
  const selectedTasks=tasks.filter(e=>keyOf(new Date(e.start_at))===selected);
  const openTasks=tasks.filter(e=>!done(e.status));
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const from=new Date(start);from.setHours(0,0,0,0);
      const to=addDays(start,7);to.setHours(0,0,0,0);
      const result=await api.get<{events?:Task[]}>('/api/secretary/events?from='+encodeURIComponent(from.toISOString())+'&to='+encodeURIComponent(to.toISOString()));
      setEvents(Array.isArray(result?.events)?result.events:[]);
    } catch(e) { setEvents([]);setError(e instanceof Error?e.message:'Не удалось загрузить задачи.'); }
    finally { setLoading(false); }
  }, [start]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{save(GOALS_KEY,goalsByWeek);},[goalsByWeek]);
  useEffect(()=>{save(NOTES_KEY,notesByWeek);},[notesByWeek]);
  useEffect(()=>{if(!days.some(d=>keyOf(d)===selected)){setSelected(keyOf(days[0]));setTaskDate(keyOf(days[0]));}},[days,selected]);
  async function addTask(e:FormEvent) {
    e.preventDefault();if(!title.trim()||saving)return;
    setSaving(true);setError('');
    try {
      await api.post('/api/secretary/events',{title:title.trim().normalize('NFC'),description:'',start_at:fromKey(taskDate).toISOString(),event_type:'task',status:'planned',reminder_minutes:0});
      setTitle('');await load();
    } catch(err) {setError(err instanceof Error?err.message:'Не удалось сохранить задачу.');}
    finally {setSaving(false);}
  }
  async function toggle(task:Task) {
    if(saving)return;setSaving(true);setError('');
    try {await api.patch('/api/secretary/events/'+encodeURIComponent(task.id),{status:done(task.status)?'planned':'completed'});await load();}
    catch(err){setError(err instanceof Error?err.message:'Не удалось обновить задачу.');}
    finally{setSaving(false);}
  }
  async function remove(task:Task) {
    if(saving||!window.confirm('Удалить задачу «'+task.title+'»?'))return;
    setSaving(true);setError('');
    try{await api.delete('/api/secretary/events/'+encodeURIComponent(task.id));await load();}
    catch(err){setError(err instanceof Error?err.message:'Не удалось удалить задачу.');}
    finally{setSaving(false);}
  }
  function setGoal(i:number,value:string) {
    setGoalsByWeek(current=>{const next=[...(current[wk]||['','',''])];while(next.length<3)next.push('');next[i]=value;return {...current,[wk]:next.slice(0,3)};});
  }
  return <div className="sten-plan-workspace">
    <div className="sten-plan-week-heading"><div><span className="sten-plan-kicker"><CalendarDays size={14}/> НЕДЕЛЬНЫЙ ПЛАН</span><h2>{dateLabel(start)} — {dateLabel(addDays(start,6))}</h2><p>Задачи, приоритеты и контроль исполнения.</p></div><div className="sten-plan-week-controls"><button className="secondary-button" aria-label="Предыдущая неделя" onClick={()=>setOffset(v=>v-1)}><ChevronLeft size={16}/></button><button className="secondary-button" onClick={()=>{setOffset(0);setSelected(keyOf(new Date()));setTaskDate(keyOf(new Date()));}}>Сегодня</button><button className="secondary-button" aria-label="Следующая неделя" onClick={()=>setOffset(v=>v+1)}><ChevronRight size={16}/></button></div></div>
    {error&&<div className="sten-plan-error" role="alert">{error}</div>}
    <div className="sten-plan-summary"><div className="sten-plan-summary-main"><Donut value={tasks.length?progress:null} label="Прогресс недели"/><div><span>Прогресс недели</span><strong>{Math.round(progress)}%</strong><small>{tasks.length?'По сохранённым задачам':'Добавьте первую задачу'}</small></div></div><div className="sten-plan-stat"><span>Всего</span><strong>{tasks.length}</strong></div><div className="sten-plan-stat"><span>Готово</span><strong>{finished}</strong></div><div className="sten-plan-stat"><span>Осталось</span><strong>{tasks.length-finished}</strong></div></div>
    <div className="sten-plan-days" aria-label="Дни недели">{days.map(day=>{const k=keyOf(day),list=tasks.filter(t=>keyOf(new Date(t.start_at))===k),count=list.filter(t=>done(t.status)).length;return <button type="button" key={k} className={'sten-plan-day '+(selected===k?'is-selected':'')} onClick={()=>{setSelected(k);setTaskDate(k);}} aria-pressed={selected===k}><span className="sten-plan-day-name">{day.toLocaleDateString('ru-RU',{weekday:'short'}).replace('.','')}</span><strong>{day.getDate()}</strong><Donut value={list.length?count/list.length*100:null} label={k+' прогресс'}/><small>{count}/{list.length}</small></button>;})}</div>
    <div className="sten-plan-columns"><section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>Задачи на день</h3><p>{fromKey(selected).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}</p></div><span className="sten-plan-count">{selectedTasks.length}</span></div>
      <form className="sten-plan-add" onSubmit={addTask}><input aria-label="Новая задача" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Добавить задачу…" maxLength={300}/><input aria-label="Дата задачи" type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)}/><button className="primary-button" type="submit" disabled={!title.trim()||saving}><Plus size={16}/> Добавить</button></form>
      {loading?<div className="sten-plan-empty">Загружаем сохранённые задачи…</div>:selectedTasks.length?<ul className="sten-plan-task-list">{selectedTasks.map(task=><li key={task.id} className={done(task.status)?'is-done':''}><label><input type="checkbox" checked={done(task.status)} disabled={saving} onChange={()=>void toggle(task)}/><span>{task.title}</span></label><button className="sten-plan-icon-button" type="button" aria-label={'Удалить задачу '+task.title} disabled={saving} onClick={()=>void remove(task)}><Trash2 size={15}/></button></li>)}</ul>:<div className="sten-plan-empty">На этот день задач нет. Добавьте первую.</div>}
    </section><section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3><Target size={17}/> Главные цели недели</h3><p>Три приоритета руководителя</p></div></div>{[0,1,2].map(i=><label className="sten-plan-goal" key={i}><span>{i+1}</span><input value={goals[i]||''} maxLength={180} onChange={e=>setGoal(i,e.target.value)} placeholder={'Цель '+(i+1)}/></label>)}<div className="sten-plan-local-note">Цели сохраняются в этом браузере, без синхронизации с другими устройствами.</div></section></div>
    <section className="panel sten-plan-card sten-plan-analytics"><div className="sten-plan-card-heading"><div><h3><TrendingUp size={17}/> Аналитика недели</h3><p>По задачам, загруженным из рабочего API</p></div></div><div className="sten-plan-analytics-grid"><div className="sten-plan-analytics-donut"><Donut value={tasks.length?progress:null} label="Выполнение задач"/><div><strong>{finished} из {tasks.length}</strong><span>выполнено</span></div></div><div className="sten-plan-best-day"><span>Лучший день</span><strong>{tasks.length?(()=>{const ranked=days.map(d=>{const list=tasks.filter(t=>keyOf(new Date(t.start_at))===keyOf(d));return {day:d,rate:list.length?list.filter(t=>done(t.status)).length/list.length:-1};}).sort((a,b)=>b.rate-a.rate)[0];return ranked&&ranked.rate>=0?ranked.day.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'short'}):'—';})():'—'}</strong></div><div className="sten-plan-open-tasks"><span>Список невыполненных</span>{openTasks.length?<ul>{openTasks.map(t=><li key={t.id}><span>{t.title}</span><small>{new Date(t.start_at).toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})}</small></li>)}</ul>:<p>{tasks.length?'Все задачи выполнены.':'Нет данных для расчёта.'}</p>}</div></div></section>
    <section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3><StickyNote size={17}/> Заметки недели</h3><p>Мысли, решения и вопросы к плану</p></div></div><textarea className="sten-plan-notes" rows={4} value={notesByWeek[wk]||''} onChange={e=>setNotesByWeek(current=>({...current,[wk]:e.target.value}))} placeholder="Добавьте заметку…"/><div className="sten-plan-local-note">Заметки сохраняются в этом браузере, без синхронизации с другими устройствами.</div></section>
  </div>;
}

export function HabitTracker() {
  const [state,setState]=useState<HabitState>(()=>read(HABITS_KEY,{habits:[],records:{}}));
  const [monthOffset,setMonthOffset]=useState(0);
  const [habitName,setHabitName]=useState('');
  const [stateDate,setStateDate]=useState(keyOf(new Date()));
  const [error,setError]=useState('');
  const month=useMemo(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth()+monthOffset,1);},[monthOffset]);
  const dayCount=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const today=keyOf(new Date());
  const keys=Array.from({length:dayCount},(_,i)=>keyOf(new Date(month.getFullYear(),month.getMonth(),i+1,12)));
  const monthName=month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  useEffect(()=>{save(HABITS_KEY,state);},[state]);
  useEffect(()=>{const d=new Date();setStateDate(monthOffset===0?keyOf(d):keyOf(new Date(month.getFullYear(),month.getMonth(),1,12)));},[monthOffset]);
  const slots=state.habits.reduce((sum,h)=>sum+keys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)).length,0);
  const total=state.habits.reduce((sum,h)=>sum+keys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)&&(state.records[k]?.done||[]).includes(h.id)).length,0);
  const overall=slots?total/slots*100:0;
  const todayRecord=state.records[today]||{done:[]};
  const selectedRecord=state.records[stateDate]||{done:[]};
  const weekKeys=Array.from({length:7},(_,i)=>keyOf(addDays(monday(new Date()),i)));
  const todayDone=state.habits.filter(h=>todayRecord.done.includes(h.id)).length;
  const weekDone=state.habits.reduce((sum,h)=>sum+weekKeys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)&&(state.records[k]?.done||[]).includes(h.id)).length,0);
  const weekSlots=state.habits.reduce((sum,h)=>sum+weekKeys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)).length,0);
  const stats=state.habits.map(h=>{const elapsed=keys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)).length;const count=keys.filter(k=>k<=today&&(!h.createdAt||k>=h.createdAt)&&(state.records[k]?.done||[]).includes(h.id)).length;return {...h,count,rate:elapsed?count/elapsed*100:0};}).sort((a,b)=>b.rate-a.rate);
  const daily=keys.map(k=>{const active=state.habits.filter(h=>k<=today&&(!h.createdAt||k>=h.createdAt));const count=active.filter(h=>(state.records[k]?.done||[]).includes(h.id)).length;return {key:k,day:fromKey(k).getDate(),rate:active.length?count/active.length*100:-1};});
  function updateRecord(k:string,patch:Partial<RecordDay>){setState(current=>({...current,records:{...current.records,[k]:{done:current.records[k]?.done||[],...(current.records[k]||{}),...patch}}}));}
  function addHabit(e:React.FormEvent){e.preventDefault();const name=habitName.trim();if(!name)return;if(state.habits.some(h=>h.name.toLowerCase()===name.toLowerCase())){setError('Такая привычка уже есть.');return;}setState(current=>({...current,habits:[...current.habits,{id:window.crypto?.randomUUID?.()||String(Date.now()),name,createdAt:today}]}));setHabitName('');setError('');}
  function toggle(k:string,id:string){const list=state.records[k]?.done||[];updateRecord(k,{done:list.includes(id)?list.filter(v=>v!==id):[...list,id]});}
  function removeHabit(id:string){if(!window.confirm('Удалить привычку и все её отметки?'))return;setState(current=>({habits:current.habits.filter(h=>h.id!==id),records:Object.fromEntries(Object.entries(current.records).map(([k,r])=>[k,{...r,done:r.done.filter(v=>v!==id)}]))}));}
  const scored=keys.filter(k=>state.records[k]?.mood||state.records[k]?.motivation).map(k=>({key:k,mood:state.records[k]?.mood,motivation:state.records[k]?.motivation}));
  const moodPoints=scored.filter(p=>p.mood).map(p=>{const i=scored.findIndex(item=>item.key===p.key);return (scored.length===1?50:6+i*88/(scored.length-1))+','+(100-((p.mood||1)-1)*22);}).join(' ');
  const motivationPoints=scored.filter(p=>p.motivation).map(p=>{const i=scored.findIndex(item=>item.key===p.key);return (scored.length===1?50:6+i*88/(scored.length-1))+','+(100-((p.motivation||1)-1)*22);}).join(' ');
  return <div className="sten-habits-workspace"><div className="sten-plan-week-heading"><div><span className="sten-plan-kicker"><HeartPulse size={14}/> ТРЕКЕР ПРИВЫЧЕК</span><h2>{monthName}</h2><p>Личная динамика дисциплины, настроения и мотивации.</p></div><div className="sten-plan-week-controls"><button className="secondary-button" aria-label="Предыдущий месяц" onClick={()=>setMonthOffset(v=>v-1)}><ChevronLeft size={16}/></button><button className="secondary-button" onClick={()=>setMonthOffset(0)}>Этот месяц</button><button className="secondary-button" aria-label="Следующий месяц" onClick={()=>setMonthOffset(v=>v+1)}><ChevronRight size={16}/></button></div></div>
    <div className="sten-plan-local-note">История привычек хранится локально в этом браузере. Для синхронизации между устройствами нужен отдельный серверный контракт; backend не меняется.</div>{error&&<div className="sten-plan-error" role="alert">{error}</div>}
    <div className="sten-plan-summary"><div className="sten-plan-summary-main"><Donut value={slots?overall:null} label="Общий прогресс привычек"/><div><span>Прогресс месяца</span><strong>{slots?Math.round(overall)+'%':'—'}</strong><small>{state.habits.length?'По отметкам текущего месяца':'Добавьте привычку, чтобы начать'}</small></div></div><div className="sten-plan-stat"><span>Выполнено сегодня</span><strong>{todayDone}/{state.habits.length}</strong></div><div className="sten-plan-stat"><span>За неделю</span><strong>{weekDone}/{weekSlots}</strong></div><div className="sten-plan-stat"><span>Привычек</span><strong>{state.habits.length}</strong></div></div>
    <section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>Сетка месяца</h3><p>Отметки по неделям месяца</p></div></div><form className="sten-plan-add sten-habit-add" onSubmit={addHabit}><input value={habitName} onChange={e=>setHabitName(e.target.value)} placeholder="Название новой привычки…" aria-label="Название новой привычки" maxLength={100}/><button className="primary-button" type="submit" disabled={!habitName.trim()}><Plus size={16}/> Добавить</button></form>
    {state.habits.length?<div className="sten-habit-table-scroll"><table className="sten-habit-table"><thead><tr><th rowSpan={2}>Привычка</th>{Array.from({length:Math.ceil(dayCount/7)},(_,w)=>{const first=w*7+1,last=Math.min(dayCount,first+6);return <th key={w} colSpan={last-first+1}>Неделя {w+1}</th>;})}</tr><tr>{keys.map(k=><th key={k} className={k===today?'is-today':''}>{fromKey(k).getDate()}</th>)}</tr></thead><tbody>{state.habits.map(h=><tr key={h.id}><th scope="row"><span>{h.name}</span><button type="button" className="sten-plan-icon-button" aria-label={'Удалить привычку '+h.name} onClick={()=>removeHabit(h.id)}><Trash2 size={14}/></button></th>{keys.map(k=><td key={k} className={k===today?'is-today':''}><input type="checkbox" aria-label={h.name+', '+k} checked={(state.records[k]?.done||[]).includes(h.id)} onChange={()=>toggle(k,h.id)}/></td>)}</tr>)}</tbody></table></div>:<div className="sten-plan-empty">Пока нет привычек. Добавьте одну — сетка месяца появится автоматически.</div>}</section>
    <div className="sten-plan-columns"><section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>Прогресс по дням</h3><p>Доля выполненных привычек за день</p></div></div><div className="sten-habit-bars">{daily.map(d=><div className="sten-habit-bar-item" key={d.key} title={d.rate<0?'Нет данных':d.day+': '+Math.round(d.rate)+'%'}><div className="sten-habit-bar-track"><div style={{height:Math.max(0,d.rate)+'%'}}/></div><small>{d.day}</small></div>)}</div></section><section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>Требуют внимания</h3><p>Наименьший процент выполнения</p></div></div>{stats.length?<ol className="sten-habit-ranking">{[...stats].sort((a,b)=>a.rate-b.rate).slice(0,3).map(h=><li key={h.id}><span>{h.name}</span><strong>{Math.round(h.rate)}%</strong></li>)}</ol>:<div className="sten-plan-empty">Добавьте привычки, чтобы увидеть рейтинг.</div>}</section></div>
    <div className="sten-plan-columns"><section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>ТОП-5 по месяцу</h3><p>Успешность с начала месяца</p></div></div>{stats.length?<ol className="sten-habit-ranking">{stats.slice(0,5).map(h=><li key={h.id}><span>{h.name}</span><strong>{Math.round(h.rate)}%</strong></li>)}</ol>:<div className="sten-plan-empty">Рейтинг появится после добавления привычек.</div>}</section>
    <section className="panel sten-plan-card"><div className="sten-plan-card-heading"><div><h3>Настроение и мотивация</h3><p>Оценка от 1 до 5</p></div></div><div className="sten-habit-state-inputs"><label>Дата оценки<input type="date" value={stateDate} min={keys[0]} max={keys[keys.length-1]} onChange={e=>setStateDate(e.target.value)}/></label><label>Настроение<select value={selectedRecord.mood||''} onChange={e=>updateRecord(stateDate,{mood:e.target.value?Number(e.target.value):undefined})}><option value="">Не указано</option>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} — {['Очень плохо','Плохо','Нейтрально','Хорошо','Отлично'][v-1]}</option>)}</select></label><label>Мотивация<select value={selectedRecord.motivation||''} onChange={e=>updateRecord(stateDate,{motivation:e.target.value?Number(e.target.value):undefined})}><option value="">Не указана</option>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} из 5</option>)}</select></label></div>{scored.length?<div className="sten-habit-line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="Динамика настроения и мотивации"><line x1="6" y1="12" x2="94" y2="12"/><line x1="6" y1="34" x2="94" y2="34"/><line x1="6" y1="56" x2="94" y2="56"/><line x1="6" y1="78" x2="94" y2="78"/><polyline className="mood-line" points={moodPoints}/><polyline className="motivation-line" points={motivationPoints}/></svg><div className="sten-habit-legend"><span><i className="mood-dot"/> Настроение</span><span><i className="motivation-dot"/> Мотивация</span></div></div>:<div className="sten-plan-empty">Заполните оценку, чтобы построить график.</div>}</section></div>
    <p className="sten-habit-footnote">Личные оценки не передаются в KPI сотрудников и не влияют на расчёты ресторана.</p>
  </div>;
}
