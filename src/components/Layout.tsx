import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, Brain, CalendarDays, Menu, Moon, PanelLeft, PanelLeftClose, FlaskConical,
  LogOut, Scale, Sun, WalletCards, X, ChevronDown, ClipboardList, Gauge,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved !== null) return saved === '1';
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  });
  const { user, signOut } = useAuth();
  const [scope, setScope] = useScope();
  const location = useLocation();
  const navigate = useNavigate();
  const financePaths = ['/pnl', '/pnl/import', '/budget', '/analytics', '/finances'];
  const operationsPaths = ['/quick-entry', '/secretary', '/flash', '/team', '/documents'];
  const toolsPaths = ['/ai-quality', '/memory', '/settings', '/legal', '/admin/organizations'];
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    finance: financePaths.includes(location.pathname),
    operations: operationsPaths.includes(location.pathname),
    tools: toolsPaths.includes(location.pathname),
  }));
  const toggleGroup = (group: string) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      setExpandedGroups(current => ({ ...current, [group]: true }));
      return;
    }
    setExpandedGroups(current => ({ ...current, [group]: !current[group] }));
  };
  useEffect(() => {
    if (financePaths.includes(location.pathname)) setExpandedGroups(current => ({ ...current, finance: true }));
    if (operationsPaths.includes(location.pathname)) setExpandedGroups(current => ({ ...current, operations: true }));
    if (toolsPaths.includes(location.pathname)) setExpandedGroups(current => ({ ...current, tools: true }));
  }, [location.pathname]);

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
    ['/dashboard', 'Сводка', 'overview'],
    ['/sten', 'STEN AI', Bot],
    ['/ai-quality', 'Лаборатория AI', FlaskConical],
    ['/quick-entry', 'Мой день', CalendarDays],
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
    ['/dashboard', 'Обзор', 'overview'],
    ['/sten', 'STEN AI', Bot],
    ['/pnl', 'Финансы', 'pnl'],
    ['/quick-entry', 'Операции', ClipboardList],
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

          <nav className="sten-primary-nav" aria-label="Навигация контура">
            <div className="nav-section-label">Рабочее пространство</div>
            <NavLink to="/dashboard" onClick={() => setMobileMenu(false)}>
              <NavIcon icon="overview" size={17} />
              <span>Обзор</span>
            </NavLink>
            <NavLink to="/sten" end onClick={() => setMobileMenu(false)}>
              <Bot size={17} aria-hidden="true" />
              <span>STEN AI</span>
            </NavLink>

            <button className={`nav-group-toggle ${financePaths.includes(location.pathname) ? 'is-current' : ''}`} type="button" aria-expanded={!!expandedGroups.finance} onClick={() => toggleGroup('finance')}>
              <BarChart3 size={17} aria-hidden="true" />
              <span>Финансы</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.finance && <div className="nav-group-children" aria-label="Финансы">
              {([
                ['/pnl', 'P&L'],
                ['/budget', 'Бюджет'],
                ['/analytics', 'Аналитика'],
                ['/finances', 'Финансовые операции'],
              ] as const).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)}><span>{label}</span></NavLink>)}
            </div>}

            <button className={`nav-group-toggle ${operationsPaths.includes(location.pathname) ? 'is-current' : ''}`} type="button" aria-expanded={!!expandedGroups.operations} onClick={() => toggleGroup('operations')}>
              <ClipboardList size={17} aria-hidden="true" />
              <span>Операции</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.operations && <div className="nav-group-children" aria-label="Операции">
              {([
                ['/quick-entry', 'Мой день'],
                ['/secretary', 'Секретарь'],
                ['/flash', 'Flash'],
                ['/team', 'Команда и ФОТ'],
                ['/documents', 'Документы'],
              ] as const).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)}><span>{label}</span></NavLink>)}
            </div>}

            <div className="nav-section-label nav-system-label">Настройки и инструменты</div>
            <button className={`nav-group-toggle ${toolsPaths.includes(location.pathname) ? 'is-current' : ''}`} type="button" aria-expanded={!!expandedGroups.tools} onClick={() => toggleGroup('tools')}>
              <Gauge size={17} aria-hidden="true" />
              <span>Инструменты</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.tools && <div className="nav-group-children" aria-label="Настройки и инструменты">
              <NavLink to="/ai-quality" onClick={() => setMobileMenu(false)}><FlaskConical size={16} aria-hidden="true" /><span>Лаборатория AI</span></NavLink>
              <NavLink to="/memory" onClick={() => setMobileMenu(false)}><Brain size={16} aria-hidden="true" /><span>Память STEN</span></NavLink>
              <NavLink to="/settings" onClick={() => setMobileMenu(false)}><span>Настройки</span></NavLink>
              <NavLink to="/legal" onClick={() => setMobileMenu(false)}><Scale size={16} aria-hidden="true" /><span>Правовая информация</span></NavLink>
              {user?.role === 'super_admin' && <NavLink to="/admin/organizations" onClick={() => setMobileMenu(false)}><span>Организации</span></NavLink>}
            </div>}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="avatar">{name.slice(0, 1)}</div>
            <div className="sidebar-profile-copy"><b>{name}</b><small>персональный режим</small></div>
            <button className="sidebar-logout" type="button" onClick={() => { signOut(); navigate('/unlock', { replace: true }); }} aria-label="Выйти из аккаунта" title="Выйти">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenu && <button className="backdrop" onClick={() => setMobileMenu(false)} aria-label="Закрыть меню" />}

      <main className="main">
        <header className="topbar executive-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileMenu(v => !v)} aria-label="Меню">
            {mobileMenu ? <X size={18} /> : <Menu size={18} />}
          </button>
          <button className="sidebar-toggle" onClick={() => setMobileMenu(v => !v)} aria-expanded={mobileMenu} aria-label={sidebarCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"} title={sidebarCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"}>
            {sidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>

          <div className="top-context">
            <span className="crumb">{items.find(x => x[0] === location.pathname)?.[1] || 'Рабочий контур'}</span>
            <span className="period-chip">{periodLabel} · с начала месяца</span>
          </div>



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

        <div className="content">{children}{location.pathname === '/sten' ? null : <LegalFooter />}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        {mobileItems.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => isActive || (to === '/pnl' && financePaths.includes(location.pathname)) || (to === '/quick-entry' && operationsPaths.includes(location.pathname)) ? 'active' : ''}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); viewNavigate(navigate, to); }}
          >
            <NavIcon icon={Icon} size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
