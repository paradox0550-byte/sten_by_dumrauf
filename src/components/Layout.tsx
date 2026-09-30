import{useEffect,useState}from'react';
import{NavLink,useLocation,useNavigate}from'react-router-dom';
import{Activity,ArrowLeft,BarChart3,Bot,CalendarDays,FileSpreadsheet,FileText,LayoutDashboard,Menu,Moon,PanelLeft,PanelLeftClose,Settings2,ShieldCheck,Sun,Users,WalletCards,X}from'lucide-react';
import{useAuth}from'../contexts/AuthContext';
import WorkspaceSelector from'./WorkspaceSelector';
import{useScope}from'../lib/useScope';

type Theme='light'|'dark'|'system';
type DisplayScale='RUB'|'THOUSAND'|'MILLION';
const TK='sten_theme_v5',OK='sten_onboarding_v5',SK='sten_display_scale_v5',SCALE_EVT='sten-display-scale-change';

const apply=(t:Theme)=>{
  const theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;
  document.documentElement.dataset.theme=theme;
};

const readScale=():DisplayScale=>{
  try{
    const value=localStorage.getItem(SK);
    return value==='RUB'||value==='THOUSAND'||value==='MILLION'?value:'THOUSAND';
  }catch{return'THOUSAND'}
};

export default function Layout({children}:{children:React.ReactNode}){
  const[t,setT]=useState<Theme>(()=>{try{const x=localStorage.getItem(TK);return x==='light'||x==='dark'||x==='system'?x:'dark'}catch{return'dark'}});
  const[mobile,setMobile]=useState(false);
  const[intro,setIntro]=useState(false);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(()=>{try{return localStorage.getItem('sten_sidebar_collapsed')==='1'}catch{return false}});
  const[scale,setScale]=useState<DisplayScale>(readScale);
  const{user}=useAuth();
  const[scope,setScope]=useScope();
  const loc=useLocation(),nav=useNavigate();

  useEffect(()=>apply(t),[t]);
  useEffect(()=>{
    document.body.classList.toggle('sidebar-collapsed',sidebarCollapsed);
    try{localStorage.setItem('sten_sidebar_collapsed',sidebarCollapsed?'1':'0')}catch{}
  },[sidebarCollapsed]);
  useEffect(()=>{try{if(!localStorage.getItem(OK))setIntro(true)}catch{}},[]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key!=='Escape')return;
      if(intro){setIntro(false);try{localStorage.setItem(OK,'1')}catch{}}
      else setMobile(false);
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[intro]);

  const items=[
    ['/sten','STEN',Bot],['/dashboard','Дашборд',LayoutDashboard],['/flash','Flash',Activity],
    ['/pnl','P&L',FileSpreadsheet],['/budget','Бюджет',BarChart3],['/analytics','Аналитика',BarChart3],
    ['/team','Команда',Users],['/documents','Документы',FileText],['/finances','Финансы',WalletCards],
    ['/secretary','Секретарь',CalendarDays]
  ] as const;
  const mobileItems=[items[0],items[1],items[3],items[5],items[7]] as const;
  const name=user?[user.firstName,user.lastName].filter(Boolean).join(' ')||'Пользователь':'Пользователь';

  const setTheme=(value:Theme)=>{setT(value);try{localStorage.setItem(TK,value)}catch{}};
  const setDisplayScale=(value:DisplayScale)=>{
    setScale(value);
    try{localStorage.setItem(SK,value)}catch{}
    window.dispatchEvent(new CustomEvent(SCALE_EVT,{detail:value}));
  };

  return <div className="shell">
    <aside className={'sidebar '+(mobile?'is-open ':'')+(sidebarCollapsed?'is-collapsed':'')}>
      <div>
        <div className="brand">
          <div className="brand-mark"aria-hidden="true">S</div>
          <div><b>STEN</b><small>Executive Cockpit · v5.0.2</small></div>
          <button className="mobile-close"onClick={()=>setMobile(false)}aria-label="Закрыть меню"><X/></button>
        </div>
        <div className="assistant-chip"><i/>Рабочий контур<span>данные прежде декора</span></div>
        <nav aria-label="Основная навигация">
          <div className="nav-section-label">Навигация контура</div>
          {items.map(([to,label,Icon])=><NavLink key={to}to={to}end={to==='/sten'}onClick={()=>setMobile(false)}><Icon size={17}/><span>{label}</span></NavLink>)}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <div className="security-boundary"aria-label="Граница безопасности">
          <div><ShieldCheck size={14}/><span>SECURITY BOUNDARY</span><i/></div>
          <small>Browser → API Gateway → STEN API</small>
          <small>JWT session · no direct database access</small>
        </div>
        <div className="profile-row">
          <div className="avatar">{name.slice(0,1)}</div>
          <div><b>{name}</b><small>персональный режим</small></div>
        </div>
      </div>
    </aside>

    {mobile&&<button className="backdrop"onClick={()=>setMobile(false)}aria-label="Закрыть меню"/>}

    <main className="main">
      <header className="topbar">
        <button className="icon-button mobile-menu"onClick={()=>setMobile(v=>!v)}aria-label="Меню">{mobile?<X/>:<Menu/>}</button>
        <button className="sidebar-toggle"onClick={()=>setSidebarCollapsed(v=>!v)}aria-label={sidebarCollapsed?'Показать меню':'Скрыть меню'}>{sidebarCollapsed?<PanelLeft size={17}/>:<PanelLeftClose size={17}/>}</button>
        <span className="crumb">{items.find(x=>x[0]===loc.pathname)?.[1]||'Рабочий контур'}</span>
        <div className="top-workspace"><WorkspaceSelector value={scope} onChange={setScope} variant="compact"/></div>

        <div className="global-scale"role="group"aria-label="Масштаб финансовых значений">
          {([['RUB','₽'],['THOUSAND','тыс. ₽'],['MILLION','млн ₽']] as const).map(([value,label])=>
            <button key={value}className={scale===value?'active':''}onClick={()=>setDisplayScale(value)}>{label}</button>
          )}
        </div>

        <div className="security-status"title="Браузер обращается к данным только через API Gateway">
          <ShieldCheck size={14}/><span>API BOUNDARY</span><i/><b>JWT</b>
        </div>

        <div className="top-actions">
          {loc.pathname!=='/sten'&&<button className="icon-button"onClick={()=>nav('/sten')}aria-label="STEN"><ArrowLeft size={17}/></button>}
          <button className="icon-button"onClick={()=>nav('/settings')}aria-label="Настройки"><Settings2 size={17}/></button>
          <button className="icon-button"onClick={()=>setTheme(t==='dark'?'light':'dark')}aria-label="Переключить тему">{t==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>
        </div>
      </header>

      <div className="content">{children}</div>
    </main>

    <nav className="mobile-nav"aria-label="Мобильная навигация">
      {mobileItems.map(([to,label,Icon])=><NavLink key={to}to={to}end={to==='/sten'}><Icon size={17}/><span>{label==='Дашборд'?'Сводка':label}</span></NavLink>)}
      <button className="mobile-nav-settings"onClick={()=>nav('/settings')}aria-label="Настройки"><Settings2 size={17}/><span>Настройки</span></button>
    </nav>

    {intro&&<div className="modal-backdrop">
      <section className="modal-card">
        <button className="modal-close"onClick={()=>{setIntro(false);try{localStorage.setItem(OK,'1')}catch{}}}aria-label="Закрыть"><X/></button>
        <small>STEN · MASTER SYSTEM</small><h2>Рабочий контур готов</h2>
        <div className="onboard-grid">
          <div><b>01 · Факты</b><p>Нет данных ≠ ноль. Источник всегда важнее оформления.</p></div>
          <div><b>02 · Расчёт</b><p>Сначала детерминированная математика, затем интерпретация STEN.</p></div>
          <div><b>03 · Действие</b><p>Отклонение должно приводить к понятному следующему шагу.</p></div>
        </div>
        <button className="primary-button"onClick={()=>{setIntro(false);try{localStorage.setItem(OK,'1')}catch{}}}>Начать работу</button>
      </section>
    </div>}
  </div>;
}