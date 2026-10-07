export const AUTH_EXPIRED_EVENT='sten-auth-expired';
export class ApiError extends Error{constructor(message:string,public status:number,public code='UNKNOWN_ERROR',public requestId?:string){super(message);this.name='ApiError'}}
function baseUrl(){return String(import.meta.env.VITE_API_URL||'').trim().replace(/\/$/,'')}
function token(){try{return localStorage.getItem('sten_token')}catch{return null}}
export function clearSession(){try{localStorage.removeItem('sten_token');localStorage.removeItem('sten_user');localStorage.removeItem('sten_chat_v5');localStorage.removeItem('sten_scope_v5');for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith('sten_chat_v5:')||k?.startsWith('sten_scope_v5:'))localStorage.removeItem(k)}}catch{}}
async function req<T>(method:string,path:string,body?:unknown):Promise<T>{const id=crypto.randomUUID?.()??String(Date.now()),h:Record<string,string>={'Content-Type':'application/json','X-Request-ID':id},t=token(),BASE=baseUrl();if(!BASE)throw new ApiError('Рабочий API не настроен.',0,'API_NOT_CONFIGURED',id);if(t)h.Authorization=`Bearer ${t}`;const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000);try{const r=await fetch(BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:ctrl.signal}),p=await r.json().catch(()=>({}));clearTimeout(timer);if(!r.ok){if(r.status===401&&!path.startsWith('/auth/')){try{localStorage.removeItem('sten_token');localStorage.removeItem('sten_user')}catch{}try{window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))}catch{}}const e=p?.error;throw new ApiError(typeof e==='string'?e:e?.message||`HTTP ${r.status}`,r.status,e?.code||`HTTP_${r.status}`,e?.requestId||id)}return(p?.data??p) as T}catch(e){clearTimeout(timer);if(e instanceof ApiError)throw e;if(e instanceof Error && e.name==='AbortError')throw new ApiError('Превышено время ожидания.',0,'TIMEOUT',id);throw new ApiError('Нет связи с рабочим сервером.',0,'NETWORK_ERROR',id)}}
export const api={get:<T=unknown>(p:string)=>req<T>('GET',p),post:<T=unknown>(p:string,b?:unknown)=>req<T>('POST',p,b),put:<T=unknown>(p:string,b?:unknown)=>req<T>('PUT',p,b),patch:<T=unknown>(p:string,b?:unknown)=>req<T>('PATCH',p,b),delete:<T=unknown>(p:string)=>req<T>('DELETE',p)};

import type { Memory, MemoryCreatePayload, MemoryFilters, MemoryListResponse, MemoryConfidence } from './contracts/memory';

export async function listMemory(filters: MemoryFilters = {}): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.restaurant_id) params.set('restaurant_id', filters.restaurant_id);
  if (filters.since) params.set('since', filters.since);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.confidence) params.set('confidence', filters.confidence);
  const query = params.toString();
  return api.get<MemoryListResponse>('/api/ai/memory' + (query ? '?' + query : ''));
}

export async function createMemory(data: MemoryCreatePayload): Promise<Memory> {
  const response = await api.post<{ memory: Memory }>('/api/ai/memory', data);
  return response.memory;
}

export async function updateMemoryConfidence(id: string, confidence: Extract<MemoryConfidence, 'confirmed' | 'rejected'>): Promise<Memory> {
  const response = await api.patch<{ memory: Memory }>('/api/ai/memory/' + encodeURIComponent(id), { confidence });
  return response.memory;
}

export async function deleteMemory(id: string): Promise<void> {
  await api.delete('/api/ai/memory/' + encodeURIComponent(id));
}
