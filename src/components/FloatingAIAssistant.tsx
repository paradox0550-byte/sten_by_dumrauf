import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, CalendarCheck, Clock3, FileText, MessageCircle,
  Plus, Settings, Users, Wallet, X, ChevronRight,
} from 'lucide-react';
import Ladar from '../features/ladar/Ladar';
import './FloatingAIAssistant.css';

type AIStatus = 'ready' | 'working' | 'error';
type LauncherAction = {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof Activity;
  paths: string[];
};

const ACTIONS: LauncherAction[] = [
  { id: 'analytics', label: 'Аналитика', description: 'Показатели и динамика', to: '/analytics', icon: BarChart3, paths: ['/dashboard', '/analytics', '/pnl', '/budget', '/finances'] },
  { id: 'pnl', label: 'P&L и отклонения', description: 'План-факт и финансовый результат', to: '/pnl', icon: Wallet, paths: ['/pnl', '/budget', '/finances'] },
  { id: 'operations', label: 'Мой день', description: 'Операционная работа и контроль', to: '/ops', icon: CalendarCheck, paths: ['/ops', '/plan'] },
  { id: 'team', label: 'Команда и ФОТ', description: 'Персонал и затраты на труд', to: '/staff', icon: Users, paths: ['/staff'] },
  { id: 'documents', label: 'Документы', description: 'Отчёты и рабочие файлы', to: '/documents', icon: FileText, paths: ['/documents', '/memory'] },
  { id: 'settings', label: 'Настройки', description: 'Профиль и рабочее пространство', to: '/settings', icon: Settings, paths: ['/settings'] },
];

const RECENT_KEY = 'sten_ladar_recent_v1';

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && ACTIONS.some(action => action.to === item)).slice(0, 3) : [];
  } catch { return []; }
}

export default function FloatingAIAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [status, setStatus] = useState<AIStatus>('ready');
  const longPress = useRef<number | null>(null);
  const longPressed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hidden = ['/sten', '/ai', '/unlock', '/auth', '/login'].includes(location.pathname);

  const contextualActions = useMemo(() => {
    const current = ACTIONS.filter(action => action.paths.some(path => location.pathname === path || location.pathname.startsWith(path + '/')));
    return [...current, ...ACTIONS.filter(action => !current.some(item => item.id === action.id))].slice(0, 4);
  }, [location.pathname]);

  const recentActions = useMemo(
    () => recent.map(path => ACTIONS.find(action => action.to === path)).filter((action): action is LauncherAction => Boolean(action)),
    [recent],
  );

  useEffect(() => {
    let errorTimer: number | undefined;
    const onStatus = (event: Event) => {
      const next = (event as CustomEvent<AIStatus>).detail;
      if (next === 'error') {
        setStatus('error');
        if (errorTimer !== undefined) window.clearTimeout(errorTimer);
        errorTimer = window.setTimeout(() => { setStatus('ready'); errorTimer = undefined; }, 3500);
      } else if (next === 'working') {
        if (errorTimer !== undefined) { window.clearTimeout(errorTimer); errorTimer = undefined; }
        setStatus('working');
      } else if (next === 'ready' && errorTimer === undefined) setStatus('ready');
    };
    window.addEventListener('sten:ai-status', onStatus);
    return () => {
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      window.removeEventListener('sten:ai-status', onStatus);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setShowRecent(false);
  }, [location.pathname]);

  useEffect(() => () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (hidden) return null;

  const openChat = () => { setMenuOpen(false); navigate('/sten'); };
  const startNew = () => { setMenuOpen(false); navigate('/sten?new=1'); };
  const go = (action: LauncherAction) => {
    const next = [action.to, ...recent.filter(path => path !== action.to)].slice(0, 3);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage can be unavailable */ }
    setMenuOpen(false);
    setShowRecent(false);
    navigate(action.to);
  };
  const onPointerDown = () => {
    longPressed.current = false;
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = window.setTimeout(() => { longPressed.current = true; setMenuOpen(true); }, 550);
  };
  const onPointerEnd = () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
  };

  const visibleActions = showRecent ? recentActions : contextualActions;

  return (
    <div className="sten-floating-ai" ref={rootRef}>
      {menuOpen && (
        <section className="sten-floating-ai__menu" role="dialog" aria-label="Быстрые действия ЛАДАР">
          <header className="sten-floating-ai__menu-header">
            <div>
              <span className="sten-floating-ai__eyebrow">STEN · УМНЫЙ ДОСТУП</span>
              <strong>ЛАДАР</strong>
              <small>Рабочее пространство и период сохраняются</small>
            </div>
            <button type="button" className="sten-floating-ai__dismiss" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><X size={17} /></button>
          </header>
          <div className="sten-floating-ai__menu-actions">
            <button role="menuitem" onClick={openChat}><MessageCircle size={17} /><span><strong>Открыть STEN AI</strong><small>Продолжить диалог</small></span><ChevronRight size={16} /></button>
            <button role="menuitem" onClick={startNew}><Plus size={17} /><span><strong>Новый диалог</strong><small>Начать с чистого запроса</small></span><ChevronRight size={16} /></button>
            {visibleActions.map(action => {
              const Icon = action.icon;
              const active = location.pathname === action.to;
              return <button role="menuitem" key={action.id} onClick={() => go(action)} aria-current={active ? 'page' : undefined}>
                <Icon size={17} /><span><strong>{action.label}</strong><small>{action.description}</small></span><ChevronRight size={16} />
              </button>;
            })}
          </div>
          <footer className="sten-floating-ai__menu-footer">
            <button type="button" onClick={() => setShowRecent(value => !value)}><Clock3 size={14} />{showRecent ? 'Контекстные действия' : 'Недавние разделы'}</button>
            <span><Activity size={13} /> {status === 'working' ? 'STEN работает' : status === 'error' ? 'Есть ошибка' : 'STEN готов'}</span>
          </footer>
        </section>
      )}
      <button
        type="button"
        className={`sten-floating-ai__button is-${status}${menuOpen ? ' is-open' : ''}`}
        aria-label="ЛАДАР: открыть STEN AI"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={event => { event.preventDefault(); setMenuOpen(true); }}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return; }
          openChat();
        }}
      >
        <Ladar size={48} />
        <span className="sten-floating-ai__status" aria-hidden="true" />
      </button>
    </div>
  );
}
