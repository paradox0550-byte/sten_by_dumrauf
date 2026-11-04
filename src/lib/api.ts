import type { Memory, MemoryCreatePayload, MemoryFilters, MemoryListResponse, MemoryConfidence } from './contracts/memory';
import { uuid } from './uuid';

export const AUTH_EXPIRED_EVENT = 'sten-auth-expired';
const SERVICE_UNAVAILABLE_EVENT = 'sten-service-unavailable';
const SERVICE_RESTORED_EVENT = 'sten-service-restored';

const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

let lastServiceState: 'unknown' | 'available' | 'unavailable' = 'unknown';

function emitStatusEvent(name: string) {
  try {
    if (typeof window === 'undefined') return;
    if (name === SERVICE_UNAVAILABLE_EVENT) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (lastServiceState === 'unavailable') return;
      lastServiceState = 'unavailable';
    } else if (name === SERVICE_RESTORED_EVENT) {
      if (lastServiceState !== 'unavailable') return;
      lastServiceState = 'available';
    }
    window.dispatchEvent(new Event(name));
  } catch { /* ignore status reporting failures */ }
}

function dispatchAuthExpired() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  } catch { /* ignore event dispatch failures */ }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = 'UNKNOWN_ERROR',
    public requestId?: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function baseUrl() {
  return String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
}

function token() {
  try { return localStorage.getItem('token'); } catch { return null; }
}

export function clearSession() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('sten_user');
    localStorage.removeItem('sten_chat_v5');
    localStorage.removeItem('sten_scope_v5');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('sten_chat_v5:') || key?.startsWith('sten_scope_v5:')) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* ignore storage failures */ }
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  retry?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function waitBeforeRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new ApiError('Запрос отменён.', 0, 'ABORTED'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new ApiError('Запрос отменён.', 0, 'ABORTED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function req<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const id = uuid();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': id,
  };
  const authToken = token();
  const base = baseUrl();

  if (!base) throw new ApiError('Рабочий API не настроен.', 0, 'API_NOT_CONFIGURED', id);
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const timeoutMs = Math.max(1, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const requestedRetries = opts.retry ?? 1;
  const maxRetries = method === 'GET' && Number.isFinite(requestedRetries)
    ? Math.max(0, Math.min(Math.floor(requestedRetries), 3))
    : 0;

  let attempt = 0;
  for (;;) {
    if (opts.signal?.aborted) {
      throw new ApiError('Запрос отменён.', 0, 'ABORTED', id);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        if (response.status >= 500) emitStatusEvent(SERVICE_UNAVAILABLE_EVENT);

        const error = (payload as any)?.error;
        const code: string = error?.code || `HTTP_${response.status}`;

        if (response.status === 401 && (!path.startsWith('/auth/') || path === '/auth/me')) {
          clearSession();
          dispatchAuthExpired();
        }
        if (attempt < maxRetries && response.status >= 500) {
          attempt++;
          await waitBeforeRetry(300 * attempt, opts.signal);
          continue;
        }

        throw new ApiError(
          typeof error === 'string' ? error : error?.message || `HTTP ${response.status}`,
          response.status,
          code,
          error?.requestId || id,
          typeof error?.field === 'string'
            ? error.field
            : typeof error?.details?.field === 'string'
              ? error.details.field
              : undefined,
        );
      }

      emitStatusEvent(SERVICE_RESTORED_EVENT);
      return ((payload as any)?.data ?? payload) as T;
    } catch (caught) {
      if (caught instanceof ApiError) throw caught;

      if (caught instanceof Error && caught.name === 'AbortError') {
        if (opts.signal?.aborted) {
          throw new ApiError('Запрос отменён.', 0, 'ABORTED', id);
        }
        emitStatusEvent(SERVICE_UNAVAILABLE_EVENT);
        throw new ApiError('Превышено время ожидания.', 0, 'TIMEOUT', id);
      }

      if (attempt < maxRetries) {
        attempt++;
        await waitBeforeRetry(300 * attempt, opts.signal);
        continue;
      }

      emitStatusEvent(SERVICE_UNAVAILABLE_EVENT);
      throw new ApiError('Нет связи с рабочим сервером.', 0, 'NETWORK_ERROR', id);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
}

export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) => req<T>('GET', path, undefined, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => req<T>('POST', path, body, opts),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => req<T>('PUT', path, body, opts),
  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => req<T>('PATCH', path, body, opts),
  delete: <T = unknown>(path: string, opts?: RequestOptions) => req<T>('DELETE', path, undefined, opts),
};

/* ---------- Memory ---------- */

export async function listMemory(filters: MemoryFilters = {}): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.restaurant_id) params.set('restaurant_id', filters.restaurant_id);
  if (filters.since) params.set('since', filters.since);
  if (filters.limit !== undefined) {
    const safeLimit = Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(Math.trunc(filters.limit), 50))
      : 50;
    params.set('limit', String(safeLimit));
  }
  if (filters.confidence) params.set('confidence', filters.confidence);
  const query = params.toString();
  return api.get<MemoryListResponse>('/api/ai/memory' + (query ? '?' + query : ''));
}

export async function createMemory(data: MemoryCreatePayload): Promise<Memory> {
  const response = await api.post<{ memory: Memory }>('/api/ai/memory', data);
  return response.memory;
}

export async function updateMemoryConfidence(
  id: string,
  confidence: Extract<MemoryConfidence, 'confirmed' | 'rejected'>,
): Promise<Memory> {
  const response = await api.patch<{ memory: Memory }>(
    '/api/ai/memory/' + encodeURIComponent(id),
    { confidence },
  );
  return response.memory;
}

export async function deleteMemory(id: string): Promise<void> {
  await api.delete('/api/ai/memory/' + encodeURIComponent(id));
}
