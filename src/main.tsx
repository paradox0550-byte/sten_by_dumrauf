import '@fontsource-variable/inter';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StenLogo } from './components/brand/StenLogo';
import './styles/tokens.css';
import './app.css';
import './styles/unified-interface.css';
import './styles/operations-calm.css';
import './styles/mobile-experience.css';
import './styles/sten-visual-system.css';
import './styles/visual-system/index.css';

const THEME_KEY = 'sten_theme_v5';
const FONT_SIZE_KEY = 'sten_font_size_v1';
const MOTION_KEY = 'sten_reduce_motion_v1';

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function resolveTheme(mode: string | null): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(mode: string | null = readStorage(THEME_KEY)) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const themeColor = resolved === 'dark' ? '#0C1216' : '#F5F3ED';
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const storedTheme = readStorage(THEME_KEY);
const storedFontSize = readStorage(FONT_SIZE_KEY);
const initialFontSize = storedFontSize === '100' || storedFontSize === '110' || storedFontSize === '120' ? storedFontSize : '100';
const initialReduceMotion = readStorage(MOTION_KEY) === 'true';

document.documentElement.dataset.fontScale = initialFontSize;
document.documentElement.dataset.reduceMotion = initialReduceMotion ? 'true' : 'false';
applyTheme(storedTheme);

const syncSystemTheme = () => {
  if (readStorage(THEME_KEY) === 'system') applyTheme('system');
};
if (typeof systemThemeQuery.addEventListener === 'function') systemThemeQuery.addEventListener('change', syncSystemTheme);
else systemThemeQuery.addListener(syncSystemTheme);

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the original error and React component stack together for production diagnosis.
    console.error('[STEN] UI render failure', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <main className="fatal sten-fatal">
          <section>
            <StenLogo size={64} animated aria-label="STEN" />
            <span className="sten-state-eyebrow">STEN · СИСТЕМА УПРАВЛЕНИЯ</span>
            <h1>Не удалось открыть рабочее пространство</h1>
            <p>Произошла ошибка интерфейса. Данные не изменены. Попробуйте обновить приложение.</p>
            <button onClick={() => window.location.reload()}>Обновить приложение</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* PWA не блокирует запуск приложения */ });
  });
}
