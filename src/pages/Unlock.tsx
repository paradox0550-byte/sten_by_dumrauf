import {useState,FormEvent} from 'react';
import {useAuth} from '../contexts/AuthContext';
import {ApiError} from '../lib/api';

export default function AuthSetup(){
  const {user,login}=useAuth();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState<string|null>(null);

  async function onSubmit(e:FormEvent){
    e.preventDefault();
    if(busy)return;
    setErr(null);
    setBusy(true);
    try{
      await login(email.trim(),password);
    }catch(e){
      const msg=e instanceof ApiError?e.message:(e instanceof Error?e.message:'Не удалось войти');
      setErr(msg);
    }finally{setBusy(false)}
  }

  if(user){
    return (
      <main className="unlock">
        <section className="unlock-card">
          <small>STEN — AUTHENTICATION</small>
          <h1>Сессия активна</h1>
          <p>Вы вошли как {user.email||user.firstName||user.id}.</p>
        </section>
      </main>
    );
  }

  const inputStyle:React.CSSProperties={padding:'10px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:14,width:'100%',boxSizing:'border-box'};
  const labelStyle:React.CSSProperties={display:'flex',flexDirection:'column',gap:6,fontSize:12,color:'var(--text-secondary)'};

  return (
    <main className="unlock">
      <section className="unlock-card">
        <div className="auth-brand"><img src="./brand/sten-lockup.svg" alt="STEN — Smart Tracking &amp; Economic Navigator" /></div>
        <small>STEN — AUTHENTICATION</small>
        <h1>Вход в рабочий контур</h1>
        <form onSubmit={onSubmit} style={{display:'flex',flexDirection:'column',gap:14,marginTop:18}}>
          <label style={labelStyle}>
            Email
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              disabled={busy}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Пароль
            <input
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={busy}
              style={inputStyle}
            />
          </label>
          {err && <p style={{color:'var(--color-danger)',fontSize:12,margin:0}}>{err}</p>}
          <button
            type="submit"
            disabled={busy||!email||!password}
            style={{padding:'10px 16px',borderRadius:8,border:'1px solid var(--color-brand)',background:'var(--color-brand)',color:'#fff',fontWeight:600,cursor:busy?'wait':'pointer',fontSize:14}}
          >
            {busy?'Вход…':'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
