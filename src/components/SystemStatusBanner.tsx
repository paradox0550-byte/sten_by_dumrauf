import { useEffect, useState } from 'react';
import { CheckCircle2, CloudAlert, WifiOff, X } from 'lucide-react';
import './system-status-banner.css';

type Status = 'offline' | 'service' | 'restored' | null;
const SERVICE_EVENT = 'sten-service-unavailable';
const RESTORED_EVENT = 'sten-service-restored';

export default function SystemStatusBanner() {
  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : null
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onOffline = () => { setStatus('offline'); setDismissed(false); };
    const onOnline = () => {
      setStatus(current => current === 'offline' ? 'restored' : current);
      setDismissed(false);
    };
    const onServiceUnavailable = () => { setStatus('service'); setDismissed(false); };
    const onServiceRestored = () => {
      setStatus(current => current === 'service' ? 'restored' : current);
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener(SERVICE_EVENT, onServiceUnavailable);
    window.addEventListener(RESTORED_EVENT, onServiceRestored);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(SERVICE_EVENT, onServiceUnavailable);
      window.removeEventListener(RESTORED_EVENT, onServiceRestored);
    };
  }, []);

  useEffect(() => {
    if (status !== 'restored') return;
    const timer = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!status || dismissed) return null;

  const copy = {
    offline: {
      icon: <WifiOff size={18} aria-hidden="true" />,
      title: 'Нет подключения к интернету',
      detail: 'Проверьте сеть. Введённые данные останутся на экране.',
      className: 'sten-system-status--offline',
    },
    service: {
      icon: <CloudAlert size={18} aria-hidden="true" />,
      title: 'STEN временно не может связаться с сервисом',
      detail: 'Это может быть временный сетевой сбой. Повторите действие чуть позже.',
      className: 'sten-system-status--service',
    },
    restored: {
      icon: <CheckCircle2 size={18} aria-hidden="true" />,
      title: 'Соединение восстановлено',
      detail: '',
      className: 'sten-system-status--restored',
    },
  }[status];

  return (
    <div className={`sten-system-status ${copy.className}`} role="status" aria-live="polite">
      <span className="sten-system-status__icon">{copy.icon}</span>
      <div className="sten-system-status__copy">
        <strong>{copy.title}</strong>
        {copy.detail && <span>{copy.detail}</span>}
      </div>
      <button
        className="sten-system-status__close"
        type="button"
        aria-label="Скрыть уведомление"
        onClick={() => setDismissed(true)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
