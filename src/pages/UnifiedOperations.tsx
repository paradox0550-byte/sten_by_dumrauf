import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, ArrowUpRight } from 'lucide-react';
import OperationalControlPage from './OperationalControlPage';
import Secretary from './Secretary';
import './UnifiedOperations.css';

/**
 * Shared operations workspace for My Day, Manager Plan and Secretary.
 * Existing feature pages remain the source of truth for their own data/actions.
 * Manager Plan currently has no separate page implementation: /plan renders Secretary.
 */
export default function UnifiedOperations() {
  const location = useLocation();
  const navigate = useNavigate();
  const planningView = location.pathname === '/plan' || location.pathname === '/secretary';
  const active = planningView ? 'planning' : 'day';

  return (
    <main className="sten-operations">
      <header className="sten-operations__header">
        <div className="sten-operations__heading">
          <span className="sten-operations__eyebrow">STEN · OPERATIONS</span>
          <h1>Операционный центр</h1>
          <p>Смена, план действий и контроль задач — в одном рабочем пространстве.</p>
        </div>
        <div className="sten-operations__status"><span aria-hidden="true" /> Единый рабочий контур</div>
      </header>

      <nav className="sten-operations__nav" aria-label="Операционный центр">
        <button type="button" className={active === 'day' ? 'is-active' : ''} aria-current={active === 'day' ? 'page' : undefined} onClick={() => navigate('/ops')}>
          <CalendarDays size={18} />
          <span><b>Мой день</b><small>Факты смены и показатели</small></span>
          <ArrowUpRight className="sten-operations__arrow" size={16} />
        </button>
        <button type="button" className={active === 'planning' ? 'is-active' : ''} aria-current={active === 'planning' ? 'page' : undefined} onClick={() => navigate('/plan')}>
          <ClipboardCheck size={18} />
          <span><b>План руководителя</b><small>Поручения, события и секретарь</small></span>
          <ArrowUpRight className="sten-operations__arrow" size={16} />
        </button>
      </nav>

      <section className="sten-operations__content" aria-label={active === 'day' ? 'Мой день' : 'План руководителя и секретарь'}>
        {active === 'day' ? <OperationalControlPage /> : <Secretary />}
      </section>
    </main>
  );
}
