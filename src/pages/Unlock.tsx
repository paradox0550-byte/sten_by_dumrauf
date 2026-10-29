import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, api } from '../lib/api';
import { StenLogo } from '../components/brand/StenLogo';
import LegalFooter from '../components/LegalFooter';
import './LoginPage.css';

type AuthResult = { token: string; user: { id: string; email?: string; [key: string]: unknown } };

function LoginSpinner() {
  return <span className="login-spinner" aria-hidden="true" />;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || (error.status === 401 ? 'Неверный код доступа' : 'Не удалось выполнить вход. Повторите попытку');
  }
  return 'Не удалось выполнить вход. Повторите попытку';
}

export default function AuthSetup() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!busy) fields.current[0]?.focus();
  }, [busy]);

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
      successTimer.current = setTimeout(() => navigate('/', { replace: true }), 700);
    } catch (error) {
      setDigits(['', '', '', '']);
      setErr(messageFor(error));
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

  if (user) return <Navigate to="/" replace />;

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="auth-title">
        <header className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <StenLogo variant="mark" size={88} animated aria-label="STEN" />
          </div>
          <div className="login-brand-name">STEN</div>
          <p className="login-brand-caption">Управление ресторанным бизнесом</p>
        </header>

        <div className="login-heading">
          <h1 id="auth-title">Вход в STEN</h1>
          <p>Введите четырёхзначный код доступа</p>
        </div>

        <form className="login-form" onSubmit={event => { event.preventDefault(); if (digits.every(Boolean)) void submitCode(digits.join('')); }}>
          <div className="login-code-fields" onPaste={onCodePaste} aria-label="Код доступа из четырёх цифр">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={node => { fields.current[index] = node; }}
                id={`access-code-${index}`}
                aria-label={`Цифра ${index + 1}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={4}
                value={digit}
                disabled={busy}
                aria-invalid={Boolean(err)}
                onChange={event => updateDigit(index, event.target.value)}
                onKeyDown={event => onCodeKeyDown(index, event)}
              />
            ))}
          </div>

          <button className="login-submit" type="submit" disabled={busy || digits.some(digit => !digit)}>
            {busy ? <><LoginSpinner />Проверяем код…</> : success ? 'Вход выполнен' : 'Войти'}
          </button>
        </form>

        {err && <p className="login-error" role="alert">{err}</p>}
        <LegalFooter />
      </section>
    </main>
  );
}
