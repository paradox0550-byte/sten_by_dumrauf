import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, MessageCircle, Plus, X } from 'lucide-react';
import stenAILogo from '../assets/sten-ai-logo.svg';
import './FloatingAIAssistant.css';

type AIStatus = 'ready' | 'working' | 'error';
export default function FloatingAIAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<AIStatus>('ready');
  const longPress = useRef<number | null>(null);
  const longPressed = useRef(false);
  const hidden = ['/sten', '/ai', '/unlock', '/auth', '/login'].includes(location.pathname);

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
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('sten:ai-status', onStatus);
    window.addEventListener('keydown', onKey);
    return () => {
      if (errorTimer !== undefined) window.clearTimeout(errorTimer);
      window.removeEventListener('sten:ai-status', onStatus);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => () => { if (longPress.current !== null) window.clearTimeout(longPress.current); }, []);

  if (hidden) return null;
  const openChat = () => { setMenuOpen(false); navigate('/sten'); };
  const startNew = () => { setMenuOpen(false); navigate('/sten?new=1'); };
  const openDocs = () => { setMenuOpen(false); navigate('/documents'); };
  const onPointerDown = () => {
    longPressed.current = false;
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = window.setTimeout(() => { longPressed.current = true; setMenuOpen(true); }, 550);
  };
  const onPointerEnd = () => { if (longPress.current !== null) window.clearTimeout(longPress.current); longPress.current = null; };

  return <div className="sten-floating-ai">
    {menuOpen && <div className="sten-floating-ai__menu" role="menu" aria-label="Действия STEN AI">
      <button role="menuitem" onClick={openChat}><MessageCircle size={16} />Открыть чат</button>
      <button role="menuitem" onClick={startNew}><Plus size={16} />Новый диалог</button>
      <button role="menuitem" onClick={openDocs}><FileText size={16} />Документы</button>
      <button role="menuitem" className="sten-floating-ai__close" onClick={() => setMenuOpen(false)}><X size={15} />Закрыть меню</button>
    </div>}
    <button type="button" className={`sten-floating-ai__button is-${status}`} aria-label="STEN AI: открыть чат" aria-haspopup="menu" aria-expanded={menuOpen}
      onPointerDown={onPointerDown} onPointerUp={onPointerEnd} onPointerLeave={onPointerEnd}
      onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }}
      onClick={() => { if (longPressed.current) { longPressed.current = false; return; } openChat(); }}>
      <img src={stenAILogo} alt="" aria-hidden="true" />
      <span className="sten-floating-ai__status" aria-hidden="true" />
    </button>
  </div>;
}