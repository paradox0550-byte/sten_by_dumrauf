/* Единый рабочий контекст (scope) для всех страниц: период + проект → филиал →
   ресторан → отдел. Выбранный scope сохраняется локально и синхронизируется
   между всеми компонентами (Layout, Настройки) через кастомное событие. */
import { useEffect, useState } from 'react';
import { DEFAULT_PERIOD, Scope, scopeKey } from './scope';

const KEY = 'sten_scope_v5';
const EVT = 'sten-scope-change';

function readSaved(): Scope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Scope;
      if (typeof s === 'object' && s && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s.period || ''))) return s;
    }
  } catch { /* повреждённое хранилище — стартуем с чистого контекста */ }
  return { period: DEFAULT_PERIOD };
}

export function useScope(): [Scope, (next: Scope) => void] {
  const [scope, setScope] = useState<Scope>(readSaved);

  useEffect(() => {
    const onChange = () => setScope(readSaved());
    window.addEventListener(EVT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const update = (next: Scope) => {
    setScope(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
    window.dispatchEvent(new Event(EVT));
  };

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(scope)); } catch { /* приватный режим */ }
  }, [scopeKey(scope)]);

  return [scope, update];
}

export { hasScopeId } from './scope';