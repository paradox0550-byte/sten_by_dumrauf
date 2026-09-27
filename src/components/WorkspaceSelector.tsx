import{useEffect,useMemo,useState}from'react';
import{Check,Building2,GitBranch,Layers3,Users}from'lucide-react';
import{api}from'../lib/api';
import{DEFAULT_PERIOD,Scope}from'../lib/scope';

type Node={id:string;name:string;type:'project'|'branch'|'restaurant'|'department';parentId?:string};

function flatten(input:unknown,parentId?:string,out:Node[]=[]):Node[]{
 if(Array.isArray(input)){for(const x of input)flatten(x,parentId,out);return out}
 if(!input||typeof input!=='object')return out;
 const x=input as Record<string,unknown>;
 const id=typeof x.id==='string'?x.id:typeof x.uuid==='string'?x.uuid:undefined;
 const name=typeof x.name==='string'?x.name:typeof x.title==='string'?x.title:undefined;
 const raw=String(x.type||x.kind||'').toLowerCase();
 const type=raw.includes('branch')?'branch':raw.includes('restaurant')||raw.includes('unit')?'restaurant':raw.includes('department')?'department':'project';
 const nextParent=id||parentId;
 if(id&&name)out.push({id,name,type,parentId});
 for(const key of ['children','projects','branches','restaurants','departments','units'])if(x[key])flatten(x[key],nextParent,out);
 return out;
}

export default function WorkspaceSelector({value,onChange}:{value:Scope;onChange:(next:Scope)=>void}){
 const[nodes,setNodes]=useState<Node[]>([]);
 const[loading,setLoading]=useState(true);
 useEffect(()=>{setLoading(true);api.get<unknown>('/api/b2b/org/tree').then(x=>setNodes(flatten(x))).catch(()=>setNodes([])).finally(()=>setLoading(false))},[]);
 const projects=useMemo(()=>nodes.filter(x=>x.type==='project'),[nodes]);
 const branches=useMemo(()=>nodes.filter(x=>x.type==='branch'&&(!value.projectId||x.parentId===value.projectId)),[nodes,value.projectId]);
 const restaurants=useMemo(()=>nodes.filter(x=>x.type==='restaurant'&&(!value.branchId||x.parentId===value.branchId)),[nodes,value.branchId]);
 const departments=useMemo(()=>nodes.filter(x=>x.type==='department'&&(!value.restaurantId||x.parentId===value.restaurantId)),[nodes,value.restaurantId]);
 const set=(patch:Partial<Scope>)=>onChange({...value,...patch});
 const select=(label:string,items:Node[],selected:string|undefined,patch:(id:string|undefined)=>void,Icon:typeof Building2)=><label className="settings-field workspace-select"><span><Icon size={15}/>{label}</span><select value={selected||''} onChange={e=>patch(e.target.value||undefined)} disabled={loading||items.length===0}><option value="">{items.length?'Не выбрано':'Нет данных'}</option>{items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
 return <section className="panel workspace-settings">
  <div className="workspace-heading"><div><span className="eyebrow">РАБОЧИЙ КОНТУР</span><h2>Где сейчас работаем</h2><p className="muted">Выбор сохраняется автоматически и применяется ко всем разделам STEN. Здесь же меняется ресторан или филиал.</p></div><div className="workspace-status"><Check size={15}/>Единый контекст</div></div>
  <div className="workspace-grid">
   <label className="settings-field workspace-select"><span><Layers3 size={15}/>Период</span><input type="month" value={value.period||DEFAULT_PERIOD} onChange={e=>set({period:e.target.value})}/></label>
   {select('Проект',projects,value.projectId,id=>set({projectId:id,branchId:undefined,restaurantId:undefined,departmentId:undefined}),Layers3)}
   {select('Филиал',branches,value.branchId,id=>set({branchId:id,restaurantId:undefined,departmentId:undefined}),GitBranch)}
   {select('Ресторан',restaurants,value.restaurantId,id=>set({restaurantId:id,departmentId:undefined}),Building2)}
   {select('Отдел',departments,value.departmentId,id=>set({departmentId:id}),Users)}
  </div>
  {!loading&&nodes.length===0&&<div className="pnl-message warn">Рабочие объекты пока не загружены. Создайте и подтвердите проект, филиал или ресторан в контуре организации.</div>}
 </section>;
}
