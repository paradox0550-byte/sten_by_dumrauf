import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';
import { StenLogo } from '../components/brand/StenLogo';
import LegalFooter from '../components/LegalFooter';
import './LoginPage.css';

function LoginSpinner() {
  return <span className="login-spinner" aria-hidden="true" />;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Неверный email или пароль.';
    if (error.status === 429) return 'Слишком много попыток. Попробуйте позже.';
    return error.message || 'Не удалось выполнить вход. Повторите попытку.';
  }
  return 'Не удалось выполнить вход. Повторите попытку.';
}

export default function AuthSetup() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Введите email и пароль.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(normalizedEmail, password);
      navigate('/sten', { replace: true });
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  if (user) return <Navigate to="/sten" replace />;

  return (
    <main className="login-screen">
      <aside className="login-story" aria-label="Dumrauf — Calm Intelligence">
        <div className="login-story__brand">
          <StenLogo variant="mark" size={42} aria-label="Dumrauf" />
          <span>DUMRAUF</span>
        </div>
        <div className="login-story__copy">
          <span className="login-story__eyebrow">CALM INTELLIGENCE</span>
          <h2>Умный контроль вашего ресторана.</h2>
          <p>Аналитика, AI и решения — в одном рабочем пространстве руководителя.</p>
        </div>
        <div className="login-story__footer">CONTROL ROOM <span>·</span> RESTAURANT BUSINESS</div>
      </aside>
      <section className="login-card" aria-labelledby="auth-title">
        <header className="login-brand">
          <div className="login-logo"><StenLogo variant="mark" size={88} aria-label="Dumrauf" /></div>
          <div className="login-brand-name">DUMRAUF</div>
          <p className="login-brand-caption">CALM INTELLIGENCE · Управление ресторанным бизнесом</p>
        </header>

        <div className="login-heading">
          <h1 id="auth-title">Вход в рабочее пространство</h1>
          <p>Войдите с помощью email и пароля</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@company.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              disabled={busy}
              required
            />
          </label>
          <label className="login-field">
            <span>Пароль</span>
            <div className="login-password-control">
              <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Введите пароль" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required />
              <button className="login-password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword} disabled={busy}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          <button className="login-submit" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? <><LoginSpinner />Входим…</> : 'Войти'}
          </button>
          <p className="login-help">Не удаётся войти? <Link to="/legal/contacts">Связаться с поддержкой</Link></p>
        </form>

        {error && <p className="login-error" role="alert">{error}</p>}
        <LegalFooter />
      </section>
    </main>
  );
}
