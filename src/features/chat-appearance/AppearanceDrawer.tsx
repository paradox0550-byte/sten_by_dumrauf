import { Check, RotateCcw, X } from 'lucide-react';
import { useAppearanceContext } from './AppearanceContext';
import { DENSITY_OPTIONS, THEME_OPTIONS } from './defaults';
import type { ThemeId } from './types';

export function AppearanceDrawer({ onClose }: { onClose: () => void }) {
  const { settings, update, reset } = useAppearanceContext();

  return (
    <aside className="chat-appearance-drawer" aria-label="Оформление чата">
      <div className="chat-appearance-drawer-head">
        <div>
          <span className="eyebrow">ВИД ЧАТА</span>
          <strong>Оформление STEN AI</strong>
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
        <div className="chat-appearance-label">Плотность сообщений</div>
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
        <p className="chat-appearance-hint">Источники и действия остаются доступными, чтобы не терять важный контекст ответа.</p>
      </section>

      <button type="button" className="chat-appearance-reset" onClick={reset}>
        <RotateCcw size={14} /> Сбросить оформление
      </button>
    </aside>
  );
}
