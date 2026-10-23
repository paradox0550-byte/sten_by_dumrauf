import { useEffect, useState } from 'react';
import { Check, Save, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';
import WorkspaceSelector from '../components/WorkspaceSelector';
import { useScope } from '../lib/useScope';
import { useAnalyticsSettings, type AnalyticsSettings } from '../lib/useAnalyticsSettings';
import { useAppearance } from '../features/chat-appearance/useAppearance';
import { DENSITY_OPTIONS, THEME_OPTIONS } from '../features/chat-appearance/defaults';
import type { AppearanceSettings, DensityId, ThemeId } from '../features/chat-appearance/types';
import { isValidTelegramChatId, normalizeProfileText, type MessengerSettingsPayload, type MessengerSettingsResponse, type ProfileUpdatePayload, type ProfileUpdateResponse } from '../lib/contracts/profile';

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
const AI_MODE_KEY = 'sten_ai_personal_mode';
const AI_VOICE_KEY = 'sten_ai_voice_autoplay';
type PersonalMode = 'concise' | 'analyst' | 'coach';
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
  const [scope, setScope] = useScope();
  const { settings: chatAppearance, update: updateChatAppearance, reset: resetChatAppearance } = useAppearance(user);
  const [personalMode, setPersonalMode] = useState<PersonalMode>(() => { const value = localStorage.getItem(AI_MODE_KEY); return value === 'concise' || value === 'analyst' || value === 'coach' ? value : 'analyst'; });
  const [voiceAutoplay, setVoiceAutoplay] = useState(() => localStorage.getItem(AI_VOICE_KEY) === 'true');
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
    firstName: normalizeProfileText(user?.firstName || ''),
    lastName: normalizeProfileText(user?.lastName || ''),
    position: normalizeProfileText(user?.position || ''),
    telegramChatId: normalizeProfileText(String(user?.telegramChatId || '')),
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileMessageKind, setProfileMessageKind] = useState<'ok' | 'error'>('ok');
  const [profileErrors, setProfileErrors] = useState<Partial<Record<'firstName' | 'lastName' | 'position' | 'telegramChatId', string>>>({});
  const [scopeMessage, setScopeMessage] = useState('');

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
    const onFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setScopeMessage(detail?.message || 'Не удалось сохранить рабочий контекст. Выберите ресторан ещё раз.');
    };
    const onSuccess = () => setScopeMessage('');
    window.addEventListener('sten:scope-save-error', onFailure);
    window.addEventListener('sten:scope-save-success', onSuccess);
    return () => {
      window.removeEventListener('sten:scope-save-error', onFailure);
      window.removeEventListener('sten:scope-save-success', onSuccess);
    };
  }, []);

  useEffect(() => {
    setProfile({
      firstName: normalizeProfileText(user?.firstName || ''),
      lastName: normalizeProfileText(user?.lastName || ''),
      position: normalizeProfileText(user?.position || ''),
      telegramChatId: normalizeProfileText(String(user?.telegramChatId || '')),
    });
  }, [user?.firstName, user?.lastName, user?.position, user?.telegramChatId]);

  useEffect(() => { localStorage.setItem(AI_MODE_KEY, personalMode); }, [personalMode]);
  useEffect(() => { localStorage.setItem(AI_VOICE_KEY, String(voiceAutoplay)); }, [voiceAutoplay]);

  useEffect(() => {
    applyAppearance(fontSize, reduceMotion);
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
    localStorage.setItem(MOTION_KEY, String(reduceMotion));
  }, [fontSize, reduceMotion]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<MessengerSettingsResponse>('/api/messenger/settings');
        const settings = response?.settings;
        if (settings) {
          setSendTime(settings.send_time || '21:00');
          setMetrics({ ...metricDefaults, ...(settings.metrics || {}) });
          if (!user?.telegramChatId && settings.telegram_chat_id) {
            setProfile((value) => ({ ...value, telegramChatId: normalizeProfileText(String(settings.telegram_chat_id)) }));
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
    const normalized = {
      firstName: normalizeProfileText(profile.firstName),
      lastName: normalizeProfileText(profile.lastName),
      position: normalizeProfileText(profile.position),
      telegramChatId: normalizeProfileText(profile.telegramChatId),
    };
    const errors: typeof profileErrors = {};
    if (normalized.firstName.length > 80) errors.firstName = 'Имя — не более 80 символов.';
    if (normalized.lastName.length > 80) errors.lastName = 'Фамилия — не более 80 символов.';
    if (normalized.position.length > 120) errors.position = 'Должность — не более 120 символов.';
    if (normalized.telegramChatId && !isValidTelegramChatId(normalized.telegramChatId)) {
      errors.telegramChatId = 'Введите Telegram ID: от 5 до 20 цифр, знак минус допустим.';
    }
    setProfile(normalized);
    setProfileErrors(errors);
    setProfileMessage('');
    if (Object.keys(errors).length) return;
    const payload: ProfileUpdatePayload = {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      position: normalized.position,
      telegramChatId: normalized.telegramChatId || null,
    };
    setProfileSaving(true);
    try {
      const response = await api.put<ProfileUpdateResponse>('/api/profile', payload);
      if (response?.profile) {
        setProfile({
          firstName: response.profile.firstName || '',
          lastName: response.profile.lastName || '',
          position: response.profile.position || '',
          telegramChatId: normalizeProfileText(String(response.profile.telegramChatId || '')),
        });
      }
      await refresh();
      setProfileMessageKind('ok');
      setProfileMessage('Профиль сохранён.');
    } catch (error) {
      setProfileMessageKind('error');
      if (error instanceof ApiError && error.code === 'TELEGRAM_ID_INVALID') {
        setProfileErrors((current) => ({ ...current, telegramChatId: error.message || 'Проверьте Telegram ID.' }));
        setProfileMessage('Проверьте отмеченные поля.');
      } else if (error instanceof ApiError && error.code === 'PROFILE_INVALID') {
        const field = error.field === 'lastName' || error.field === 'position' || error.field === 'firstName' ? error.field : 'firstName';
        setProfileErrors((current) => ({ ...current, [field]: error.message || 'Проверьте это поле.' }));
        setProfileMessage('Проверьте отмеченные поля.');
      } else {
        setProfileMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль.');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const saveMessenger = async () => {
    const telegramChatId = normalizeProfileText(profile.telegramChatId);
    if (telegramChatId && !isValidTelegramChatId(telegramChatId)) {
      setProfileErrors((current) => ({ ...current, telegramChatId: 'Введите Telegram ID: от 5 до 20 цифр, знак минус допустим.' }));
      setMessengerMessageKind('error');
      setMessengerMessage('Исправьте Telegram ID в разделе «Профиль».');
      return;
    }
    setProfileErrors((current) => ({ ...current, telegramChatId: undefined }));
    setMessengerSaving(true);
    setMessengerMessage('');
    try {
      const payload: MessengerSettingsPayload = {
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
        telegram_chat_id: telegramChatId || null,
        whatsapp_phone: null,
      };
      await api.post('/api/messenger/settings', payload);
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
          <p>Настройте аккаунт, рабочие данные, аналитику и уведомления. Изменения применяются только после сохранения, если не указано иное.</p>
        </div>
      </div>

      <nav className="settings-quick-jump" aria-label="Быстрый переход по настройкам">
        <a href="#settings-profile">Аккаунт и профиль</a>
        <a href="#settings-workspace">Организация и рестораны</a>
        <a href="#settings-analytics">Финансы и аналитика</a>
        <a href="#settings-reports">Отчёты и уведомления</a>
        <a href="#settings-ai">STEN AI и голос</a>
         <a href="#settings-appearance">Внешний вид</a>
        <a href="#settings-session">Вход и выход</a>
      </nav>

      <div className="settings-grid">
        <section className="panel settings-workspace" id="settings-workspace">
          <h2>Рабочий контур</h2>
          <p className="muted">Контекст влияет на финансовые отчёты и аналитику, но не нужен для общих вопросов к STEN AI. Выбор сохраняется автоматически.</p>
          <WorkspaceSelector value={scope} onChange={setScope} />
          {scopeMessage && <div className="pnl-message error" role="alert">{scopeMessage}</div>}
        </section>

        <section className="panel" id="settings-profile">
          <h2>Профиль</h2>
          <p className="muted">Имя и должность отображаются в STEN. Telegram ID используется для адресной отправки отчётов. После изменений нажмите «Сохранить данные».</p>
          <label className="settings-field">
            <span>Имя</span>
            <input maxLength={80} value={profile.firstName} onChange={(event) => { const value = normalizeProfileText(event.target.value); setProfile((current) => ({ ...current, firstName: value })); setProfileErrors((current) => ({ ...current, firstName: undefined })); }} placeholder="Александр" />
          </label>
          {profileErrors.firstName && <small className="field-error" role="alert">{profileErrors.firstName}</small>}
          <label className="settings-field">
            <span>Фамилия</span>
            <input maxLength={80} value={profile.lastName} onChange={(event) => { const value = normalizeProfileText(event.target.value); setProfile((current) => ({ ...current, lastName: value })); setProfileErrors((current) => ({ ...current, lastName: undefined })); }} placeholder="Фамилия" />
          </label>
          {profileErrors.lastName && <small className="field-error" role="alert">{profileErrors.lastName}</small>}
          <label className="settings-field">
            <span>Должность</span>
            <input maxLength={120} value={profile.position} onChange={(event) => { const value = normalizeProfileText(event.target.value); setProfile((current) => ({ ...current, position: value })); setProfileErrors((current) => ({ ...current, position: undefined })); }} placeholder="Операционный директор" />
          </label>
          {profileErrors.position && <small className="field-error" role="alert">{profileErrors.position}</small>}
          <label className="settings-field">
            <span>Telegram ID</span>
            <input
              inputMode="text"
              value={profile.telegramChatId}
              onChange={(event) => { const value = normalizeProfileText(event.target.value); setProfile((current) => ({ ...current, telegramChatId: value })); setProfileErrors((current) => ({ ...current, telegramChatId: undefined })); }}
              placeholder="Например, 123456789"
            />
            <small className="muted">Нужен, чтобы STEN мог отправлять Вам отчёты в Telegram.</small>
          </label>
          {profileErrors.telegramChatId && <small className="field-error" role="alert">{profileErrors.telegramChatId}</small>}
          <button className="primary-button" disabled={profileSaving} onClick={() => void saveProfile()}>
            <Save size={16} />
            {profileSaving ? 'Сохраняем…' : 'Сохранить данные'}
          </button>
          {profileMessage && <div className={`pnl-message ${profileMessageKind}`} role={profileMessageKind === 'error' ? 'alert' : 'status'} aria-live={profileMessageKind === 'error' ? 'assertive' : 'polite'}>{profileMessage}</div>}
        </section>

        <section className="panel settings-ai-panel" id="settings-ai">
          <h2>STEN AI и голос</h2>
          <p className="muted">Все настройки общения и оформления чата собраны здесь. Панель чата остаётся свободной от дополнительных меню.</p>
          <label className="settings-field"><span>Стиль ответов STEN AI</span>
            <select value={personalMode} onChange={(event) => setPersonalMode(event.target.value as PersonalMode)}>
              <option value="concise">Кратко и по делу</option><option value="analyst">Аналитик — факты, причины и риски</option><option value="coach">Наставник управляющего</option>
            </select>
          </label>
          <label className="toggle-row"><span><b>Озвучивать ответы STEN</b><small>Голосовой ответ после отправки вопроса. Работает независимо от поддержки распознавания речи.</small></span>
            <input type="checkbox" checked={voiceAutoplay} onChange={(event) => setVoiceAutoplay(event.target.checked)} /><i />
          </label>
          <p className="settings-help">На iPhone/iPad браузер может не поддерживать встроенное распознавание речи. Нажмите микрофон в чате и используйте диктовку клавиатуры; ответ можно прослушать голосом.</p>
          <div className="settings-subsection"><span className="settings-label">Тема чата</span><div className="choice-grid">
            {THEME_OPTIONS.map((option) => <button key={option.id} type="button" className={'choice ' + (chatAppearance.theme === option.id ? 'active' : '')} onClick={() => updateChatAppearance('theme', option.id as ThemeId)} aria-pressed={chatAppearance.theme === option.id}><span>{option.label}</span>{chatAppearance.theme === option.id && <Check size={16} />}</button>)}
          </div></div>
          <div className="settings-subsection"><span className="settings-label">Плотность диалога</span><div className="choice-grid">
            {DENSITY_OPTIONS.map((option) => <button key={option.id} type="button" className={'choice ' + (chatAppearance.density === option.id ? 'active' : '')} onClick={() => updateChatAppearance('density', option.id)} aria-pressed={chatAppearance.density === option.id}>{option.label}{chatAppearance.density === option.id && <Check size={16} />}</button>)}
          </div></div>
          <div className="settings-chat-toggles">
            {([['showAvatars','Аватары участников'],['showTime','Время сообщений'],['showSources','Источники ответов'],['showActions','Действия с сообщениями']] as Array<[keyof Pick<AppearanceSettings,'showAvatars'|'showTime'|'showSources'|'showActions'>,string]>).map(([key,label]) =>
              <label className="toggle-row" key={key}><span><b>{label}</b></span><input type="checkbox" checked={chatAppearance[key]} onChange={(event) => updateChatAppearance(key,event.target.checked)} /><i /></label>
            )}
          </div>
          <button type="button" className="secondary-button" onClick={resetChatAppearance}><RotateCcw size={15} /> Сбросить оформление чата</button>
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
          <h2>Вход и выход</h2>
          <p className="muted">Вы вошли как <b>{user?.email || 'учётная запись STEN'}</b>. Для изменения имени и должности откройте раздел «Аккаунт и профиль».</p>
          <button className="danger-button" onClick={signOut}>Выйти из STEN</button>
        </section>
      </div>
    </div>
  );
}
