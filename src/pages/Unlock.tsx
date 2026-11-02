import { useState, type FormEvent } from 'react';
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
      <section className="login-card" aria-labelledby="auth-title">
        <header className="login-brand">
          <div className="login-logo"><StenLogo variant="mark" size={88} aria-label="STEN" /></div>
          <div className="login-brand-name">STEN</div>
          <p className="login-brand-caption">Управление ресторанным бизнесом</p>
        </header>

        <div className="login-heading">
          <h1 id="auth-title">Вход в STEN</h1>
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
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={busy}
              required
            />
          </label>
          <button className="login-submit" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? <><LoginSpinner />Входим…</> : 'Войти'}
          </button>
        </form>

        {error && <p className="login-error" role="alert">{error}</p>}
        <LegalFooter />
      </section>
    </main>
  );
}
