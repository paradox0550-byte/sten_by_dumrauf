import { useEffect, useLayoutEffect, useState } from 'react';
import { Download, Monitor, Smartphone, Share } from 'lucide-react';

type InterfaceMode = 'desktop' | 'mobile';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const MODE_KEY = 'sten_interface_mode_v1';

function detectDefaultMode(): InterfaceMode {
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

function readMode(): InterfaceMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'desktop' || stored === 'mobile') return stored;
  } catch {
    // Storage may be unavailable in private browsing; device defaults still work.
  }
  return detectDefaultMode();
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InterfaceModeControl() {
  const [mode, setMode] = useState<InterfaceMode>(readMode);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.stenInterface = mode;
  }, [mode]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const toggleMode = () => {
    const nextMode = mode === 'desktop' ? 'mobile' : 'desktop';
    setMode(nextMode);
    try {
      localStorage.setItem(MODE_KEY, nextMode);
    } catch {
      // The current session still works when persistent storage is unavailable.
    }
    setShowInstallHelp(false);
  };

  const install = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt;
      setInstallPrompt(null);
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') setInstalled(true);
      } catch {
        // Installation is optional and must never block the STEN workspace.
      }
      return;
    }
    if (isAppleMobile()) setShowInstallHelp(value => !value);
  };

  const modeLabel = mode === 'desktop' ? 'Полный интерфейс' : 'Мобильный интерфейс';
  const nextModeLabel = mode === 'desktop' ? 'мобильный' : 'полный';

  return (
    <div className="sten-interface-controls" role="group" aria-label="Режим интерфейса и установка STEN">
      <button
        className="icon-button sten-mode-toggle"
        type="button"
        onClick={toggleMode}
        aria-label={`Сейчас: ${modeLabel}. Переключить на ${nextModeLabel} интерфейс`}
        aria-pressed={mode === 'mobile'}
        title={`Режим: ${modeLabel}. Переключить на ${nextModeLabel}`}
      >
        {mode === 'desktop' ? <Monitor size={17} aria-hidden="true" /> : <Smartphone size={17} aria-hidden="true" />}
      </button>

      {!installed && (installPrompt || isAppleMobile()) && (
        <button
          className="icon-button sten-install-button"
          type="button"
          onClick={() => void install()}
          aria-label={isAppleMobile() ? 'Как добавить STEN на экран Домой' : 'Установить STEN'}
          title={isAppleMobile() ? 'Добавить на экран Домой' : 'Установить STEN'}
        >
          {isAppleMobile() ? <Share size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
        </button>
      )}

      {showInstallHelp && (
        <div className="sten-install-help" role="status" aria-live="polite">
          <b>Добавить STEN на экран Домой</b>
          <span>В меню браузера выберите «Поделиться» или «Добавить на экран Домой» и следуйте подсказкам.</span>
          <button type="button" onClick={() => setShowInstallHelp(false)} aria-label="Закрыть инструкцию">Понятно</button>
        </div>
      )}
    </div>
  );
}
