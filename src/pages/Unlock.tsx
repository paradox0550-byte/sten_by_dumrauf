import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, KeyRound, WifiOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';
import { useNavigate } from 'react-router-dom';

const CODE_LENGTH = 4;

export default function Unlock() {
  const { unlock, user, loading } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [shake, setShake] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && user) nav('/dashboard', { replace: true });
  }, [loading, user, nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || loading) return;
    setError('');
    setOffline(false);
    try {
      await unlock(code);
      nav('/dashboard');
    } catch (e) {
      const isOffline = e instanceof ApiError && e.status === 0;
      setOffline(isOffline);
      
      // Извлекаем количество оставшихся попыток из ошибки
      const errorMsg = e instanceof ApiError ? e.message : 'Неверный код доступа';
      setError(errorMsg);
      
      // Парсим количество попыток из сообщения (если backend возвращает)
      const match = errorMsg.match(/(\d+)/);
      if (match) {
        setAttemptsLeft(parseInt(match[1]));
      } else {
        setAttemptsLeft(null);
      }
      
      setShake(true);
      setCode('');
      setTimeout(() => setShake(false), 360);
    }
  }

  return (
    <main className="unlock">
      <section className={'unlock-card ' + (shake ? 'shake' : '')}>
        <button className="modal-close" onClick={() => setCode('')} aria-label="Очистить">
          <X />
        </button>
        <div className="unlock-icon">
          <KeyRound size={22} />
        </div>
        <small>STEN — PERSONAL WORKSPACE</small>
        <h1>Вход</h1>
        <strong>Персональный код доступа</strong>
        <p>
          Нет email и паролей. Ваш код хранится только на сервере; 
          JWT выдаётся после успешной проверки.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="unlock-code">Введите код из 4 цифр</label>
          <input
            id="unlock-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            type="password"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            placeholder="••••"
          />
          {error && (
            <div className="error">
              {offline && <WifiOff size={15} />}
              {error}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  (осталось попыток: {attemptsLeft})
                </span>
              )}
            </div>
          )}
          <button
            className="primary-button wide"
            disabled={loading || code.length !== CODE_LENGTH}
          >
            {loading ? 'Проверка...' : 'Открыть STEN'}
            <ArrowRight size={17} />
          </button>
        </form>
        <small className="unlock-note">
          Код генерируется администратором и передаётся лично. 
          После 5 неудачных попыток доступ блокируется на 30 минут.
        </small>
      </section>
    </main>
  );
}