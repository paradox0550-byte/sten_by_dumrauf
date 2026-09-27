import{useEffect,useMemo,useState}from'react';
import{RefreshCw,Users,Clock3,WalletCards,AlertTriangle}from'lucide-react';
import{api}from'../lib/api';
import{scopeQuery}from'../lib/scope';
import{useScope}from'../lib/useScope';

type Rec={department:string;hours:number;amount:number;period:string};
const fmt=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n);
const money=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
export default function Team(){
 const[scope]=useScope();const[data,setData]=useState<Rec[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const r=await api.get<any>('/fot-analytics?'+scopeQuery(scope));setData(Array.isArray(r?.records)?r.records.filter((x:any)=>x.period===scope.period):[])}catch(e){setData([]);setError(e instanceof Error?e.message:'Не удалось загрузить ФОТ')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[scope.period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);
 const grouped=useMemo(()=>{const m=new Map<string,{hours:number;amount:number}>();data.forEach(x=>{const k=x.department||'Без отдела';const v=m.get(k)||{hours:0,amount:0};v.hours+=Number(x.hours)||0;v.amount+=Number(x.amount)||0;m.set(k,v)});return[...m.entries()].sort((a,b)=>b[1].amount-a[1].amount)},[data]);
 const total=useMemo(()=>grouped.reduce((a,[,v])=>({hours:a.hours+v.hours,amount:a.amount+v.amount}),{hours:0,amount:0}),[grouped]);
 const hourly=total.hours>0?total.amount/total.hours:undefined;
 return <div className="page analytics-page team-page"><div className="page-head"><div><span className="eyebrow"><Users size={12}/> ОПЕРАЦИИ · ФОТ</span><h1>Команда</h1><p>Аналитический отчёт по ФОТ и трудозатратам выбранного рабочего контура. Сотрудники и переработки показываются только при наличии источника.</p></div><button className="secondary-button"onClick={()=>void load()}disabled={loading}><RefreshCw size={15}/>Обновить</button></div>
{error&&<div className="panel empty-state"><b>ФОТ недоступен</b><span>{error}</span></div>}
{loading?<div className="panel empty">Загружаем ФОТ…</div>:!data.length?<section className="analytics-gap-section"><div className="analytics-gap-head"><div><span className="eyebrow">КАЧЕСТВО ДАННЫХ</span><h2>Нет подтверждённого ФОТ</h2></div><AlertTriangle size={17}/></div><p>Загрузите табель или подключите payroll-источник. STEN не будет оценивать численность, переработки или производительность без соответствующих данных.</p></section>:<>
<section className="analytics-kpi-strip"><div><small>ФОТ</small><strong>{money(total.amount)}</strong><span>Факт за {scope.period}</span></div><div><small>Часы</small><strong>{fmt(total.hours)}</strong><span>Подтверждённые часы</span></div><div><small>Стоимость часа</small><strong>{hourly==null?'Нет данных':money(hourly)}</strong><span>ФОТ / часы</span></div><div><small>Подразделения</small><strong>{grouped.length}</strong><span>С данными ФОТ</span></div></section>
<section className="panel analytics-report-section"><div className="panel-title">ФОТ по подразделениям</div><div className="analytics-report-table labor-table"><div className="analytics-report-head"><span>Подразделение</span><span>Часы</span><span>ФОТ</span><span>Стоимость часа</span></div>{grouped.map(([d,v])=><div key={d}><b>{d}</b><span>{fmt(v.hours)} ч</span><span>{money(v.amount)}</span><strong>{v.hours?money(v.amount/v.hours):'Нет данных'}</strong></div>)}<div className="analytics-report-total"><b>Итого</b><span>{fmt(total.hours)} ч</span><strong>{money(total.amount)}</strong><span>{hourly==null?'—':money(hourly)}</span></div></div></section>
<section className="analytics-gap-section"><div className="analytics-gap-head"><div><span className="eyebrow">СЛЕДУЮЩИЙ СЛОЙ</span><h2>Что можно добавить после подключения источников</h2></div></div><div className="analytics-gap-list"><span>Численность и FTE</span><span>Переработки</span><span>Выручка на час</span><span>ФОТ % от выручки</span><span>План / факт часов</span><span>Потребность в часах</span></div><p>Эти показатели требуют связки ФОТ с выручкой, графиком и табелем. Сейчас STEN показывает только то, что подтверждено источником ФОТ.</p></section></>}</div>}
