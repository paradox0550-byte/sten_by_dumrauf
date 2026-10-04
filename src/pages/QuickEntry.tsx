import{useEffect,useMemo,useRef,useState}from'react';
import{ArrowLeft,Check,Save,Trash2}from'lucide-react';
import{useNavigate}from'react-router-dom';
import{api}from'../lib/api';import{ReportWriteSchema,type ReportWrite}from'../lib/contracts/reports';

type Key='revenue'|'cash'|'card'|'discounts'|'checks'|'avgCheck';
type Values=Partial<Record<Key,number>>;
const FIELDS:Array<{key:Key;label:string;placeholder:string}>=[
 {key:'revenue',label:'Выручка ₽',placeholder:'125 000'},
 {key:'cash',label:'Наличные ₽',placeholder:'45 000'},
 {key:'card',label:'Карта ₽',placeholder:'80 000'},
 {key:'discounts',label:'Скидки ₽',placeholder:'3 200'},
 {key:'checks',label:'Чеки',placeholder:'68'},
 {key:'avgCheck',label:'Средний чек ₽',placeholder:'1 850'},
];
const keyFor=(date:string)=>'sten:quick-entry:'+date;
const parse=(s:string)=>{const clean=s.replace(/[^0-9.,-]/g,'').replace(',','.');if(!clean)return undefined;const n=Number(clean);return Number.isFinite(n)&&n>=0?n:undefined};
const display=(n:number|undefined)=>n===undefined?'':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);

export default function QuickEntry(){
 const nav=useNavigate();
 const now=new Date(); const date=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 const[values,setValues]=useState<Values>({});
 const[loading,setLoading]=useState(true);
 const[saving,setSaving]=useState(false);
 const[saved,setSaved]=useState(false);
 const[message,setMessage]=useState('');
 const refs=useRef<Array<HTMLInputElement|null>>([]);
 const dateLabel=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit'}).format(new Date(date+'T12:00:00'));
 useEffect(()=>{let cancelled=false;(async()=>{try{const cached=localStorage.getItem(keyFor(date));if(cached){const parsed=JSON.parse(cached);if(parsed&&typeof parsed==='object'&&!cancelled)setValues(parsed)}const r=await api.get<any>('/reports?date='+date);const report=Array.isArray(r?.reports)?r.reports[0]:null;if(report?.values&&typeof report.values==='object'&&!cancelled){setValues(report.values);localStorage.setItem(keyFor(date),JSON.stringify(report.values))}}catch{}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[date]);
 useEffect(()=>{if(!loading)localStorage.setItem(keyFor(date),JSON.stringify(values))},[values,loading,date]);
 const derivedAvg=useMemo(()=>values.avgCheck??(values.revenue!==undefined&&values.checks!==undefined&&values.checks>0?values.revenue/values.checks:undefined),[values]);
 function update(key:Key,text:string){setSaved(false);setMessage('');setValues(v=>{const n=parse(text);const next={...v};if(n===undefined)delete next[key];else next[key]=n;return next})}
 function next(index:number){refs.current[index+1]?.focus()}
 async function save(){setSaving(true);setSaved(false);setMessage('');try{const clean:Record<string,number>={};for(const f of FIELDS){const n=f.key==='avgCheck'?derivedAvg:values[f.key];if(n!==undefined)clean[f.key]=n}const body=ReportWriteSchema.parse({date,values:clean,note:'Quick Entry'});await api.post('/reports',body);localStorage.setItem(keyFor(date),JSON.stringify(clean));setValues(clean);setSaved(true);setMessage('Смена сохранена.')}catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить смену.')}finally{setSaving(false)}}
 function clearDraft(){if(!window.confirm('Очистить черновик этой смены?'))return;localStorage.removeItem(keyFor(date));setValues({});setSaved(false);setMessage('Черновик очищен.')}
 return <main className="quick-entry-page">
  <header className="quick-entry-head"><button className="icon-button"aria-label="Назад"onClick={()=>nav('/pnl')}><ArrowLeft size={20}/></button><div><small>QUICK ENTRY</small><h1>Выручка за {dateLabel}</h1></div><button className="icon-button"aria-label="Очистить черновик"onClick={clearDraft}><Trash2 size={18}/></button></header>
  <section className="quick-entry-form"aria-busy={loading}>
   <label className="quick-entry-field primary"><span>Выручка ₽</span><input ref={el=>{refs.current[0]=el}} inputMode="decimal"autoComplete="off"placeholder="125 000"value={display(values.revenue)}onChange={e=>update('revenue',e.target.value)}onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();next(0)}}}/></label>
   <div className="quick-entry-payment-grid" aria-label="Способы оплаты">
    {(['cash','card'] as const).map((key,index)=><label className="quick-entry-field payment" key={key}><span>{key==='cash'?'Наличные ₽':'Карта ₽'}</span><input ref={el=>{refs.current[index+1]=el}} inputMode="decimal"autoComplete="off"placeholder={key==='cash'?'45 000':'80 000'}value={display(values[key])}onChange={e=>update(key,e.target.value)}onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();next(index+1)}}}/></label>)}
   </div>
   <label className="quick-entry-field"><span>Скидки ₽</span><input ref={el=>{refs.current[3]=el}} inputMode="decimal"autoComplete="off"placeholder="3 200"value={display(values.discounts)}onChange={e=>update('discounts',e.target.value)}onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();next(3)}}}/></label>
   <label className="quick-entry-field"><span>Чеки</span><input ref={el=>{refs.current[4]=el}} inputMode="numeric"autoComplete="off"placeholder="68"value={display(values.checks)}onChange={e=>update('checks',e.target.value)}onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();next(4)}}}/></label>
   <label className="quick-entry-field"><span>Средний чек ₽</span><input ref={el=>{refs.current[5]=el}} inputMode="decimal"autoComplete="off"placeholder="1 850"value={display(values.avgCheck??derivedAvg)}onChange={e=>update('avgCheck',e.target.value)}onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();next(5)}}}/></label>
   <div className="quick-entry-check"><span>Проверка</span><b>{values.cash!==undefined&&values.card!==undefined&&values.revenue!==undefined?Math.abs(values.cash+values.card-values.revenue)<0.01?'Наличные + карта = выручка':'Наличные + карта не равны выручке':'Нет данных для проверки'}</b></div>
   {message&&<div className={saved?'quick-entry-message ok':'quick-entry-message'}>{saved&&<Check size={16}/>} {message}</div>}
  </section>
  <div className="quick-entry-bottom"><button className="primary-button quick-entry-save"disabled={saving||loading}onClick={()=>void save()}><Save size={18}/>{saving?'Сохраняем…':'Сохранить'}</button></div>
 </main>
}
