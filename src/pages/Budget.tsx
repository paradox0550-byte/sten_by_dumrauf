import{useEffect,useMemo,useState}from'react';
import{BarChart3,CheckCircle2,Copy,Download,RefreshCw}from'lucide-react';
import*as XLSX from'xlsx';
import{api}from'../lib/api';import{writePnlAndVerify}from'../lib/saveVerify';
import{useScope}from'../lib/useScope';
import{scopeQuery}from'../lib/scope';
import{aggregateFinancialRows,canonicalArticleKey,FinancialRow}from'../lib/financialRows';
import{formatMoney,formatDeltaPct}from'../lib/format';

type Row=FinancialRow;
const canonical=[['revenue','Выручка'],['cogs','Себестоимость'],['payroll','ФОТ'],['opex','OPEX'],['depreciation','Амортизация'],['interest','Проценты'],['tax','Налоги'],['other','Прочее']] as const;
const has=(v:number|null|undefined):v is number=>typeof v==='number'&&Number.isFinite(v);
const EXPENSE_KEYWORDS=['cogs','labor','payroll','opex','personnel','other','себестоим','фот','персонал','расход','затрат'];
const isExpenseArticle=(article:string):boolean=>{const key=String(article||'').toLowerCase();return EXPENSE_KEYWORDS.some(k=>key.includes(k))};
const moneyOrEmpty=(v:number|null|undefined)=>has(v)?formatMoney(v):'Нет данных';
const pctOrEmpty=(v:number|null|undefined)=>has(v)?`${v.toFixed(1).replace('.',',')} %`:'Нет данных';

export default function Budget(){

 const[scope]=useScope(),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[approval,setApproval]=useState<'draft'|'approved'>('draft'),[canApprove,setCanApprove]=useState(false),[action,setAction]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const r=await api.get<any>('/api/pnl?'+scopeQuery(scope));const d=r?.rows?r:r?.data??r;setRows(aggregateFinancialRows(Array.isArray(d.rows)?d.rows:[]));const a=await api.get<any>('/api/pnl/approval?'+scopeQuery(scope)).catch(()=>null);if(a){setApproval(a.status==='approved'?'approved':'draft');setCanApprove(Boolean(a.canApprove))}}catch(e){setRows([]);setError(e instanceof Error?e.message:'P&L недоступен')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[scope.period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);
 const view=useMemo(()=>canonical.map(([key,label])=>{const row=rows.find(r=>canonicalArticleKey(r.article)===key);return row||{article:label,plan:null,fact:null}}),[rows]);
 const revenue=view[0],cogs=view[1],payroll=view[2],opex=view[3];
 const ebitda=(has(revenue.fact)&&has(cogs.fact)&&has(payroll.fact)&&has(opex.fact))?revenue.fact-cogs.fact-payroll.fact-opex.fact:null;
 const ebitdaPlan=(has(revenue.plan)&&has(cogs.plan)&&has(payroll.plan)&&has(opex.plan))?revenue.plan-cogs.plan-payroll.plan-opex.plan:null;
 const marginPlan=has(ebitdaPlan)&&has(revenue.plan)&&revenue.plan!==0?ebitdaPlan/revenue.plan*100:null;
 const marginFact=has(ebitda)&&has(revenue.fact)&&revenue.fact!==0?ebitda/revenue.fact*100:null;
 const deviation=has(ebitda)&&has(ebitdaPlan)?ebitda-ebitdaPlan:null;
 const fillPlan=async()=>{const factRows=rows.filter(r=>has(r.fact)&&!has(r.plan));if(!factRows.length){setAction('Нет подтверждённого факта без плана для заполнения.');return}if(!window.confirm(`Заполнить план фактом для ${factRows.length} статей?`))return;setAction(`Сохраняем план из факта для ${factRows.length} статей…`);try{const payload=rows.map(r=>({article:r.article,plan:has(r.plan)?r.plan:(has(r.fact)?r.fact:null),fact:r.fact??null}));const result=await writePnlAndVerify(scope,payload);if(!result.ok){setAction(result.message);return}setAction(`План заполнен для ${factRows.length} статей. Подтверждено повторным чтением.`);await load()}catch(e){setAction(e instanceof Error?e.message:'Не удалось заполнить план.')}};
 const exportExcel=()=>{const data=view.map(r=>({Статья:r.article,'План, ₽':r.plan??null,'Факт, ₽':r.fact??null,'Отклонение, ₽':has(r.plan)&&has(r.fact)?r.fact-r.plan:null}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Бюджет');XLSX.writeFile(wb,`STEN-Бюджет-${scope.period}.xlsx`);setAction('Excel сформирован.');};
 const approve=async()=>{if(!canApprove)return;setAction('Утверждаем план…');try{const r=await api.post<any>('/api/pnl/approve',{period:scope.period,project_id:scope.projectId??'',branch_id:scope.branchId??'',restaurant_id:scope.restaurantId??'',department_id:scope.departmentId??''});const payload=r?.data??r;const serverSaid=payload?.status==='approved'||payload?.confirmed===true;if(!serverSaid){setAction('Сервер не подтвердил утверждение. План НЕ утверждён.');return}const check=await api.get<any>('/api/pnl/approval?'+scopeQuery(scope)).catch(()=>null);const checkPayload=check?.data??check;if(!checkPayload||checkPayload.status!=='approved'){setAction('Повторное чтение не подтвердило утверждение. План НЕ утверждён.');return}setApproval('approved');setCanApprove(Boolean(checkPayload.canApprove));setAction(payload?.message||'План утверждён и подтверждён повторным чтением.')}catch(e){setAction(e instanceof Error?e.message:'Не удалось утвердить план.')}};
 const kpis=[['Выручка',revenue.plan,revenue.fact,formatDeltaPct(revenue.plan,revenue.fact)],['EBITDA',ebitdaPlan,ebitda,formatDeltaPct(ebitdaPlan,ebitda)],['Маржа EBITDA',marginPlan,marginFact,has(marginPlan)&&has(marginFact)?`${(marginFact-marginPlan).toFixed(1).replace('.',',')} п.п.`:'Нет данных'],['Отклонение EBITDA',null,deviation,has(deviation)?(deviation>=0?'выше плана':'ниже плана'):'Нет данных']];
 return <div className="page"><div className="page-head"><div><span className="eyebrow">ПЛАНИРОВАНИЕ · P&L</span><h1>Бюджет</h1><p>Бюджет строится из подтверждённого P&L. Один финансовый источник, без второй ручной базы.</p></div><button className="secondary-button"onClick={()=>void load()}><RefreshCw size={16}/>Обновить</button></div>
 
 {error&&<div className="import-result warn">{error}</div>}
 <div className="budget-source"><BarChart3 size={16}/><span>Источник: <b>P&L · {scope.period}</b> · выбранная область · серверные План/Факт {approval==='approved'&&<b> · План утверждён</b>}</span></div>
 <div className="budget-kpis">{kpis.map(([label,plan,fact,delta],i)=><div className="budget-kpi"key={label as string}><small>{label as string}</small>{i<2?<><div className="budget-kpi-pair"><span>План <b>{loading?'Загрузка…':moneyOrEmpty(plan as number|null)}</b></span><span>Факт <b>{loading?'Загрузка…':moneyOrEmpty(fact as number|null)}</b></span></div></>:i===2?<><div className="budget-kpi-pair"><span>План <b>{loading?'Загрузка…':pctOrEmpty(plan as number|null)}</b></span><span>Факт <b>{loading?'Загрузка…':pctOrEmpty(fact as number|null)}</b></span></div><em>{delta as string}</em></>:<><strong>{loading?'Загрузка…':moneyOrEmpty(fact as number|null)}</strong><em>{delta as string}</em></>}</div>)}</div>
 <div className="quick-actions"><button className="secondary-button"onClick={()=>void fillPlan()}><Copy size={15}/>Заполнить план из факта</button><button className="secondary-button"onClick={exportExcel}><Download size={15}/>Выгрузить Excel</button>{canApprove&&<button className={approval==='approved'?'secondary-button':'primary-button'}onClick={()=>void approve()} disabled={approval==='approved'}><CheckCircle2 size={15}/>{approval==='approved'?'План утверждён':'Утвердить план'}</button>}</div>
 {action&&<div className="action-note">{action}</div>}
 <section className="panel budget-panel"><div className="panel-title">Финансовая ведомость <span>{rows.length} уникальных статей после нормализации</span></div><div className="budget-grid">{['Статья','План','Факт','Отклонение'].map((h,i)=><div className="head"key={h}>{h}</div>)}{view.map((r,i)=>{const d=has(r.plan)&&has(r.fact)?r.fact-r.plan:null;return <div className="budget-grid-row"key={canonical[i][0]}><div><b>{r.article}</b></div><div className="num">{moneyOrEmpty(r.plan)}</div><div className="num">{moneyOrEmpty(r.fact)}</div><div className={'num '+(has(d)&&d!==null?(isExpenseArticle(r.article)?(d<0?'positive':'negative'):(d>0?'positive':'negative')):'')}>{moneyOrEmpty(d)}</div></div>})}</div>{!loading&&!rows.length&&<div className="empty-state"><b>Нет данных за выбранный период</b><span>Измените период или область в фильтрах. STEN не подставляет нули вместо отсутствующих данных.</span></div>}</section></div>}
