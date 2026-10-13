import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, Brain, CalendarDays, Menu, Moon, PanelLeft, PanelLeftClose,
  Scale, Sun, WalletCards, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import WorkspaceSelector from './WorkspaceSelector';
import { useScope } from '../lib/useScope';
import LegalFooter from './LegalFooter';

type Theme = 'light' | 'dark' | 'system';
type Scale = 'RUB' | 'THOUSAND' | 'MILLION';
type NavIconName = 'overview' | 'pnl' | 'report' | 'settings' | 'staff' | 'terms';

function NavIcon({ icon, size = 17 }: { icon: React.ElementType | NavIconName; size?: number }) {
  if (typeof icon === 'string') {
    return <span className={`nav-glyph nav-glyph-${icon}`} aria-hidden="true" />;
  }
  const Icon = icon;
  return <Icon size={size} aria-hidden="true" />;
}

const THEME_KEY = 'sten_theme_v5';
const SCALE_KEY = 'sten_scale_v5';
const SIDEBAR_KEY = 'sten_sidebar_collapsed';

const applyTheme = (theme: Theme) => {
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
};

const viewNavigate=(nav:ReturnType<typeof useNavigate>,to:string)=>{if(typeof document!=='undefined'&&'startViewTransition' in document){(document as any).startViewTransition(()=>nav(to));}else{nav(to);}};
export default function Layout({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
  });
  const [scale, setScale] = useState<Scale>(() => {
    const value = localStorage.getItem(SCALE_KEY);
    return value === 'RUB' || value === 'THOUSAND' || value === 'MILLION' ? value : 'THOUSAND';
  });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const { user } = useAuth();
  const [scope, setScope] = useScope();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem(SCALE_KEY, scale);
    window.dispatchEvent(new CustomEvent('sten-scale-change', { detail: scale }));
  }, [scale]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => [
    ['/sten', 'STEN AI', Bot],
    ['/dashboard', 'Мой день', 'overview'],
    ['/secretary', 'Секретарь', CalendarDays],
    ['/flash', 'Flash', 'report'],
    ['/pnl', 'P&L', 'pnl'],
    ['/budget', 'Бюджет', BarChart3],
    ['/analytics', 'Аналитика', BarChart3],
    ['/team', 'Команда и ФОТ', 'staff'],
    ['/documents', 'Документы', 'terms'],
    ['/finances', 'Финансы', WalletCards],
  ] as const, []);

  const name = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Пользователь'
    : 'Пользователь';

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
  };

  const period = scope.period || '2026-10';
  const periodLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(`${period}-01T00:00:00`))
    .replace(/^./, char => char.toUpperCase());

  const mobileItems = [
    ['/dashboard', 'Сводка', 'overview'],
    ['/pnl', 'P&L', 'pnl'],
    ['/documents', 'Документы', 'terms'],
  ] as const;

  return (
    <div className="shell executive-shell">
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div>
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><img src="/brand/sten-mark.svg?v=5.0.2" alt="" /></div>
            <div className="brand-copy">
              <b>STEN</b>
              <small>Рабочий кабинет</small>
            </div>
            <button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Закрыть меню"><X size={18} /></button>
          </div>

          <nav aria-label="Навигация контура">
            <div className="nav-section-label">ОПЕРАЦИОННЫЙ КОНТУР</div>
            {items.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/sten'}
                onClick={() => setMobileMenu(false)}
              >
                <NavIcon icon={Icon} size={17} />
                <span>{label}</span>
              </NavLink>
            ))}
            <div className="nav-section-label" style={{ marginTop: 18 }}>Система</div>
            <NavLink to="/memory" onClick={() => setMobileMenu(false)}>
              <Brain size={17} />
              <span>Память</span>
            </NavLink>
            <NavLink to="/legal" onClick={() => setMobileMenu(false)}>
              <Scale size={17} />
              <span>Правовая информация</span>
            </NavLink>
            {user?.role === 'super_admin' && <NavLink to="/admin/organizations" onClick={() => setMobileMenu(false)}>
              <span>Организации</span>
            </NavLink>}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar">{name.slice(0, 1)}</div>
            <div><b>{name}</b><small>персональный режим</small></div>
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="backdrop" onClick={() => setMobileMenu(false)} aria-label="Закрыть меню" />}

      <main className="main">
        <header className="topbar executive-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileMenu(v => !v)} aria-label="Меню">
            {mobileMenu ? <X size={18} /> : <Menu size={18} />}
          </button>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"} title={sidebarCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"}>
            {sidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>

          <div className="top-context">
            <span className="crumb">{items.find(x => x[0] === location.pathname)?.[1] || 'Рабочий контур'}</span>
            <span className="period-chip">{periodLabel} · с начала месяца</span>
          </div>

          <nav className="top-nav" aria-label="Основная навигация">
            {([
              ['/pnl', 'P&L', 'pnl'],
              ['/dashboard', 'Мой день', 'overview'],
              ['/sten', 'STEN AI', Bot],
              ['/team', 'Команда', 'staff'],
              ['/settings', 'Настройки', 'settings'],
            ] as const).map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => isActive ? 'active' : ''}
                end={to === '/sten'}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); viewNavigate(navigate, to); }}
              >
                <NavIcon icon={Icon} size={15} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="top-workspace">
            <WorkspaceSelector value={scope} onChange={setScope} variant="compact" />
          </div>

          {["/pnl","/flash","/budget","/analytics","/finances"].includes(location.pathname) && <div className="global-scale" role="group" aria-label="Масштаб финансовых значений">
            {([['RUB', '₽'], ['THOUSAND', 'тыс. ₽'], ['MILLION', 'млн ₽']] as const).map(([value, label]) => (
              <button
                key={value}
                className={scale === value ? 'active' : ''}
                onClick={() => setScale(value)}
              >{label}</button>
            ))}
          </div>}

          <div className="top-actions">
            <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
          <div className="top-profile" title={user?.email || ''}>
            <div className="avatar">{name.slice(0, 1)}</div>
            <div className="top-profile-info">
              <b>{name}</b>
              <small>{user?.position || (user?.role === 'super_admin' ? 'Администратор' : 'Сотрудник')}</small>
            </div>
          </div>
        </header>

        <div className="content">{children}<LegalFooter /></div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        {mobileItems.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/sten'} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); viewNavigate(navigate, to); }}>
            <NavIcon icon={Icon} size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button className={location.pathname === '/memory' ? 'active' : ''} onClick={() => viewNavigate(navigate,'/settings')} aria-label="Настройки" aria-current={location.pathname === '/memory' ? 'page' : undefined}><NavIcon icon="settings" size={18} /><span>Настройки</span></button>
      </nav>
    </div>
  );
}
