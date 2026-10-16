import { FormEvent, KeyboardEvent, ClipboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, api } from '../lib/api';
import { StenLogo } from '../components/brand/StenLogo';
import LegalFooter from '../components/LegalFooter';
import './LoginPage.css';

type Mode = 'code' | 'email';
type AuthResult = { token: string; user: { id: string; email?: string; [key: string]: unknown } };

function LoginSpinner() {
  return <span className="login-spinner" aria-hidden="true" />;
}

function messageFor(error: unknown, mode: Mode): string {
  if (error instanceof ApiError) {
    return error.message || (error.status === 401 ? (mode === 'code' ? 'Неверный код' : 'Неверный email или пароль') : 'Не удалось выполнить вход. Повторите попытку');
  }
  return 'Не удалось выполнить вход. Повторите попытку';
}

export default function AuthSetup() {
  const { user, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('code');
  const [digits, setDigits] = useState(['', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === 'code' && !busy) fields.current[0]?.focus();
  }, [mode, busy]);

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  const submitCode = useCallback(async (code: string) => {
    if (busy || code.length !== 4) return;
    setErr(null);
    setBusy(true);
    try {
      const result = await api.post<AuthResult>('/auth/unlock', { code });
      if (!result?.token) throw new Error('Сервер не вернул токен сессии');
      localStorage.setItem('token', result.token);
      if (result.user) localStorage.setItem('sten_user', JSON.stringify(result.user));
      setSuccess(true);
      await refresh();
      successTimer.current = setTimeout(() => navigate('/', { replace: true }), 1000);
    } catch (error) {
      setDigits(['', '', '', '']);
      setErr(messageFor(error, 'code'));
      requestAnimationFrame(() => fields.current[0]?.focus());
    } finally {
      setBusy(false);
    }
  }, [busy, navigate, refresh]);

  function updateDigit(index: number, raw: string) {
    if (busy) return;
    const numeric = raw.replace(/\D/g, '');
    if (!numeric) {
      setDigits(current => current.map((digit, i) => i === index ? '' : digit));
      return;
    }
    const next = [...digits];
    const chars = numeric.slice(-4).split('');
    chars.forEach((char, offset) => {
      if (index + offset < 4) next[index + offset] = char;
    });
    setDigits(next);
    setErr(null);
    const target = Math.min(index + chars.length, 3);
    requestAnimationFrame(() => fields.current[next.every(Boolean) ? 3 : target]?.focus());
    if (next.every(Boolean)) void submitCode(next.join(''));
  }

  function onCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      fields.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      fields.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < 3) {
      fields.current[index + 1]?.focus();
    }
  }

  function onCodePaste(event: ClipboardEvent<HTMLDivElement>) {
    const value = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!value) return;
    event.preventDefault();
    const next = [...value.split(''), '', '', ''].slice(0, 4);
    setDigits(next);
    setErr(null);
    if (value.length === 4) void submitCode(value);
    else requestAnimationFrame(() => fields.current[value.length]?.focus());
  }

  async function onEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      setSuccess(true);
      successTimer.current = setTimeout(() => navigate('/', { replace: true }), 1000);
    } catch (error) {
      setErr(messageFor(error, 'email'));
    } finally {
      setBusy(false);
    }
  }

  if (user) return <Navigate to="/" replace />;

  return (
    <main className="login-screen">
      <aside className="login-brand-panel" aria-label="О STEN">
        <div className="login-brand-lockup">
          <StenLogo variant="mark" size={32} aria-label="STEN" />
          <div><strong>STEN</strong><span>Операционная система ресторанного бизнеса</span></div>
        </div>
        <div className="login-brand-message">
          <span className="login-kicker">УПРАВЛЕНИЕ · АНАЛИТИКА · РЕШЕНИЯ</span>
          <h2>Ресторанный бизнес.<br />Под контролем.</h2>
          <p>Финансы и операционные показатели в одном рабочем пространстве.</p>
        </div>
        <div className="login-brand-copyright">2026 · Думрауф А.С.</div>
      </aside>

      <section className="login-form-panel" aria-labelledby="auth-title">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <StenLogo variant="mark" size={32} aria-label="STEN" />
            <strong>STEN</strong>
          </div>
          <header className="login-heading">
            <span className="login-kicker">РАБОЧИЙ КОНТУР</span>
            <h1 id="auth-title">Вход</h1>
            <p>Введите код или войдите по email</p>
          </header>

          <div className="login-tabs" role="tablist" aria-label="Способ входа">
            <button type="button" role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'is-active' : ''} onClick={() => { setMode('code'); setErr(null); }} disabled={busy}>Код доступа</button>
            <button type="button" role="tab" aria-selected={mode === 'email'} className={mode === 'email' ? 'is-active' : ''} onClick={() => { setMode('email'); setErr(null); }} disabled={busy}>Email и пароль</button>
          </div>

          {mode === 'code' ? (
            <form className="login-form" onSubmit={event => { event.preventDefault(); if (digits.every(Boolean)) void submitCode(digits.join('')); }}>
              <label className="login-field-label" htmlFor="access-code-0">Четырёхзначный код доступа</label>
              <div className="login-code-fields" onPaste={onCodePaste} aria-label="Код доступа из четырёх цифр">
                {digits.map((digit, index) => (
                  <input key={index} ref={node => { fields.current[index] = node; }} id={`access-code-${index}`} aria-label={`Цифра ${index + 1}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={4} value={digit} disabled={busy} aria-invalid={Boolean(err)} onChange={event => updateDigit(index, event.target.value)} onKeyDown={event => onCodeKeyDown(index, event)} />
                ))}
              </div>
              <button className="login-submit" type="submit" disabled={busy || digits.some(digit => !digit)}>
                {busy ? <><LoginSpinner />Проверяем код…</> : success ? '✓ Вход выполнен' : 'Войти'}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={onEmailSubmit}>
              <label className="login-field">
                <span>Email</span>
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" disabled={busy} />
              </label>
              <label className="login-field">
                <span>Пароль</span>
                <span className="login-password-wrap">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" disabled={busy} />
                  <button type="button" className="login-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} disabled={busy}>{showPassword ? 'Скрыть' : 'Показать'}</button>
                </span>
              </label>
              <button className="login-submit" type="submit" disabled={busy || !email.trim() || !password}>
                {busy ? <><LoginSpinner />Входим…</> : success ? '✓ Вход выполнен' : 'Войти'}
              </button>
            </form>
          )}

          {err && <p className="login-error" role="alert">{err}</p>}
          <LegalFooter />
        </div>
      </section>
    </main>
  );
}
