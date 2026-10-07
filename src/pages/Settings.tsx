import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import WorkspaceSelector from '../components/WorkspaceSelector';
import { useScope } from '../lib/useScope';
import { useAnalyticsSettings, type AnalyticsSettings } from '../lib/useAnalyticsSettings';

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
const BLOCKS_KEY = 'sten_blocks_v5';

const defaults = {
  dashboard: true,
  pnl: true,
  finances: true,
  budget: true,
};

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
  const [theme, setTheme] = useState<Theme>(() => {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const value = localStorage.getItem(FONT_SIZE_KEY);
    return value === '100' || value === '110' || value === '120' ? value : '100';
  });
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem(MOTION_KEY) === 'true');
  const [blocks, setBlocks] = useState(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(BLOCKS_KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  });

  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    position: user?.position || '',
    telegramChatId: user?.telegramChatId || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [sendTime, setSendTime] = useState('21:00');
  const [metrics, setMetrics] = useState<Metrics>(metricDefaults);
  const [messengerMessage, setMessengerMessage] = useState('');
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
        const response = await api.get<any>('/api/messenger/settings');
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

  const setBlock = (key: string, value: boolean) => {
    const next = { ...blocks, [key]: value };
    setBlocks(next);
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(next));
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const response = await api.put<any>('/api/profile', profile);
      if (response?.profile) {
        setProfile({
          firstName: response.profile.firstName || '',
          lastName: response.profile.lastName || '',
          position: response.profile.position || '',
          telegramChatId: response.profile.telegramChatId || '',
        });
      }
      await refresh();
      setProfileMessage('Профиль сохранён.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль.');
    } finally {
      setProfileSaving(false);
    }
  };

  const saveMessenger = async () => {
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
        telegram_chat_id: profile.telegramChatId || null,
        whatsapp_phone: null,
      });
      setMessengerMessage('Отчёты сохранены.');
    } catch (error) {
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
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">МОЙ КАБИНЕТ</span>
          <h1>Настройки</h1>
          <p>Только то, что нужно для работы STEN.</p>
        </div>
      </div>

      <div className="settings-grid">
        <WorkspaceSelector value={scope} onChange={setScope} />

        <section className="panel">
          <h2>Мои данные</h2>
          <p className="muted">Эти данные используются в профиле STEN и для отправки отчётов в Telegram.</p>
          <div className="settings-field">
            <span>Имя</span>
            <input value={profile.firstName} onChange={(event) => setProfile((value) => ({ ...value, firstName: event.target.value }))} placeholder="Александр" />
          </div>
          <div className="settings-field">
            <span>Фамилия</span>
            <input value={profile.lastName} onChange={(event) => setProfile((value) => ({ ...value, lastName: event.target.value }))} placeholder="Фамилия" />
          </div>
          <div className="settings-field">
            <span>Должность</span>
            <input value={profile.position} onChange={(event) => setProfile((value) => ({ ...value, position: event.target.value }))} placeholder="Операционный директор" />
          </div>
          <div className="settings-field">
            <span>Telegram ID</span>
            <input
              inputMode="numeric"
              value={profile.telegramChatId}
              onChange={(event) => setProfile((value) => ({ ...value, telegramChatId: event.target.value.replace(/[^\d-]/g, '') }))}
              placeholder="Например, 123456789"
            />
            <small className="muted">Нужен, чтобы STEN мог отправлять Вам отчёты в Telegram.</small>
          </div>
          <button className="primary-button" disabled={profileSaving} onClick={() => void saveProfile()}>
            <Save size={16} />
            {profileSaving ? 'Сохраняем…' : 'Сохранить данные'}
          </button>
          {profileMessage && <div className="pnl-message ok">{profileMessage}</div>}
        </section>

        <section className="panel">
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

        <section className="panel">
          <h2>Рабочие разделы</h2>
          <p className="muted">Можно убрать раздел из меню. Данные не удаляются.</p>
          {Object.entries(blocks).map(([key, value]) => (
            <label className="toggle-row" key={key}>
              <span>
                <b>{({ dashboard: 'Обзор', pnl: 'P&L', finances: 'Финансы', budget: 'Бюджет' } as Record<string, string>)[key]}</b>
                <small>{value ? 'Показывать' : 'Скрыть'}</small>
              </span>
              <input type="checkbox" checked={value} onChange={(event) => setBlock(key, event.target.checked)} />
              <i />
            </label>
          ))}
        </section>

        <section className="panel messenger-settings">
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
          {messengerMessage && <div className="pnl-message ok">{messengerMessage}</div>}
        </section>

        <section className="panel analytics-settings">
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

        <section className="panel">
          <h2>Сеанс</h2>
          <p className="muted">{user?.email || 'Ваша учётная запись'}</p>
          <button className="danger-button" onClick={signOut}>Выйти из STEN</button>
        </section>
      </div>
    </div>
  );
}
