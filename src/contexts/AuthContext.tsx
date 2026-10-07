import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {api,clearSession,AUTH_EXPIRED_EVENT} from '../lib/api';

export type User={id:string;email?:string;firstName?:string;lastName?:string;position?:string;telegramChatId?:string;role?:string;organizationId?:string|null;permissions?:Record<string,string>};
type Ctx={user:User|null;loading:boolean;signOut:()=>void;login:(email:string,password:string)=>Promise<void>;refresh:()=>Promise<void>};
const C=createContext<Ctx|null>(null), USER='sten_user',TOKEN='sten_token';

export function AuthProvider({children}:{children:React.ReactNode}){
  const[user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);
  const restore=useCallback(async()=>{
    const t=localStorage.getItem(TOKEN);
    if(!t){setUser(null);setLoading(false);return}
    try{
      const r=await api.get<{user:User}>('/auth/me');
      setUser(r.user);
      localStorage.setItem(USER,JSON.stringify(r.user));
    }catch{
      clearSession();
      setUser(null);
    }finally{setLoading(false)}
  },[]);
  const refresh=useCallback(async()=>{try{const r=await api.get<{user:User}>('/auth/me');setUser(r.user);localStorage.setItem(USER,JSON.stringify(r.user))}catch{}},[]);
  useEffect(()=>{void restore()},[restore]);
  useEffect(()=>{
    const handler=()=>{
      try{clearSession();localStorage.removeItem('sten_user')}catch{}
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT,handler);
    return ()=>window.removeEventListener(AUTH_EXPIRED_EVENT,handler);
  },[]);
  // TODO: сохранять returnPath и возвращать пользователя после re-login
  const signOut=useCallback(()=>{clearSession();localStorage.removeItem(USER);setUser(null)},[]);
  const login=useCallback(async(email:string,password:string)=>{
    const r=await api.post<{token:string;user:User}>('/auth/login',{email,password});
    localStorage.setItem(TOKEN,r.token);
    localStorage.setItem(USER,JSON.stringify(r.user));
    setUser(r.user);
  },[]);
  return <C.Provider value={useMemo(()=>({user,loading,signOut,login,refresh}),[user,loading,signOut,login,refresh])}>{children}</C.Provider>
}
export function useAuth(){const c=useContext(C);if(!c)throw new Error('AuthProvider is missing');return c}
