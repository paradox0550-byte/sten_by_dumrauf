import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bot, CalendarCheck, ChartNoAxesCombined, ChevronRight, Clock3,
  FileText, Users, Wallet, X, Zap,
} from 'lucide-react';
import { Ladar } from './Ladar';
import './launcher.css';

type LauncherAction = {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof Bot;
  contexts: string[];
};

const ACTIONS: LauncherAction[] = [
  { id: 'ai', label: 'Спросить STEN', description: 'Разобрать ситуацию и следующий шаг', to: '/sten', icon: Bot, contexts: ['*'] },
  { id: 'analysis', label: 'Аналитика', description: 'Показатели и динамика', to: '/analytics', icon: ChartNoAxesCombined, contexts: ['/dashboard', '/analytics', '/pnl', '/budget', '/finances'] },
  { id: 'deviations', label: 'Проверить отклонения', description: 'План-факт и финансовые риски', to: '/pnl', icon: Activity, contexts: ['/pnl', '/budget', '/finances', '/analytics'] },
  { id: 'day', label: 'Мой день', description: 'Операционная работа и контроль', to: '/ops', icon: CalendarCheck, contexts: ['/ops', '/plan'] },
  { id: 'team', label: 'Команда и ФОТ', description: 'Персонал и затраты на труд', to: '/staff', icon: Users, contexts: ['/staff'] },
  { id: 'documents', label: 'Документы', description: 'Отчёты и рабочие файлы', to: '/documents', icon: FileText, contexts: ['/documents', '/memory'] },
  { id: 'finance', label: 'Финансы', description: 'P&L, бюджет и операции', to: '/pnl', icon: Wallet, contexts: ['/pnl', '/budget', '/finances'] },
];

export default function LadarLauncher() {
  const [open, setOpen] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('sten_ladar_recent_v1') || '[]');
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 3) : [];
    } catch { return []; }
  });
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  const contextualActions = useMemo(() => {
    const matched = ACTIONS.filter(action => action.contexts.includes('*') || action.contexts.some(path => location.pathname === path || location.pathname.startsWith(path + '/')));
    const unique = [...matched, ...ACTIONS.filter(action => !matched.some(item => item.id === action.id))];
    return unique.slice(0, 5);
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
    setShowRecent(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const go = (action: LauncherAction) => {
    const next = [action.to, ...recent.filter(path => path !== action.to)].slice(0, 3);
    setRecent(next);
    try { localStorage.setItem('sten_ladar_recent_v1', JSON.stringify(next)); } catch { /* storage can be unavailable */ }
    setOpen(false);
    setShowRecent(false);
    navigate(action.to);
  };

  const actionForPath = (path: string) => ACTIONS.find(action => action.to === path);
  const currentAction = actionForPath(location.pathname);
  const recentActions = recent.map(actionForPath).filter((item): item is LauncherAction => Boolean(item));

  return (
    <div className="sten-ladar-launcher" ref={rootRef}>
      {open && (
        <section className="sten-ladar-launcher__panel" aria-label="Быстрые действия ЛАДАР">
          <header className="sten-ladar-launcher__header">
            <div className="sten-ladar-launcher__heading">
              <span className="sten-ladar-launcher__eyebrow">STEN · УМНЫЙ ДОСТУП</span>
              <h2>ЛАДАР</h2>
              <p>{currentAction ? `Сейчас открыт раздел «${currentAction.label}»` : 'Выберите следующее действие'}</p>
            </div>
            <button className="sten-ladar-launcher__close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть ЛАДАР"><X size={18} /></button>
          </header>

          {showRecent ? (
            <div className="sten-ladar-launcher__list" aria-label="Недавние разделы">
              {recentActions.length ? recentActions.map(action => {
                const Icon = action.icon;
                return <button className="sten-ladar-launcher__action" key={action.id} type="button" onClick={() => go(action)}>
                  <span className="sten-ladar-launcher__action-icon"><Icon size={19} /></span>
                  <span className="sten-ladar-launcher__action-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>;
              }) : <p className="sten-ladar-launcher__empty">Недавних переходов пока нет.</p>}
            </div>
          ) : (
            <div className="sten-ladar-launcher__list">
              {contextualActions.map(action => {
                const Icon = action.icon;
                const active = location.pathname === action.to;
                return <button className="sten-ladar-launcher__action" key={action.id} type="button" onClick={() => go(action)} aria-current={active ? 'page' : undefined}>
                  <span className="sten-ladar-launcher__action-icon"><Icon size={19} /></span>
                  <span className="sten-ladar-launcher__action-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>;
              })}
            </div>
          )}

          <footer className="sten-ladar-launcher__footer">
            <span><Zap size={14} aria-hidden="true" /> Контекст рабочего пространства сохраняется</span>
            <button type="button" onClick={() => setShowRecent(value => !value)}><Clock3 size={15} aria-hidden="true" /> {showRecent ? 'Быстрые действия' : 'Недавние'}</button>
          </footer>
        </section>
      )}
      <button
        className={`sten-ladar-launcher__trigger${open ? ' is-open' : ''}`}
        type="button"
        aria-label={open ? 'Закрыть ЛАДАР' : 'Открыть умный лаунчер ЛАДАР'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(value => !value)}
      >
        {open ? <X size={25} aria-hidden="true" /> : <Ladar size={32} />}
      </button>
    </div>
  );
}
