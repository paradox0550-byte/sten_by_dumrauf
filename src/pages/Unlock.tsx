import {useState,FormEvent} from 'react';
import {useNavigate} from 'react-router-dom';
import {Navigate} from 'react-router-dom';
import {useAuth} from '../contexts/AuthContext';
import {ApiError} from '../lib/api';
import {StenLogo} from '../components/brand/StenLogo';

function LoginSpinner(){return <svg className="login-spinner" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="2"/><circle cx="9" cy="9" r="7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="11 33"><animateTransform attributeName="transform" type="rotate" from="0 9 9" to="360 9 9" dur=".7s" repeatCount="indefinite"/></circle></svg>}

export default function AuthSetup(){
  const {user,login}=useAuth();
  const navigate=useNavigate();
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
      navigate('/sten',{replace:true});
    }catch(e){
      const msg=e instanceof ApiError?e.message:(e instanceof Error?e.message:'Не удалось войти');
      setErr(msg);
    }finally{setBusy(false)}
  }

  if(user) return <Navigate to="/sten" replace/>;

  return (
    <main className="unlock">
      <section className="unlock-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <StenLogo
            variant="lockup"
            size={220}
            aria-label="STEN — Smart Tracking &amp; Economic Navigator"
          />
        </div>

        <div className="auth-heading">
          <span className="auth-eyebrow">Рабочий контур</span>
          <h1 id="auth-title">Вход в STEN</h1>
          <p>Управление ресторанным бизнесом в одном рабочем пространстве.</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              autoFocus
              disabled={busy}
              aria-invalid={Boolean(err)}
            />
          </label>

          <label className="auth-field">
            <span>Пароль</span>
            <input
              id="auth-password"
              name="password"
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              required
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={Boolean(err)}
            />
          </label>

          {err && <p className="auth-error" role="alert">{err}</p>}

          <button
            className="auth-submit"
            type="submit"
            disabled={busy||!email||!password}
          >
            {busy?<><LoginSpinner/>Вход…</>:'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
