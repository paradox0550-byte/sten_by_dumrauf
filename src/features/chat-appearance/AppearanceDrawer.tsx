import { Check, RotateCcw, X } from 'lucide-react';
import { useAppearanceContext } from './AppearanceContext';
import { DENSITY_OPTIONS, THEME_OPTIONS } from './defaults';
import type { AppearanceSettings, ThemeId } from './types';

const TOGGLES: Array<{ key: keyof Pick<AppearanceSettings, 'showAvatars' | 'showTime' | 'showSources' | 'showActions'>; label: string }> = [
  { key: 'showAvatars', label: 'Аватары' },
  { key: 'showTime', label: 'Время' },
  { key: 'showSources', label: 'Источники' },
  { key: 'showActions', label: 'Действия' },
];

export function AppearanceDrawer({ onClose }: { onClose: () => void }) {
  const { settings, update, reset } = useAppearanceContext();

  return (
    <aside className="chat-appearance-drawer" aria-label="Оформление чата">
      <div className="chat-appearance-drawer-head">
        <div>
          <span className="eyebrow">ОФОРМЛЕНИЕ</span>
          <strong>Оформление чата</strong>
        </div>
        <button className="icon-button compact" onClick={onClose} aria-label="Закрыть оформление">
          <X size={16} />
        </button>
      </div>

      <section className="chat-appearance-section">
        <div className="chat-appearance-label">Тема</div>
        <div className="chat-theme-grid">
          {THEME_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={`chat-theme-option ${settings.theme === option.id ? 'is-active' : ''} chat-theme-${option.id}`}
              onClick={() => update('theme', option.id as ThemeId)}
              aria-pressed={settings.theme === option.id}
            >
              <span className="chat-theme-swatch" aria-hidden="true" />
              <span>
                <b>{option.label}</b>
                <small>{option.description}</small>
              </span>
              {settings.theme === option.id && <Check size={15} />}
            </button>
          ))}
        </div>
      </section>

      <section className="chat-appearance-section">
        <div className="chat-appearance-label">Фон</div>
        <div className="chat-appearance-radio-list">
          <label className="chat-radio-row">
            <input type="radio" checked={settings.background === 'none'} onChange={() => update('background', 'none')} />
            <span>Без фона</span>
          </label>
          <label className="chat-radio-row">
            <input type="radio" checked={settings.background === 'geometry'} onChange={() => update('background', 'geometry')} />
            <span>STEN Geometry</span>
          </label>
          <div className="chat-radio-row is-disabled" aria-disabled="true">
            <span className="chat-radio-fake" />
            <span>Загрузить фото <small>PR B</small></span>
          </div>
        </div>
      </section>

      <section className="chat-appearance-section">
        <div className="chat-appearance-label">Сообщения</div>
        <div className="chat-density-list">
          {DENSITY_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={`chat-density-option ${settings.density === option.id ? 'is-active' : ''}`}
              onClick={() => update('density', option.id)}
              aria-pressed={settings.density === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="chat-appearance-section">
        <div className="chat-appearance-label">Показывать</div>
        <div className="chat-toggle-list">
          {TOGGLES.map(toggle => (
            <label className="chat-toggle-row" key={toggle.key}>
              <span>{toggle.label}</span>
              <input
                type="checkbox"
                checked={settings[toggle.key]}
                onChange={event => update(toggle.key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="chat-appearance-reset"
        onClick={reset}
      >
        <RotateCcw size={14} /> Сбросить оформление
      </button>
    </aside>
  );
}
