import{useEffect,useMemo,useState}from'react';
import{CalendarDays}from'lucide-react';
import{api}from'../lib/api';
import{DEFAULT_PERIOD,Scope}from'../lib/scope';

type Node={id:string;name:string;type:'project'|'branch'|'restaurant'|'department';parentId?:string};
type Props={value:Scope;onChange:(next:Scope)=>void};

function flatten(input:unknown,parentId?:string,out:Node[]=[]):Node[]{
  if(Array.isArray(input)){for(const x of input)flatten(x,parentId,out);return out}
  if(!input||typeof input!=='object')return out;
  const x=input as Record<string,unknown>;
  const id=typeof x.id==='string'?x.id:typeof x.uuid==='string'?x.uuid:undefined;
  const name=typeof x.name==='string'?x.name:typeof x.title==='string'?x.title:undefined;
  const rawType=String(x.type||x.kind||'').toLowerCase();
  const type=rawType.includes('branch')?'branch':rawType.includes('restaurant')||rawType.includes('unit')?'restaurant':rawType.includes('department')?'department':'project';
  const nextParent=id||parentId;
  if(id&&name)out.push({id,name,type,parentId});
  for(const key of ['children','projects','branches','restaurants','departments','units'])if(x[key])flatten(x[key],nextParent,out);
  return out
}

export default function ScopeBar({value,onChange}:Props){
  const[nodes,setNodes]=useState<Node[]>([]);
  useEffect(()=>{api.get<unknown>('/api/b2b/org/tree').then(x=>setNodes(flatten(x))).catch(()=>setNodes([]))},[]);
  const projects=useMemo(()=>nodes.filter(x=>x.type==='project'),[nodes]);
  const branches=useMemo(()=>nodes.filter(x=>x.type==='branch'&&(!value.projectId||x.parentId===value.projectId)),[nodes,value.projectId]);
  const restaurants=useMemo(()=>nodes.filter(x=>x.type==='restaurant'&&(!value.branchId||x.parentId===value.branchId)),[nodes,value.branchId]);
  const departments=useMemo(()=>nodes.filter(x=>x.type==='department'&&(!value.restaurantId||x.parentId===value.restaurantId)),[nodes,value.restaurantId]);
  const set=(patch:Partial<Scope>)=>onChange({...value,...patch});
  return <div className="scope-bar" aria-label="Область данных">
    <label><span>Период</span><span className="scope-input"><CalendarDays size={15}/><input type="month" value={value.period||DEFAULT_PERIOD} onChange={e=>set({period:e.target.value})}/></span></label>
    <label><span>Проект</span><select value={value.projectId||''} onChange={e=>set({projectId:e.target.value||undefined,branchId:undefined,restaurantId:undefined,departmentId:undefined})}><option value="">Все проекты</option>{projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label><span>Филиал</span><select value={value.branchId||''} onChange={e=>set({branchId:e.target.value||undefined,restaurantId:undefined,departmentId:undefined})}><option value="">Все филиалы</option>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label><span>Ресторан</span><select value={value.restaurantId||''} onChange={e=>set({restaurantId:e.target.value||undefined,departmentId:undefined})}><option value="">Все рестораны</option>{restaurants.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label><span>Отдел</span><select value={value.departmentId||''} onChange={e=>set({departmentId:e.target.value||undefined})}><option value="">Все отделы</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  </div>
}
