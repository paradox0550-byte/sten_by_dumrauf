import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ladar } from '../features/ladar/Ladar';
import type { LadarServerStatus, LadarVisualState } from '../features/ladar/useLadarState';
import './dev-ladar.css';

const demoStatuses: Record<LadarVisualState, LadarServerStatus> = {
  idle: { source: 'server', state: 'idle' },
  analyzing: { source: 'server', state: 'analyzing' },
  deviation: { source: 'server', state: 'deviation', confirmed: true, explanation: 'Демонстрационный сценарий: факт выше плана. Это тестовые данные, не сигнал реального ресторана.' },
  complete: { source: 'server', state: 'complete' },
};
const states: LadarVisualState[] = ['idle', 'analyzing', 'deviation', 'complete'];

export default function DevLadar() {
  const [selected, setSelected] = useState<LadarVisualState>('idle');
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);
  const [focused, setFocused] = useState(false);
  const status = showUnconfirmed
    ? { source: 'server' as const, state: 'deviation' as const, confirmed: false, explanation: 'Не должно отображаться как отклонение' }
    : demoStatuses[selected];

  return (
    <main className="dev-ladar">
      <header className="dev-ladar__header">
        <div>
          <p className="dev-ladar__eyebrow">STEN · DEV TOOLS</p>
          <h1>Ладар</h1>
          <p>Проверка глифа, состояний и доступности. Все сценарии на странице демонстрационные, не отражают данные ресторанов.</p>
        </div>
        <Link to="/sten">Вернуться в STEN AI</Link>
      </header>

      <section className="dev-ladar__panel" aria-labelledby="ladar-states-title">
        <h2 id="ladar-states-title">Состояния</h2>
        <div className="dev-ladar__controls" role="group" aria-label="Выбор демонстрационного состояния">
          {states.map(state => <button key={state} type="button" aria-pressed={selected === state && !showUnconfirmed} onClick={() => { setSelected(state); setShowUnconfirmed(false); }}>{state}</button>)}
          <button type="button" aria-pressed={showUnconfirmed} onClick={() => setShowUnconfirmed(true)}>неподтверждённый сигнал</button>
        </div>
        {showUnconfirmed && <p className="dev-ladar__note" role="status">Проверка защиты: неподтверждённый сигнал должен выглядеть как обычное наблюдение.</p>}
        <div className="dev-ladar__preview">
          {[24, 32, 48].map(size => <div className="dev-ladar__sample" key={size}><Ladar size={size as 24 | 32 | 48} status={status} onExplain={() => setFocused(true)} /><span>{size} px</span></div>)}
        </div>
      </section>

      <section className="dev-ladar__panel" aria-labelledby="ladar-motion-title">
        <h2 id="ladar-motion-title">Доступность и объяснение</h2>
        <p>В режиме уменьшенного движения зрачок остаётся неподвижным. Предупреждение всегда сопровождается текстом.</p>
        <p id="ladar-explanation" tabIndex={-1} className="dev-ladar__explanation">{focused ? 'Демонстрационное объяснение: факт сравнивается с планом на одном периоде. Источник и формула должны быть доступны до принятия решения.' : 'Выберите состояние «deviation», чтобы проверить переход к объяснению.'}</p>
        <Ladar size={32} status={demoStatuses.deviation} explanationTargetId="ladar-explanation" />
      </section>
    </main>
  );
}
