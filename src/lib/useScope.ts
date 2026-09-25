/* Единый рабочий контекст (scope) для всех страниц: период + проект → филиал →
   ресторан → отдел. Выбранный scope сохраняется локально (это настройка
   рабочего пространства, а не финансовые данные) и восстанавливается при
   переходе между разделами — все страницы работают в одном контексте. */
import { useEffect, useState } from 'react';
import { DEFAULT_PERIOD, Scope, hasScopeId, scopeKey } from './scope';

const KEY = 'sten_scope_v5';

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
    try { localStorage.setItem(KEY, JSON.stringify(scope)); } catch { /* приватный режим */ }
  }, [scopeKey(scope)]);
  return [scope, setScope];
}

export { hasScopeId };
