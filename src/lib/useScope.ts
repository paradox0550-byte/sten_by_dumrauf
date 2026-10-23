/* Единый рабочий контекст (scope) для всех страниц: период + проект → филиал →
   ресторан → отдел. Контекст изолирован по организации и пользователю. */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_PERIOD, Scope, scopeKey } from './scope';
import { api } from './api';

const LEGACY_KEY = 'sten_scope_v5';
const EVT = 'sten-scope-change';
function storageKey(user:{id?:string;organizationId?:string|null}|null){return user?.id? `sten_scope_v5:${user.organizationId||'no-org'}:${user.id}`:null;}

function parseScope(raw:string|null):Scope|null {
  if(!raw)return null;
  try {
    const s=JSON.parse(raw) as Partial<Scope>;
    if(!s||typeof s!=='object'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s.period||'')))return null;
    for(const field of ['projectId','branchId','restaurantId','departmentId'] as const) {
      if(s[field]!==undefined&&s[field]!==null&&typeof s[field]!=='string')return null;
    }
    return {
      period:String(s.period),
      projectId:typeof s.projectId==='string'&&s.projectId?s.projectId:undefined,
      branchId:typeof s.branchId==='string'&&s.branchId?s.branchId:undefined,
      restaurantId:typeof s.restaurantId==='string'&&s.restaurantId?s.restaurantId:undefined,
      departmentId:typeof s.departmentId==='string'&&s.departmentId?s.departmentId:undefined,
    };
  } catch { return null; }
}
function readSaved(key:string|null):Scope {
  try { return parseScope(key?localStorage.getItem(key):null) || {period:DEFAULT_PERIOD}; }
  catch { return {period:DEFAULT_PERIOD}; }
}
function selectedIds(scope:Scope):string[] {
  return [scope.projectId,scope.branchId,scope.restaurantId,scope.departmentId].filter((v):v is string=>Boolean(v));
}
function collectOrgIds(input:unknown,out=new Set<string>()):Set<string> {
  if(Array.isArray(input)){for(const item of input)collectOrgIds(item,out);return out;}
  if(!input||typeof input!=='object')return out;
  const x=input as Record<string,unknown>;
  if(typeof x.id==='string')out.add(x.id);
  if(typeof x.uuid==='string')out.add(x.uuid);
  for(const value of Object.values(x))if(value&&typeof value==='object')collectOrgIds(value,out);
  return out;
}

/* Legacy scope is global and therefore cannot be copied blindly between tenants.
   Migrate selected IDs only when the authenticated user's org tree confirms every ID. */
async function migrateLegacyScope(key:string):Promise<Scope|null> {
  try {
    if(localStorage.getItem(key))return null;
    const legacy=parseScope(localStorage.getItem(LEGACY_KEY));
    if(!legacy){localStorage.removeItem(LEGACY_KEY);return null;}
    const ids=selectedIds(legacy);
    if(ids.length){
      const tree=await api.get<unknown>('/api/b2b/org/tree');
      const allowed=collectOrgIds(tree);
      if(!ids.every(id=>allowed.has(id))){localStorage.removeItem(LEGACY_KEY);return null;}
    }
    if(localStorage.getItem(key))return null;
    localStorage.setItem(key,JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_KEY);
    return legacy;
  } catch { return null; }
}

export type ScopeSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export function useScope():[Scope,(next:Scope)=>void,{status:ScopeSaveStatus;error:string}] {
  const {user}=useAuth();
  const key=storageKey(user);
  const [scope,setScope]=useState<Scope>(()=>readSaved(key));
  const [loadedFor,setLoadedFor]=useState<string|null>(null);
  const [contextSave,setContextSave]=useState<{status:ScopeSaveStatus;error:string}>({status:'idle',error:''});
  const contextSeqRef=useRef(0);

  useEffect(()=>{
    const seq=++contextSeqRef.current;
    let cancelled=false;
    const initialize=async()=>{
      let initial=readSaved(key);
      let canPersist=true;
      if(key){
        let keyExists=false;
        try{keyExists=Boolean(localStorage.getItem(key));}catch{/* приватный режим */}
        if(!keyExists){
          let hadLegacy=false;
          try{hadLegacy=Boolean(localStorage.getItem(LEGACY_KEY));}catch{/* приватный режим */}
          const migrated=await migrateLegacyScope(key);
          if(migrated)initial=migrated;
          else initial=readSaved(key);
          try{if(hadLegacy&&localStorage.getItem(LEGACY_KEY))canPersist=false;}catch{canPersist=false;}
        }
      }
      if(cancelled||seq!==contextSeqRef.current)return;
      setScope(initial);
      setLoadedFor(canPersist?key:null);
      try {
        const r=await api.get<any>('/api/b2b/context');
        if(cancelled||seq!==contextSeqRef.current)return;
        const c=r?.context??r?.data?.context;
        if(!c)return;
        // Empty/null server fields must not erase a validated local selection.
        const serverHasSelection=['project_id','branch_id','restaurant_id','department_id'].some(k=>typeof c[k]==='string'&&c[k].length>0);
        if(serverHasSelection){
          setScope(prev=>({
            ...prev,
            projectId:typeof c.project_id==='string'&&c.project_id?c.project_id:undefined,
            branchId:typeof c.branch_id==='string'&&c.branch_id?c.branch_id:undefined,
            restaurantId:typeof c.restaurant_id==='string'&&c.restaurant_id?c.restaurant_id:undefined,
            departmentId:typeof c.department_id==='string'&&c.department_id?c.department_id:undefined,
          }));
        }
      } catch { /* API недоступен — сохраняем текущий локальный контекст; доступ проверяет сервер */ }
    };
    void initialize();
    const onChange=()=>setScope(readSaved(key));
    window.addEventListener(EVT,onChange);
    window.addEventListener('storage',onChange);
    return()=>{
      cancelled=true;
      window.removeEventListener(EVT,onChange);
      window.removeEventListener('storage',onChange);
    };
  },[key]);

  const update=(next:Scope)=>{
    setScope(next);
    setLoadedFor(key);
    setContextSave({status:'saving',error:''});
    void api.put('/api/b2b/context',{
      restaurant_id:next.restaurantId??null,
      project_id:next.projectId??null,
      branch_id:next.branchId??null,
      department_id:next.departmentId??null,
    }).then(()=>{
      try{if(key)localStorage.setItem(key,JSON.stringify(next));}catch{/* приватный режим */}
      setContextSave({status:'saved',error:''});
      window.dispatchEvent(new Event(EVT));
    }).catch((error:unknown)=>{
      const message=error instanceof Error?error.message:'Не удалось сохранить рабочий контекст.';
      setContextSave({status:'error',error:message});
    });
  };

  useEffect(()=>{
    if(!key||loadedFor!==key)return;
    try{localStorage.setItem(key,JSON.stringify(scope));}catch{/* приватный режим */}
  },[scopeKey(scope),key,loadedFor]);

  return [scope,update,contextSave];
}

export {hasScopeId} from './scope';
