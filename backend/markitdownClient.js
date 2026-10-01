'use strict';

/**
 * STEN -> MarkItDown bridge.
 * The browser never talks to MarkItDown directly.
 * Node sends the original bytes, receives normalized Markdown, then continues
 * through the existing STEN evidence/AI pipeline.
 */

function timeoutSignal(ms) {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref?.();
  return controller.signal;
}

async function convertWithMarkItDown(buffer, name, mime, env = process.env) {
  const url = String(env.MARKITDOWN_URL || '').trim();
  const enabled = String(env.MARKITDOWN_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled || !url) return null;

  const timeoutMs = Math.max(1000, Number(env.MARKITDOWN_TIMEOUT_MS || 60000));
  const token = String(env.MARKITDOWN_TOKEN || '').trim();
  const headers = {
    'content-type': 'application/json',
    'accept': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: String(name || 'document'),
        mimeType: String(mime || 'application/octet-stream'),
        dataBase64: Buffer.from(buffer).toString('base64'),
      }),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error);
    const e = new Error(`MarkItDown недоступен: ${reason}`);
    e.code = 'MARKITDOWN_UNAVAILABLE';
    e.cause = error;
    throw e;
  }

  let payload = null;
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.error || `HTTP ${response.status}`;
    const e = new Error(`MarkItDown вернул ошибку: ${detail}`);
    e.code = 'MARKITDOWN_HTTP_ERROR';
    e.status = response.status;
    throw e;
  }

  const markdown = String(payload?.markdown || '').trim();
  if (!markdown) {
    const e = new Error('MarkItDown вернул пустой Markdown');
    e.code = 'MARKITDOWN_EMPTY';
    throw e;
  }

  return {
    markdown,
    meta: {
      engine: 'markitdown',
      engineVersion: payload?.engineVersion || null,
      sourceFormat: payload?.sourceFormat || null,
      warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
    },
  };
}

module.exports = { convertWithMarkItDown };
