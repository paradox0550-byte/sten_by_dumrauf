/* Единый рабочий контекст (scope) для всех страниц: период + проект → филиал →
   ресторан → отдел. Выбранный scope сохраняется локально и синхронизируется
   между всеми компонентами (Layout, Настройки) через кастомное событие. */
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_PERIOD, Scope, scopeKey } from './scope';
import { api } from './api';

const LEGACY_KEY = 'sten_scope_v5';
const EVT = 'sten-scope-change';
function storageKey(user:{id?:string;organizationId?:string|null}|null){return user?.id?`sten_scope_v5:${user.organizationId||'no-org'}:${user.id}`:null;}
function readSaved(key:string|null): Scope {
  try {
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) {
      const s = JSON.parse(raw) as Scope;
      if (typeof s === 'object' && s && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s.period || ''))) return s;
    }
  } catch { /* повреждённое хранилище — стартуем с чистого контекста */ }
  return { period: DEFAULT_PERIOD };
}

export function useScope(): [Scope, (next: Scope) => void] {
  const { user } = useAuth();
  const key = storageKey(user);
  const [scope, setScope] = useState<Scope>(() => readSaved(key));

  useEffect(() => {
    setScope(readSaved(key));
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* приватный режим */ }
    void api.get<any>('/api/b2b/context').then((r:any) => {
      const c = r?.context ?? r?.data?.context;
      if (!c) return;
      setScope(prev => ({
        ...prev,
        projectId: c.project_id || undefined,
        branchId: c.branch_id || undefined,
        restaurantId: c.restaurant_id || undefined,
        departmentId: c.department_id || undefined,
      }));
    }).catch(() => { /* server context недоступен — остаёмся на локальном scope */ });
    const onChange = () => setScope(readSaved(key));
    window.addEventListener(EVT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [key]);

  const update = (next: Scope) => {
    setScope(next);
    void api.put('/api/b2b/context', {
      restaurant_id: next.restaurantId ?? null,
      project_id: next.projectId ?? null,
      branch_id: next.branchId ?? null,
      department_id: next.departmentId ?? null,
    }).catch(() => { /* локальный scope остаётся рабочим при временной недоступности API */ });
    try { if (key) localStorage.setItem(key, JSON.stringify(next)); } catch { /* приватный режим */ }
    window.dispatchEvent(new Event(EVT));
  };

  useEffect(() => {
    try { if (key) localStorage.setItem(key, JSON.stringify(scope)); } catch { /* приватный режим */ }
  }, [scopeKey(scope), key]);

  return [scope, update];
}

export { hasScopeId } from './scope';