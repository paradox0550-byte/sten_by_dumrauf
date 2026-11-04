import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, listMemory, UPLOAD_TIMEOUT_MS } from './api';

const API_URL = 'https://api.example.test';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('API client', () => {
  it('caps memory list limit at backend maximum 50', async () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { memories: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await listMemory({ limit: 200 });

    expect(String(fetchMock.mock.calls[0][0])).toBe(API_URL + '/api/ai/memory?limit=50');
  });

  it('supports caller AbortSignal and reports cancellation separately from network errors', async () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = api.get('/slow', { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('retries transient GET 5xx once by default', async () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'TEMPORARY', message: 'Try again' } }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears the session and emits auth expiry for a closed organization', async () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener('sten-auth-expired', handler);
    vi.stubGlobal('window', target);
    vi.stubGlobal('localStorage', {
      removeItem: vi.fn(),
      getItem: vi.fn(() => 'token'),
      get length() { return 0; },
      key: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'ORG_ACCESS_CLOSED', message: 'Access closed' } }, 403),
    ));

    await expect(api.get('/api/pnl')).rejects.toMatchObject({ code: 'ORG_ACCESS_CLOSED' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not expire a session for invalid login credentials', async () => {
    vi.stubEnv('VITE_API_URL', API_URL);
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener('sten-auth-expired', handler);
    vi.stubGlobal('window', target);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' } }, 401),
    ));

    await expect(api.post('/auth/login', { email: 'x@example.test', password: 'bad' }))
      .rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('exports the extended document upload timeout', () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
  });
});
