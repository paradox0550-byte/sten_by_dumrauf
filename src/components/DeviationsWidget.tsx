import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatMoneyAuto, formatPercent } from '../lib/format';
import type { Scope } from '../lib/scope';

type DeviationItem = { article:string; key:string; plan:number|null; fact:number|null; delta_abs:number|null; delta_pct:number|null; favorable:boolean|null; severity:'high'|'medium'|'low'|null; source:string };
type DeviationsResult = { period:string; scope:{project_id:string;branch_id:string;restaurant_id:string;department_id:string}; critical:DeviationItem[]; positive:DeviationItem[]; missing:Array<{article:string;key?:string;plan:number|null;fact:number|null}>; total_impact:number; has_data:boolean };
type AskDeviationResponse = { tool_results?:Array<{name:string;args?:unknown;result?:DeviationsResult}> };
export interface DeviationsWidgetProps { period:string; scope:Scope }

function Card({item,positive,onAnalyze}:{item:DeviationItem;positive?:boolean;onAnalyze:(item:DeviationItem)=>void}) {
  const severity=item.severity==='high'?'high':item.severity==='medium'?'medium':'low';
  const badgeClass=positive||item.favorable===true?'success':severity==='high'?'danger':severity==='medium'?'warning':'neutral';
  const badgeText=positive||item.favorable===true?'Благоприятно':severity==='high'?'Высокий':severity==='medium'?'Средний':'Низкий';
  const cardSeverity=item.severity==='high'?'high':'medium';
  const pct=item.delta_pct===null?'—':formatPercent(item.delta_pct,1);
  const className='deviations-widget__card deviations-widget__card--'+(positive?'positive':cardSeverity);
  return <article className={className}>
    <span className="deviations-widget__article">{item.article}</span>
    <span className={`badge badge--${badgeClass}`}>{badgeText}</span>
    <div className="deviations-widget__numbers"><strong className="deviations-widget__value">{formatMoneyAuto(item.delta_abs)}</strong><span className="deviations-widget__pct">{pct}</span></div>
    <button className="deviations-widget__action" type="button" onClick={()=>onAnalyze(item)}>Разобрать в AI</button>
  </article>;
}

export function DeviationsWidget({period,scope}:DeviationsWidgetProps) {
  const navigate=useNavigate();
  const [data,setData]=useState<DeviationsResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try {
      const response=await api.post<AskDeviationResponse>('/ask',{question:'__find_deviations__',include_tool_results:true,scope:{period,project_id:scope.projectId??null,branch_id:scope.branchId??null,restaurant_id:scope.restaurantId??null,department_id:scope.departmentId??null}});
      const result=response.tool_results?.find(tool=>tool.name==='find_deviations')?.result;
      if(!result) throw new Error('Результат отклонений не получен.');
      setData(result);
    } catch(e) { setError(e instanceof Error?e.message:'Не удалось загрузить.'); setData(null); }
    finally { setLoading(false); }
  },[period,scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId]);
  useEffect(()=>{void load()},[load]);
  const critical=useMemo(()=>data?.critical.filter(item=>item.severity==='high')??[],[data]);
  const medium=useMemo(()=>data?.critical.filter(item=>item.severity==='medium')??[],[data]);
  const positive=data?.positive??[];
  const analyze=(item:DeviationItem)=>{const delta=item.delta_abs??0; navigate('/ai?q='+encodeURIComponent('Почему '+item.article+' отклонился на '+formatMoneyAuto(delta)+' за '+period+'?'));};
  if(loading) return <section className="deviations-widget" aria-label="Что важно сейчас" aria-busy="true"><div className="deviations-widget__head"><h2 className="deviations-widget__title">Что важно сейчас</h2><span className="deviations-widget__period">{period}</span></div><div className="deviations-widget__grid"><div className="deviations-widget__column deviations-widget__column--critical"><div className="deviations-widget__skeleton"/><div className="deviations-widget__skeleton"/></div><div className="deviations-widget__column deviations-widget__column--medium"><div className="deviations-widget__skeleton"/></div><div className="deviations-widget__column deviations-widget__column--positive"><div className="deviations-widget__skeleton"/></div></div></section>;
  if(error) return <section className="deviations-widget" aria-label="Что важно сейчас"><div className="deviations-widget__head"><h2 className="deviations-widget__title">Что важно сейчас</h2><span className="deviations-widget__period">{period}</span></div><div className="deviations-widget__error"><span>Не удалось загрузить.</span><button className="secondary-button" type="button" onClick={()=>void load()}>Повторить</button></div></section>;
  if(!data?.has_data) return <section className="deviations-widget" aria-label="Что важно сейчас"><div className="deviations-widget__head"><h2 className="deviations-widget__title">Что важно сейчас</h2><span className="deviations-widget__period">{period}</span></div><div className="deviations-widget__empty"><b>Загрузите P&L за {period}, чтобы увидеть отклонения.</b><a href="/pnl">Открыть P&L →</a></div></section>;
  return <section className="deviations-widget" aria-label="Что важно сейчас"><div className="deviations-widget__head"><h2 className="deviations-widget__title">Что важно сейчас</h2><span className="deviations-widget__period">Период {period} · влияние {formatMoneyAuto(data.total_impact)}</span></div><div className="deviations-widget__grid">
    <div className="deviations-widget__column deviations-widget__column--critical"><h3 className="deviations-widget__column-title">Требует внимания</h3>{critical.length?critical.map(item=><Card key={item.key} item={item} onAnalyze={analyze}/>):<div className="deviations-widget__empty">Критических отклонений нет.</div>}</div>
    <div className="deviations-widget__column deviations-widget__column--medium"><h3 className="deviations-widget__column-title">Стоит проверить</h3>{medium.length?medium.map(item=><Card key={item.key} item={item} onAnalyze={analyze}/>):<div className="deviations-widget__empty">Средних отклонений нет.</div>}</div>
    <div className="deviations-widget__column deviations-widget__column--positive"><h3 className="deviations-widget__column-title">Хорошо</h3>{positive.length?positive.map(item=><Card key={item.key} item={item} positive onAnalyze={analyze}/>):<div className="deviations-widget__empty">Положительных отклонений нет.</div>}</div>
  </div></section>;
}