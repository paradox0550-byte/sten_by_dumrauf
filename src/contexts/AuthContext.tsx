import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {api,clearSession} from '../lib/api';

export type User={id:string;email?:string;firstName?:string;lastName?:string;role?:string;organizationId?:string|null;permissions?:Record<string,string>};
type Ctx={user:User|null;loading:boolean;signOut:()=>void};
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
  useEffect(()=>{void restore()},[restore]);
  const signOut=useCallback(()=>{clearSession();localStorage.removeItem(USER);setUser(null)},[]);
  return <C.Provider value={useMemo(()=>({user,loading,signOut}),[user,loading,signOut])}>{children}</C.Provider>
}
export function useAuth(){const c=useContext(C);if(!c)throw new Error('AuthProvider is missing');return c}
