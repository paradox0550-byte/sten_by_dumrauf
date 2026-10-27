import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bot, Brain, CalendarDays, Menu, Moon, PanelLeft, PanelLeftClose, FlaskConical,
  LogOut, Scale, Sun, WalletCards, X, ChevronDown, ClipboardList, Gauge, Monitor, Users, FileText, Settings2, Building2,
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
    ?.setAttribute('content', resolved === 'dark' ? '#0B1015' : '#F3F5F7');
};

const viewNavigate = (nav: ReturnType<typeof useNavigate>, to: string) => {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as Document & { startViewTransition?: (callback: () => void) => void }).startViewTransition?.(() => nav(to));
  } else {
    nav(to);
  }
};

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
  const operationsPaths = ['/ops', '/plan'];
  const teamPaths = ['/staff'];
  const knowledgePaths = ['/documents', '/memory'];
  const toolsPaths = ['/ai-quality', '/legal', '/admin/organizations'];
  const matchesPath = (paths: string[]) => paths.some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({
    finance: matchesPath(financePaths),
    operations: matchesPath(operationsPaths),
    team: matchesPath(teamPaths),
    knowledge: matchesPath(knowledgePaths),
    tools: matchesPath(toolsPaths),
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
    if (matchesPath(financePaths)) setExpandedGroups(current => ({ ...current, finance: true }));
    if (matchesPath(operationsPaths)) setExpandedGroups(current => ({ ...current, operations: true }));
    if (matchesPath(teamPaths)) setExpandedGroups(current => ({ ...current, team: true }));
    if (matchesPath(knowledgePaths)) setExpandedGroups(current => ({ ...current, knowledge: true }));
    if (matchesPath(toolsPaths)) setExpandedGroups(current => ({ ...current, tools: true }));
  }, [location.pathname]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => applyTheme('system');
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
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
    ['/dashboard', 'Главная', 'overview'],
    ['/sten', 'STEN AI', Bot],
    ['/ai-quality', 'Лаборатория AI', FlaskConical],
    ['/ops', 'Отчёт смены', 'report'],
    ['/plan', 'План руководителя', CalendarDays],
    ['/pnl', 'P&L', 'pnl'],
    ['/budget', 'Бюджет', BarChart3],
    ['/analytics', 'Аналитика', BarChart3],
    ['/staff', 'Команда и ФОТ', 'staff'],
    ['/documents', 'Документы', 'terms'],
    ['/finances', 'Финансовые операции', WalletCards],
    ['/memory', 'Память STEN', Brain],
    ['/settings', 'Настройки', Gauge],
    ['/legal', 'Правовая информация', Scale],
    ['/admin/organizations', 'Организации', Gauge],
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
    ['/ops', 'Операции', ClipboardList],
  ] as const;

  return (
    <div className="shell executive-shell">
      <aside className={`sidebar ${mobileMenu ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div>
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><StenLogo size={34} /></div>
            <div className="brand-copy">
              <b>STEN</b>
              <small>Рабочий кабинет</small>
            </div>
            <button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Закрыть меню"><X size={18} /></button>
          </div>

          <nav className="sten-primary-nav" aria-label="Навигация STEN">
            <div className="nav-section-label">Рабочее пространство</div>
            <NavLink to="/dashboard" end onClick={() => setMobileMenu(false)}>
              <NavIcon icon="overview" size={17} />
              <span>Главная</span>
            </NavLink>
            <NavLink to="/sten" onClick={() => setMobileMenu(false)}>
              <Bot size={17} aria-hidden="true" />
              <span>STEN AI</span>
            </NavLink>

            <button className={`nav-group-toggle ${matchesPath(financePaths) ? 'is-current' : ''}`} type="button" aria-label="Финансы" title={sidebarCollapsed ? 'Финансы' : undefined} aria-expanded={!!expandedGroups.finance} onClick={() => toggleGroup('finance')}>
              <BarChart3 size={17} aria-hidden="true" />
              <span>Финансы</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.finance && <div className="nav-group-children" aria-label="Финансы">
              {([
                ['/pnl', 'P&L'],
                ['/budget', 'Бюджет'],
                ['/finances', 'Финансовые операции'],
                ['/analytics', 'Аналитика'],
              ] as const).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)}><span>{label}</span></NavLink>)}
            </div>}

            <button className={`nav-group-toggle ${matchesPath(operationsPaths) ? 'is-current' : ''}`} type="button" aria-label="Мой день" title={sidebarCollapsed ? 'Мой день' : undefined} aria-expanded={!!expandedGroups.operations} onClick={() => toggleGroup('operations')}>
              <ClipboardList size={17} aria-hidden="true" />
              <span>Мой день</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.operations && <div className="nav-group-children" aria-label="Мой день">
              {([
                ['/ops', 'Отчёт смены'],
                ['/plan', 'План руководителя'],
              ] as const).map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobileMenu(false)}><span>{label}</span></NavLink>)}
            </div>}

            <button className={"nav-group-toggle " + (matchesPath(teamPaths) ? 'is-current' : '')} type="button" aria-label="Команда и ФОТ" title={sidebarCollapsed ? 'Команда и ФОТ' : undefined} aria-expanded={!!expandedGroups.team} onClick={() => toggleGroup('team')}>
              <Users size={17} aria-hidden="true" />
              <span>Команда и ФОТ</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.team && <div className="nav-group-children" aria-label="Команда и ФОТ">
              <NavLink to="/staff" onClick={() => setMobileMenu(false)}><Users size={16} aria-hidden="true" /><span>Команда и ФОТ</span></NavLink>
            </div>}

            <button className={`nav-group-toggle ${matchesPath(knowledgePaths) ? 'is-current' : ''}`} type="button" aria-label="Знания" title={sidebarCollapsed ? 'Знания' : undefined} aria-expanded={!!expandedGroups.knowledge} onClick={() => toggleGroup('knowledge')}>
              <Brain size={17} aria-hidden="true" />
              <span>Знания</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.knowledge && <div className="nav-group-children" aria-label="Знания">
              <NavLink to="/documents" onClick={() => setMobileMenu(false)}><FileText size={16} aria-hidden="true" /><span>Документы</span></NavLink>
              <NavLink to="/memory" onClick={() => setMobileMenu(false)}><Brain size={16} aria-hidden="true" /><span>Память STEN</span></NavLink>
            </div>}

            <div className="nav-section-label nav-system-label">Профиль и управление</div>
            <NavLink to="/settings" onClick={() => setMobileMenu(false)}>
              <Settings2 size={17} aria-hidden="true" />
              <span>Настройки</span>
            </NavLink>

            <button className={`nav-group-toggle ${matchesPath(toolsPaths) ? 'is-current' : ''}`} type="button" aria-label="Дополнительно" title={sidebarCollapsed ? 'Дополнительно' : undefined} aria-expanded={!!expandedGroups.tools} onClick={() => toggleGroup('tools')}>
              <Scale size={17} aria-hidden="true" />
              <span>Дополнительно</span>
              <ChevronDown className="nav-group-chevron" size={15} aria-hidden="true" />
            </button>
            {expandedGroups.tools && <div className="nav-group-children" aria-label="Дополнительно">
              <NavLink to="/ai-quality" onClick={() => setMobileMenu(false)}><FlaskConical size={16} aria-hidden="true" /><span>Лаборатория AI</span></NavLink>
              <NavLink to="/legal" onClick={() => setMobileMenu(false)}><Scale size={16} aria-hidden="true" /><span>Правовая информация</span></NavLink>
              {user?.role === 'super_admin' && <NavLink to="/admin/organizations" onClick={() => setMobileMenu(false)}><Building2 size={16} aria-hidden="true" /><span>Организации</span></NavLink>}
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
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'} title={sidebarCollapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}>
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
            <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')} aria-label={theme === 'dark' ? 'Тема: тёмная. Переключить на светлую' : theme === 'light' ? 'Тема: светлая. Переключить на системную' : 'Тема: системная. Переключить на тёмную'} title={theme === 'dark' ? 'Тёмная тема' : theme === 'light' ? 'Светлая тема' : 'Системная тема'}>
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

        <div className="content">{children}{location.pathname === '/sten' ? null : <LegalFooter />}</div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        {mobileItems.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) => isActive || (to === '/pnl' && matchesPath(financePaths)) || (to === '/ops' && matchesPath(operationsPaths)) ? 'active' : ''} onClick={(event) => {
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