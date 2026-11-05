import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bot, Menu, Moon, PanelLeft, PanelLeftClose, MessageSquareText,
  LogOut, Sun, X, ClipboardList, Gauge, Monitor, Users, Settings2, FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import WorkspaceSelector from './WorkspaceSelector';
import { useScope } from '../lib/useScope';
import LegalFooter from './LegalFooter';
import { StenLogo } from './brand/StenLogo';
import InterfaceModeControl from './layout/InterfaceModeControl';

type Theme = 'light' | 'dark' | 'system';
type Scale = 'RUB' | 'THOUSAND' | 'MILLION';
type NavIconName = 'overview' | 'pnl' | 'report' | 'settings' | 'staff' | 'terms';

const NAV_ICONS: Record<NavIconName, React.ElementType> = {
  overview: Gauge,
  pnl: BarChart3,
  report: ClipboardList,
  settings: Settings2,
  staff: Users,
  terms: FileText,
};

function NavIcon({ icon, size = 17 }: { icon: LucideIcon | NavIconName; size?: number }) {
  const Icon = typeof icon === 'string' ? NAV_ICONS[icon] : icon;
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
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0B0F19' : '#F5F7FA');
};

const viewNavigate = (nav: ReturnType<typeof useNavigate>, to: string) => nav(to);

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
    return false;
  });
  const { user, signOut } = useAuth();
  const [scope, setScope] = useScope();
  const location = useLocation();
  const navigate = useNavigate();

  const financePaths = ['/pnl', '/pnl/import', '/budget', '/analytics', '/finances'];
  const operationsPaths = ['/ops', '/plan'];
  const matchesPath = (paths: string[]) => paths.some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const [financeExpanded, setFinanceExpanded] = useState(() => matchesPath(financePaths));

  const toggleFinance = () => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      setFinanceExpanded(true);
      return;
    }
    setFinanceExpanded(value => !value);
  };

  useEffect(() => {
    if (matchesPath(financePaths)) setFinanceExpanded(true);
  }, [location.pathname]);

  // System preference changes are synchronized once in main.tsx before React mounts.
  // Layout only applies the selected mode when the setting changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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
    ['/dashboard', 'Сводка'],
    ['/ops', 'Мой день'],
    ['/sten', 'Dumrauf AI'],
    ['/staff', 'Команда и ФОТ'],
    ['/pnl', 'Финансы'],
    ['/telegram-monitor', 'Мониторинг Telegram'],
    ['/settings', 'Настройки'],
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
    ['/sten', 'Dumrauf AI', Bot],
    ['/telegram-monitor', 'Мониторинг', MessageSquareText],
    ['/pnl', 'Финансы', 'pnl'],
    ['/ops', 'Мой день', 'report'],
  ] as const;

  return (
    <div className="shell executive-shell">
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div>
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><StenLogo size={34} /></div>
            <div className="brand-copy">
              <b>DUMRAUF</b>
            </div>
            <button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Закрыть меню"><X size={18} /></button>
          </div>

          <nav className="sten-primary-nav" aria-label="Навигация Dumrauf">
            <div className="nav-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
            <NavLink to="/dashboard" end onClick={() => setMobileMenu(false)}>
              <NavIcon icon="overview" size={17} />
              <span>Сводка</span>
            </NavLink>
            <NavLink to="/ops" onClick={() => setMobileMenu(false)}>
              <ClipboardList size={17} aria-hidden="true" />
              <span>Мой день</span>
            </NavLink>
            <NavLink to="/plan" onClick={() => setMobileMenu(false)}>
              <span className="nav-subitem-label">План руководителя</span>
            </NavLink>
            <NavLink to="/sten" onClick={() => setMobileMenu(false)}>
              <Bot size={17} aria-hidden="true" />
              <span>Dumrauf AI</span>
            </NavLink>
            <div className="nav-subsection" aria-label="Разделы Dumrauf AI">
              <NavLink to="/documents" onClick={() => setMobileMenu(false)}><span>Документы</span></NavLink>
              <NavLink to="/memory" onClick={() => setMobileMenu(false)}><span>Память Dumrauf</span></NavLink>
            </div>
            <NavLink to="/staff" onClick={() => setMobileMenu(false)}>
              <Users size={17} aria-hidden="true" />
              <span>Команда и ФОТ</span>
            </NavLink>

            <div className="nav-section-label">ФИНАНСЫ</div>
            <button className={`nav-group-toggle ${matchesPath(financePaths) ? 'is-current' : ''}`} type="button" aria-label="Финансы" title={sidebarCollapsed ? 'Финансы' : undefined} aria-expanded={financeExpanded} onClick={toggleFinance}>
              <BarChart3 size={17} aria-hidden="true" />
              <span>Финансы</span>
              <span className="nav-group-chevron" aria-hidden="true">{financeExpanded ? '−' : '+'}</span>
            </button>
            {(financeExpanded || mobileMenu) && <div className="nav-group-children" aria-label="Финансы">
              {([
                ['/pnl', 'P&L'],
                ['/budget', 'Бюджет'],
                ['/finances', 'Операции'],
                ['/analytics', 'Аналитика'],
              ] as const).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)}><span>{label}</span></NavLink>)}
            </div>}
            <NavLink to="/telegram-monitor" onClick={() => setMobileMenu(false)}>
              <MessageSquareText size={17} aria-hidden="true" />
              <span>Мониторинг Telegram</span>
            </NavLink>

            <div className="nav-section-label nav-system-label">УПРАВЛЕНИЕ</div>
            <NavLink to="/settings" onClick={() => setMobileMenu(false)}>
              <Settings2 size={17} aria-hidden="true" />
              <span>Настройки</span>
            </NavLink>
            <div className="nav-subsection" aria-label="Разделы настроек">
              <NavLink to="/settings#settings-profile" onClick={() => setMobileMenu(false)}><span>Аккаунт</span></NavLink>
              <NavLink to="/settings#settings-integrations" onClick={() => setMobileMenu(false)}><span>Интеграции</span></NavLink>
              {user?.role === 'super_admin' && <NavLink to="/admin/organizations" onClick={() => setMobileMenu(false)}><span>Организации</span></NavLink>}
            </div>
            {user?.role === 'super_admin' && <div className="nav-subsection" aria-label="Инструменты администратора">
              <NavLink to="/ai-quality" onClick={() => setMobileMenu(false)}><span>Лаборатория AI</span></NavLink>
            </div>}
            <NavLink to="/legal" onClick={() => setMobileMenu(false)} className={({ isActive }) => isActive ? 'nav-legal-link active' : 'nav-legal-link'}>
              <span>Правовая информация</span>
            </NavLink>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <button className="sidebar-profile-link" type="button" onClick={() => navigate('/settings#settings-profile')} aria-label="Открыть профиль">
              <div className="avatar">{name.slice(0, 1)}</div>
              <div className="sidebar-profile-copy" title={name}><b>{name}</b></div>
            </button>
            <button className="sidebar-logout" type="button" onClick={() => { signOut(); navigate('/unlock', { replace: true }); }} aria-label="Выйти из аккаунта" title="Выйти из аккаунта">
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
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}>
            {sidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
          </button>

          <div className="top-context">
            <span className="crumb">{items.find(x => location.pathname === x[0] || location.pathname.startsWith(`${x[0]}/`))?.[1] || 'Рабочий контур'}</span>
            <span className="period-chip">{periodLabel} · с начала месяца</span>
          </div>

          <div className="top-workspace">
            <WorkspaceSelector value={scope} onChange={setScope} variant="compact" />
          </div>

          {matchesPath(['/pnl', '/ops', '/budget', '/analytics', '/finances']) && <div className="global-scale" role="group" aria-label="Масштаб финансовых значений">
            {([['RUB', '₽'], ['THOUSAND', 'тыс. ₽'], ['MILLION', 'млн ₽']] as const).map(([value, label]) => (
              <button key={value} className={scale === value ? 'active' : ''} onClick={() => setScale(value)}>{label}</button>
            ))}
          </div>}

          <div className="top-actions">
            <InterfaceModeControl />
            <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')} aria-label={theme === 'dark' ? 'Тема: тёмная. Переключить тему.' : theme === 'light' ? 'Тема: светлая. Переключить тему.' : 'Тема: системная. Переключить тему.'}>
              {theme === 'dark' ? <Sun size={17} /> : theme === 'light' ? <Moon size={17} /> : <Monitor size={17} />}
            </button>
          </div>
          <div className="top-profile" title={user?.email || 'Открыть настройки аккаунта'} role="button" tabIndex={0} aria-label="Открыть настройки аккаунта" onClick={() => navigate('/settings#settings-profile')} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate('/settings#settings-profile');
            }
          }}>
            <div className="avatar">{name.slice(0, 1)}</div>
            <div className="top-profile-info">
              <b>{name}</b>
              <small>{user?.position || (user?.role === 'super_admin' ? 'Администратор' : 'Сотрудник')}</small>
            </div>
          </div>
        </header>

        <div className="content">{children}{<LegalFooter />}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        {mobileItems.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) => isActive || (to === '/pnl' && matchesPath(financePaths)) || (to === '/ops' && matchesPath(operationsPaths)) ? 'active' : ''} onClick={() => setMobileMenu(false)} onAuxClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            viewNavigate(navigate, to);
          }}>
            <NavIcon icon={Icon} size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
