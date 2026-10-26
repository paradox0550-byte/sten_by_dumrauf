import { useEffect, useState } from 'react';
import { BellRing, CalendarDays, CheckCircle2, Link2, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import { api } from '../../lib/api';

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};
type GoogleCalendarList = { items?: GoogleCalendarEvent[]; error?: { message?: string } };
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SYNC_WINDOW_DAYS = 90;
const markerForGoogle = (id: string) => `[STEN-GCAL:${id}]`;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google OAuth недоступен.')), { once: true });
    script.addEventListener('error', () => reject(new Error('Не удалось загрузить авторизацию Google.')), { once: true });
    if (!existing) {
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

async function googleRequest<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json() as { error?: { message?: string } }).error?.message || ''; } catch { /* Google may return a non-JSON error. */ }
    if (response.status === 401) throw new Error('Доступ Google истёк. Подключите календарь повторно.');
    if (response.status === 403) throw new Error('Google Calendar API или разрешение календаря не включены для этого OAuth-клиента.');
    throw new Error(detail || `Google Calendar вернул ошибку (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function eventDate(event: GoogleCalendarEvent): string | null {
  const value = event.start?.dateTime;
  if (value) return new Date(value).toISOString();
  if (event.start?.date) return new Date(`${event.start.date}T09:00:00`).toISOString();
  return null;
}

function eventEnd(event: GoogleCalendarEvent, start: string): string {
  const value = event.end?.dateTime;
  if (value) return new Date(value).toISOString();
  if (event.end?.date) return new Date(`${event.end.date}T09:30:00`).toISOString();
  return new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
}

export default function GoogleCalendarIntegration() {
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const [token, setToken] = useState('');
  const [connectedEmail, setConnectedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<{ connection: { settings?: Record<string, unknown>; lastSyncAt?: string | null } | null }>('/api/integrations/google/calendar')
      .then((result) => {
        if (!active || !result.connection) return;
        const saved = result.connection;
        if (typeof saved.settings?.connectedEmail === 'string') setConnectedEmail(saved.settings.connectedEmail);
        if (typeof saved.lastSyncAt === 'string') setLastSync(new Date(saved.lastSyncAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }));
        setNotice('Настройки календаря восстановлены из аккаунта STEN. Для синхронизации потребуется авторизация Google.');
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить настройки календаря.');
      })
      .finally(() => { if (active) setSettingsLoaded(true); });
    return () => { active = false; };
  }, []);

  const authorize = async (): Promise<string> => {
    if (token) return token;
    if (!clientId) throw new Error('Не настроен VITE_GOOGLE_CLIENT_ID. Используется тот же OAuth-клиент, что и для Google Таблиц.');
    await loadGoogleScript();
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) throw new Error('Не удалось запустить авторизацию Google.');
    const accessToken = await new Promise<string>((resolve, reject) => {
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: CALENDAR_SCOPE,
        callback: (response) => response.access_token
          ? resolve(response.access_token)
          : reject(new Error(response.error_description || response.error || 'Google не выдал доступ к календарю.')),
        error_callback: (failure) => reject(new Error(failure.message || 'Окно авторизации Google закрыто или заблокировано.')),
      });
      client.requestAccessToken({ prompt: 'consent' });
    });
    setToken(accessToken);
    return accessToken;
  };

  const listGoogleEvents = async (accessToken: string): Promise<GoogleCalendarEvent[]> => {
    const now = new Date();
    const end = new Date(now.getTime() + SYNC_WINDOW_DAYS * 86400_000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    const result = await googleRequest<GoogleCalendarList>(accessToken, `${CALENDAR_API}?${params}`);
    return (result.items || []).filter((item) => item.id && item.status !== 'cancelled');
  };

  const sync = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const accessToken = await authorize();
      const [googleEvents, internalResponse] = await Promise.all([
        listGoogleEvents(accessToken),
        api.get<any>('/api/secretary/events?from=' + encodeURIComponent(new Date().toISOString()) + '&to=' + encodeURIComponent(new Date(Date.now() + SYNC_WINDOW_DAYS * 86400_000).toISOString())),
      ]);
      const internalEvents = (internalResponse?.events || []) as Array<{
        id: string; title: string; description?: string; start_at: string; end_at?: string; status?: string;
      }>;
      let imported = 0;
      let exported = 0;
      let updated = 0;
      let skipped = 0;
      const googleByStenId = new Map<string, GoogleCalendarEvent>();
      for (const event of googleEvents) {
        const stenId = event.extendedProperties?.private?.stenEventId;
        if (stenId) googleByStenId.set(stenId, event);
      }

      for (const event of internalEvents) {
        // Google-originated events carry their Google ID marker; do not export them back as new STEN events.
        if (event.description?.includes('[STEN-GCAL:') && event.description.includes(']')) { skipped++; continue; }
        if (!event.id || !event.title || !event.start_at) { skipped++; continue; }
        const start = new Date(event.start_at);
        if (!Number.isFinite(start.getTime())) { skipped++; continue; }
        const end = event.end_at && Number.isFinite(new Date(event.end_at).getTime())
          ? new Date(event.end_at).toISOString()
          : new Date(start.getTime() + 30 * 60_000).toISOString();
        const existing = googleByStenId.get(event.id);
        const body = {
          summary: event.title,
          description: event.description || '',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          extendedProperties: { private: { stenEventId: event.id } },
        };
        if (existing?.id) {
          await googleRequest<GoogleCalendarEvent>(accessToken, `${CALENDAR_API}/${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
          updated++;
        } else {
          const created = await googleRequest<GoogleCalendarEvent>(accessToken, CALENDAR_API, { method: 'POST', body: JSON.stringify(body) });
          exported++;
        }
      }

      for (const event of googleEvents) {
        if (!event.id || event.extendedProperties?.private?.stenEventId) { skipped++; continue; }
        const start = eventDate(event);
        if (!start || !event.summary?.trim()) { skipped++; continue; }
        if (internalEvents.some((item) => item.description?.includes(markerForGoogle(event.id)))) { skipped++; continue; }
        const description = [event.description?.trim(), markerForGoogle(event.id)].filter(Boolean).join('\n\n');
        await api.post('/api/secretary/events', {
          title: event.summary.trim().normalize('NFC'),
          description,
          start_at: start,
          end_at: eventEnd(event, start),
          event_type: 'meeting',
          status: 'planned',
          reminder_minutes: 30,
        });
        imported++;
      }
      const nowIso = new Date().toISOString();
      const calendarLabel = 'Google Calendar · основной календарь';
      await api.put('/api/integrations/google/calendar', { settings: {
        connectedEmail: calendarLabel,
        syncWindowDays: SYNC_WINDOW_DAYS,
      } });
      await api.patch('/api/integrations/google/calendar/sync-status', { lastSyncAt: nowIso });
      const timestamp = new Date(nowIso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
      setLastSync(timestamp);
      setConnectedEmail(calendarLabel);
      setNotice(`Синхронизация завершена: из Google в STEN — ${imported}, из STEN в Google — ${exported}, обновлено — ${updated}, пропущено — ${skipped}. Период: ближайшие ${SYNC_WINDOW_DAYS} дней.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось синхронизировать календарь.');
    } finally {
      setBusy(false);
    }
  };

  const testBrowserNotification = async () => {
    setError('');
    setNotice('');
    if (!('Notification' in window)) {
      setError('Этот браузер не поддерживает уведомления. Google Calendar может показывать напоминания в своём приложении.');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setError('Разрешение на уведомления не выдано. Разрешите уведомления для STEN в настройках браузера и повторите тест.');
      return;
    }
    new Notification('STEN · проверка уведомлений', { body: 'Тестовое уведомление браузера доставлено.' });
    setNotice('Тестовое уведомление браузера отправлено. Это не подтверждает доставку будущих напоминаний Google Calendar.');
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.delete('/api/integrations/google/calendar');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось отключить календарь в аккаунте.');
      setBusy(false);
      return;
    }
    setToken('');
    setConnectedEmail('');
    setError('');
    setLastSync('');
    setNotice('Настройки календаря удалены из аккаунта STEN. Токен удалён из памяти страницы; для полного отзыва доступа используйте настройки аккаунта Google.');
    setBusy(false);
  };

  return (
    <section className="panel" id="settings-google-calendar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CalendarDays size={21} aria-hidden="true" />
        <div>
          <h2 style={{ marginBottom: 4 }}>Google Календарь</h2>
          <p className="muted" style={{ margin: 0 }}>Двусторонняя синхронизация событий на ближайшие 90 дней по команде пользователя. Настройки сохраняются в аккаунте STEN. События STEN создаются или обновляются в основном календаре Google; новые события Google добавляются в «Секретарь». Фоновой синхронизации пока нет.</p>
        </div>
      </div>
      {connectedEmail && <p className="muted" style={{ margin: '12px 0 0' }}><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {connectedEmail}{lastSync ? ` · Последняя синхронизация: ${lastSync}` : ''}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="primary-button" type="button" disabled={busy || !settingsLoaded} onClick={() => void sync()}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : token ? <RefreshCw size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {busy ? 'Синхронизируем…' : token ? 'Синхронизировать сейчас' : 'Подключить и синхронизировать'}
        </button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void testBrowserNotification()}><BellRing size={16} /> Проверить уведомление браузера</button>
        {token && <button className="secondary-button" type="button" disabled={busy} onClick={disconnect}><Unplug size={16} /> Отключить</button>}
      </div>
      {error && <div className="pnl-message error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="pnl-message ok" role="status" style={{ marginTop: 12 }}>{notice}</div>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Напоминания Google создаются с popup за 30 минут. Их фактическая доставка зависит от настроек Google Calendar, устройства и разрешений браузера. Синхронизация не удаляет события. Для повторной синхронизации не создаются дубликаты: используется ID события STEN в Google и маркер исходного события Google в описании STEN.</p>
    </section>
  );
}
