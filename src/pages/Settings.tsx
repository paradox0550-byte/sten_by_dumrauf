import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import WorkspaceSelector from '../components/WorkspaceSelector';
import { useScope } from '../lib/useScope';
import { useAnalyticsSettings, type AnalyticsSettings } from '../lib/useAnalyticsSettings';
import { normalizeProfileText, TELEGRAM_ID_RE, validateProfilePayload, type ProfileFieldErrors, type ProfileUpdatePayload, type ProfileResponse, type MessengerSettings } from '../lib/contracts/profile';
import { ApiError } from '../lib/api';

type Theme = 'light' | 'dark' | 'system';
type FontSize = '100' | '110' | '120';
type Metrics = {
  revenue: boolean;
  cashCard: boolean;
  discounts: boolean;
  avgCheck: boolean;
  checks: boolean;
  primeCost: boolean;
  ebitda: boolean;
  deviation: boolean;
};

const THEME_KEY = 'sten_theme_v5';
const FONT_SIZE_KEY = 'sten_font_size_v1';
const MOTION_KEY = 'sten_reduce_motion_v1';
const metricDefaults: Metrics = {
  revenue: true,
  cashCard: true,
  discounts: true,
  avgCheck: true,
  checks: true,
  primeCost: true,
  ebitda: true,
  deviation: true,
};

const fontSizeOptions: Array<{ value: FontSize; label: string }> = [
  { value: '100', label: 'Обычный' },
  { value: '110', label: 'Увеличенный' },
  { value: '120', label: 'Крупный' },
];

const applyAppearance = (fontSize: FontSize, reduceMotion: boolean) => {
  document.documentElement.dataset.fontScale = fontSize;
  document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
};

export default function Settings() {
  const { signOut, user, refresh } = useAuth();
  const [scope, setScope, scopeSave] = useScope();
  const [theme, setTheme] = useState<Theme>(() => {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const value = localStorage.getItem(FONT_SIZE_KEY);
    return value === '100' || value === '110' || value === '120' ? value : '100';
  });
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem(MOTION_KEY) === 'true');
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    position: user?.position || '',
    telegramChatId: user?.telegramChatId || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileMessageKind, setProfileMessageKind] = useState<'ok' | 'error'>('ok');
  const [profileErrors, setProfileErrors] = useState<ProfileFieldErrors>({});

  const [sendTime, setSendTime] = useState('21:00');
  const [metrics, setMetrics] = useState<Metrics>(metricDefaults);
  const [messengerMessage, setMessengerMessage] = useState('');
  const [messengerMessageKind, setMessengerMessageKind] = useState<'ok' | 'error'>('ok');
  const [messengerSaving, setMessengerSaving] = useState(false);

  const {
    settings: analytics,
    saving: analyticsSaving,
    error: analyticsError,
    savedAt: analyticsSavedAt,
    save: saveAnalytics,
  } = useAnalyticsSettings();
  const [analyticsDraft, setAnalyticsDraft] = useState<AnalyticsSettings>(analytics);

  useEffect(() => {
    setAnalyticsDraft(analytics);
  }, [analytics]);

  useEffect(() => {
    setProfile({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      position: user?.position || '',
      telegramChatId: user?.telegramChatId || '',
    });
  }, [user?.firstName, user?.lastName, user?.position, user?.telegramChatId]);

  useEffect(() => {
    applyAppearance(fontSize, reduceMotion);
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
    localStorage.setItem(MOTION_KEY, String(reduceMotion));
  }, [fontSize, reduceMotion]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<MessengerSettings>('/api/messenger/settings');
        const settings = response?.settings;
        if (settings) {
          setSendTime(settings.send_time || '21:00');
          setMetrics({ ...metricDefaults, ...(settings.metrics || {}) });
          if (!user?.telegramChatId && settings.telegram_chat_id) {
            setProfile((value) => ({ ...value, telegramChatId: settings.telegram_chat_id }));
          }
        }
      } catch {
        // Optional messenger settings should not block the settings page.
      }
    })();
  }, [user?.telegramChatId]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      const resolved = media.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applySystemTheme();
    media.addEventListener('change', applySystemTheme);
    return () => media.removeEventListener('change', applySystemTheme);
  }, [theme]);

  const setThemeValue = (value: Theme) => {
    setTheme(value);
    localStorage.setItem(THEME_KEY, value);
    const resolved =
      value === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  };

  const setFontSizeValue = (value: FontSize) => {
    setFontSize(value);
  };

  const saveProfile = async () => {
    const payload: ProfileUpdatePayload = {
      firstName: normalizeProfileText(profile.firstName),
      lastName: normalizeProfileText(profile.lastName),
      position: normalizeProfileText(profile.position),
      telegramChatId: normalizeProfileText(profile.telegramChatId) || null,
    };
    setProfile({ ...payload, telegramChatId: payload.telegramChatId ?? '' });
    const validationErrors = validateProfilePayload(payload);
    setProfileErrors(validationErrors);
    setProfileMessage('');
    if (Object.keys(validationErrors).length) return;
    setProfileSaving(true);
    try {
      const response = await api.put<ProfileResponse>('/api/profile', payload);
      if (response?.profile) {
        setProfile({
          firstName: normalizeProfileText(response.profile.firstName ?? ''),
          lastName: normalizeProfileText(response.profile.lastName ?? ''),
          position: normalizeProfileText(response.profile.position ?? ''),
          telegramChatId: normalizeProfileText(response.profile.telegramChatId ?? ''),
        });
      }
      await refresh();
      setProfileErrors({});
      setProfileMessageKind('ok');
      setProfileMessage('Профиль сохранён.');
    } catch (error) {
      setProfileMessageKind('error');
      if (error instanceof ApiError && error.code === 'TELEGRAM_ID_INVALID') {
        setProfileErrors({ telegramChatId: 'Проверьте формат Telegram ID: 5–20 цифр, отрицательный ID допустим.' });
        setProfileMessage('');
      } else if (error instanceof ApiError && error.code === 'PROFILE_INVALID') {
        const details = typeof error.details === 'object' && error.details !== null ? error.details as Record<string, unknown> : {};
        const fieldErrors = typeof details.fields === 'object' && details.fields !== null ? details.fields as Record<string, unknown> : details;
        setProfileErrors({
          ...(typeof fieldErrors.firstName === 'string' ? { firstName: fieldErrors.firstName } : { firstName: 'Проверьте имя (не более 80 символов).' }),
          ...(typeof fieldErrors.lastName === 'string' ? { lastName: fieldErrors.lastName } : { lastName: 'Проверьте фамилию (не более 80 символов).' }),
          ...(typeof fieldErrors.position === 'string' ? { position: fieldErrors.position } : { position: 'Проверьте должность (не более 120 символов).' }),
        });
        setProfileMessage('');
      } else {
        setProfileMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль.');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const saveMessenger = async () => {
    const telegramChatId = normalizeProfileText(profile.telegramChatId) || null;
    if (telegramChatId !== null && !TELEGRAM_ID_RE.test(telegramChatId)) {
      setProfileErrors((current) => ({ ...current, telegramChatId: 'Введите Telegram ID: 5–20 цифр; отрицательное значение допустимо.' }));
      setMessengerMessageKind('error');
      setMessengerMessage('Проверьте Telegram ID в разделе «Профиль».');
      return;
    }
    setProfileErrors((current) => ({ ...current, telegramChatId: undefined }));
    setMessengerSaving(true);
    setMessengerMessage('');
    try {
      await api.post('/api/messenger/settings', {
        provider: 'telegram',
        send_time: sendTime,
        scope: {
          period: scope.period,
          project_id: scope.projectId || '',
          branch_id: scope.branchId || '',
          restaurant_id: scope.restaurantId || '',
          department_id: scope.departmentId || '',
        },
        metrics,
        telegram_chat_id: telegramChatId,
        whatsapp_phone: null,
      });
      setMessengerMessageKind('ok');
      setMessengerMessage('Отчёты сохранены.');
    } catch (error) {
      setMessengerMessageKind('error');
      setMessengerMessage(error instanceof Error ? error.message : 'Не удалось сохранить отчёты.');
    } finally {
      setMessengerSaving(false);
    }
  };

  const toggleMetric = (key: keyof Metrics) => {
    setMetrics((value) => ({ ...value, [key]: !value[key] }));
  };

  const labels: Record<keyof Metrics, string> = {
    revenue: 'Выручка',
    cashCard: 'Наличные и карта',
    discounts: 'Скидки',
    avgCheck: 'Средний чек',
    checks: 'Чеки',
    primeCost: 'Себестоимость',
    ebitda: 'EBITDA',
    deviation: 'Отклонение от плана',
  };

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">МОЙ КАБИНЕТ</span>
          <h1>Настройки</h1>
          <p>Профиль, рабочий контур, внешний вид и отчёты — в одном месте.</p>
        </div>
      </div>

      <nav className="settings-quick-jump" aria-label="Быстрый переход по настройкам">
        <a href="#settings-workspace">Рабочий контур</a>
        <a href="#settings-profile">Профиль</a>
        <a href="#settings-appearance">Внешний вид</a>
        <a href="#settings-reports">Отчёты</a>
        <a href="#settings-analytics">Аналитика</a>
        <a href="#settings-session">Сеанс</a>
      </nav>

      <div className="settings-grid">
        <section className="panel settings-workspace" id="settings-workspace">
          <h2>Рабочий контур</h2>
          <p className="muted">Выберите ресторан, подразделение и период для рабочих данных.</p>
          <WorkspaceSelector value={scope} onChange={setScope} />
          {scopeSave.status === 'saving' && <div className="pnl-message" role="status">Сохраняем рабочий контур…</div>}
          {scopeSave.status === 'saved' && <div className="pnl-message ok" role="status">Рабочий контур сохранён.</div>}
          {scopeSave.status === 'error' && <div className="pnl-message warn" role="alert">Не удалось сохранить рабочий контур. AI временно не отправляет запросы с неподтверждённым контекстом. {scopeSave.error}</div>}
        </section>

        <section className="panel" id="settings-profile">
          <h2>Профиль</h2>
          <p className="muted">Эти данные используются в профиле STEN и для отправки отчётов в Telegram.</p>
          <label className="settings-field">
            <span>Имя</span>
            <input aria-invalid={Boolean(profileErrors.firstName)} maxLength={80} value={profile.firstName} onChange={(event) => { setProfileErrors((errors) => ({ ...errors, firstName: undefined })); setProfile((value) => ({ ...value, firstName: event.target.value.normalize('NFC') })); }} onBlur={() => setProfile((value) => ({ ...value, firstName: normalizeProfileText(value.firstName) }))} placeholder="Александр" />
            {profileErrors.firstName && <small className="field-error" role="alert">{profileErrors.firstName}</small>}
          </label>
          <label className="settings-field">
            <span>Фамилия</span>
            <input aria-invalid={Boolean(profileErrors.lastName)} maxLength={80} value={profile.lastName} onChange={(event) => { setProfileErrors((errors) => ({ ...errors, lastName: undefined })); setProfile((value) => ({ ...value, lastName: event.target.value.normalize('NFC') })); }} onBlur={() => setProfile((value) => ({ ...value, lastName: normalizeProfileText(value.lastName) }))} placeholder="Фамилия" />
            {profileErrors.lastName && <small className="field-error" role="alert">{profileErrors.lastName}</small>}
          </label>
          <label className="settings-field">
            <span>Должность</span>
            <input aria-invalid={Boolean(profileErrors.position)} maxLength={120} value={profile.position} onChange={(event) => { setProfileErrors((errors) => ({ ...errors, position: undefined })); setProfile((value) => ({ ...value, position: event.target.value.normalize('NFC') })); }} onBlur={() => setProfile((value) => ({ ...value, position: normalizeProfileText(value.position) }))} placeholder="Операционный директор" />
            {profileErrors.position && <small className="field-error" role="alert">{profileErrors.position}</small>}
          </label>
          <label className="settings-field">
            <span>Telegram ID</span>
            <input
              inputMode="text"
              aria-invalid={Boolean(profileErrors.telegramChatId)}
              value={profile.telegramChatId}
              onChange={(event) => { setProfileErrors((errors) => ({ ...errors, telegramChatId: undefined })); setProfile((value) => ({ ...value, telegramChatId: event.target.value.normalize('NFC') })); }}
              onBlur={() => setProfile((value) => ({ ...value, telegramChatId: normalizeProfileText(value.telegramChatId) }))}
              placeholder="Например, -123456789"
            />
            {profileErrors.telegramChatId && <small className="field-error" role="alert">{profileErrors.telegramChatId}</small>}
            <small className="muted">Нужен, чтобы STEN мог отправлять Вам отчёты в Telegram.</small>
          </label>
          <button className="primary-button" disabled={profileSaving} onClick={() => void saveProfile()}>
            <Save size={16} />
            {profileSaving ? 'Сохраняем…' : 'Сохранить данные'}
          </button>
          {profileMessage && <div className={`pnl-message ${profileMessageKind}`} role={profileMessageKind === 'error' ? 'alert' : 'status'} aria-live={profileMessageKind === 'error' ? 'assertive' : 'polite'}>{profileMessage}</div>}
        </section>

        <section className="panel" id="settings-appearance">
          <h2>Внешний вид</h2>
          <p className="muted">Настройки сохраняются в этом браузере и не меняют финансовые данные.</p>

          <div className="settings-subsection">
            <span className="settings-label">Тема</span>
            <div className="choice-grid">
              {(['light', 'system', 'dark'] as Theme[]).map((value) => (
                <button key={value} className={'choice ' + (theme === value ? 'active' : '')} onClick={() => setThemeValue(value)}>
                  {value === 'light' ? 'Светлая' : value === 'dark' ? 'Тёмная' : 'Системная'}
                  {theme === value && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-subsection">
            <span className="settings-label">Размер текста</span>
            <div className="choice-grid font-size-choices" role="group" aria-label="Размер текста">
              {fontSizeOptions.map((option) => (
                <button
                  key={option.value}
                  className={'choice ' + (fontSize === option.value ? 'active' : '')}
                  onClick={() => setFontSizeValue(option.value)}
                  aria-pressed={fontSize === option.value}
                >
                  <span>{option.label}</span>
                  <small>{option.value}%</small>
                  {fontSize === option.value && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle-row settings-accessibility-row">
            <span>
              <b>Уменьшить анимацию</b>
              <small>Меньше движения и переходов в интерфейсе.</small>
            </span>
            <input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} />
            <i />
          </label>
        </section>

        <section className="panel messenger-settings" id="settings-reports">
          <h2>Отчёты в Telegram</h2>
          <p className="muted">STEN будет отправлять выбранные показатели на указанный выше Telegram ID.</p>
          <label className="settings-field">
            <span>Время отправки</span>
            <input type="time" value={sendTime} onChange={(event) => setSendTime(event.target.value)} />
          </label>
          <div className="messenger-metrics">
            {(Object.keys(labels) as Array<keyof Metrics>).map((key) => (
              <label className="toggle-row" key={key}>
                <span><b>{labels[key]}</b></span>
                <input type="checkbox" checked={metrics[key]} onChange={() => toggleMetric(key)} />
                <i />
              </label>
            ))}
          </div>
          <button className="primary-button" disabled={messengerSaving} onClick={() => void saveMessenger()}>
            <Save size={16} />
            {messengerSaving ? 'Сохраняем…' : 'Сохранить отчёты'}
          </button>
          {messengerMessage && <div className={`pnl-message ${messengerMessageKind}`} role={messengerMessageKind === 'error' ? 'alert' : 'status'} aria-live={messengerMessageKind === 'error' ? 'assertive' : 'polite'}>{messengerMessage}</div>}
        </section>

        <section className="panel analytics-settings" id="settings-analytics">
          <h2>Аналитика</h2>
          <p className="muted">Выберите, какие показатели STEN использует в аналитике.</p>
          <label className="toggle-row">
            <span><b>Финансовая аналитика</b><small>Выручка, себестоимость, ФОТ, прибыль и сигналы.</small></span>
            <input type="checkbox" checked={analyticsDraft.financial} onChange={(event) => setAnalyticsDraft((value) => ({ ...value, financial: event.target.checked }))} />
            <i />
          </label>
          <label className="toggle-row">
            <span><b>Аналитика ФОТ</b><small>Нагрузка и расходы на команду.</small></span>
            <input type="checkbox" checked={analyticsDraft.labor} onChange={(event) => setAnalyticsDraft((value) => ({ ...value, labor: event.target.checked }))} />
            <i />
          </label>
          <label className="toggle-row">
            <span><b>Прогноз месяца</b><small>Оценка результата текущего месяца по имеющимся данным.</small></span>
            <input type="checkbox" checked={analyticsDraft.forecast} onChange={(event) => setAnalyticsDraft((value) => ({ ...value, forecast: event.target.checked }))} />
            <i />
          </label>
          <label className="settings-field">
            <span>Порог себестоимости, %</span>
            <input type="number" min="0" max="100" value={analyticsDraft.foodTarget} onChange={(event) => setAnalyticsDraft((value) => ({ ...value, foodTarget: Number(event.target.value) }))} />
          </label>
          <label className="settings-field">
            <span>Порог ФОТ, %</span>
            <input type="number" min="0" max="100" value={analyticsDraft.laborTarget} onChange={(event) => setAnalyticsDraft((value) => ({ ...value, laborTarget: Number(event.target.value) }))} />
          </label>
          <button className="primary-button" disabled={analyticsSaving} onClick={() => void saveAnalytics(analyticsDraft)}>
            <Save size={16} />
            {analyticsSaving ? 'Сохраняем…' : 'Сохранить аналитику'}
          </button>
          {analyticsError && <div className="pnl-message error">{analyticsError}</div>}
          {analyticsSavedAt && !analyticsError && <div className="pnl-message ok">Аналитика сохранена.</div>}
        </section>

        <section className="panel" id="settings-session">
          <h2>Сеанс</h2>
          <p className="muted">{user?.email || 'Ваша учётная запись'}</p>
          <button className="danger-button" onClick={signOut}>Выйти из STEN</button>
        </section>
      </div>
    </div>
  );
}
