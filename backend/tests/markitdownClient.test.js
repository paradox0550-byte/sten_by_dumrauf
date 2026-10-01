const test = require('node:test');
const assert = require('node:assert/strict');
const { convertWithMarkItDown } = require('../markitdownClient');

test('MarkItDown bridge is inert when disabled', async () => {
  const result = await convertWithMarkItDown(Buffer.from('hello'), 'a.txt', 'text/plain', {
    MARKITDOWN_ENABLED: 'false',
    MARKITDOWN_URL: '',
  });
  assert.equal(result, null);
});

test('MarkItDown bridge returns normalized markdown', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.name, 'report.docx');
    assert.equal(Buffer.from(body.dataBase64, 'base64').toString(), 'hello');
    return new Response(JSON.stringify({
      markdown: '# Report\n\nRevenue: 100',
      engine: 'markitdown',
      engineVersion: '0.1.8',
      sourceFormat: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      warnings: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await convertWithMarkItDown(Buffer.from('hello'), 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', {
      MARKITDOWN_ENABLED: 'true',
      MARKITDOWN_URL: 'https://markitdown.internal/convert',
      MARKITDOWN_TIMEOUT_MS: '1000',
      MARKITDOWN_TOKEN: 'secret-test-token',
    });
    assert.equal(result.markdown, '# Report\n\nRevenue: 100');
    assert.equal(result.meta.engine, 'markitdown');
  } finally {
    global.fetch = originalFetch;
  }
});

test('MarkItDown bridge rejects non-2xx responses', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    error: { code: 'CONVERSION_FAILED', message: 'bad file' },
  }), { status: 422, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      () => convertWithMarkItDown(Buffer.from('bad'), 'bad.pdf', 'application/pdf', {
        MARKITDOWN_ENABLED: 'true',
        MARKITDOWN_URL: 'https://markitdown.internal/convert',
      }),
      (error) => error.code === 'MARKITDOWN_HTTP_ERROR' && error.status === 422,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
