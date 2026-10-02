import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {api,ApiError,clearSession} from '../lib/api';
export type User={id:string;email?:string;firstName?:string;lastName?:string;role?:string;organizationId?:string|null;permissions?:Record<string,string>};
type Ctx={user:User|null;loading:boolean;unlock:(code:string)=>Promise<User>;signOut:()=>void};
const C=createContext<Ctx|null>(null), USER='sten_user',TOKEN='sten_token';
export function AuthProvider({children}:{children:React.ReactNode}){const[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);
const restore=useCallback(async()=>{const t=localStorage.getItem(TOKEN);if(!t){setUser(null);setLoading(false);return}try{const r=await api.get<{user:User}>('/auth/me');setUser(r.user);localStorage.setItem(USER,JSON.stringify(r.user))}catch(e){clearSession();setUser(null)}finally{setLoading(false)}},[]);
useEffect(()=>{void restore()},[restore]);
const unlock=useCallback(async(code:string)=>{const r=await api.post<{token:string;user:User}>('/auth/unlock',{code});if(!r.token||!r.user)throw new ApiError('Сервер не вернул действительную сессию.',502,'INVALID_AUTH_RESPONSE');localStorage.setItem(TOKEN,r.token);localStorage.setItem(USER,JSON.stringify(r.user));setUser(r.user);return r.user},[]);
const signOut=useCallback(()=>{clearSession();localStorage.removeItem(USER);setUser(null)},[]);
return <C.Provider value={useMemo(()=>({user,loading,unlock,signOut}),[user,loading,unlock,signOut])}>{children}</C.Provider>}
export function useAuth(){const c=useContext(C);if(!c)throw new Error('AuthProvider is missing');return c}