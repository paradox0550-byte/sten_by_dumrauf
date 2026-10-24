'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  searchTerms,
  loadConversationContext,
  startConversationTurn,
  finishConversationTurn,
  failConversationTurn,
} = require('../core/conversationMemory');

const user = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId: '11111111-1111-4111-8111-111111111111',
};
const scope = {
  restaurant_id: '33333333-3333-4333-8333-333333333333',
  project_id: '',
  branch_id: '',
  department_id: '',
};

test('conversation search terms remove common Russian stop words', () => {
  const terms = searchTerms('Что я говорил про мотивацию управляющего и премию?');
  assert.ok(terms.includes('мотивацию'));
  assert.ok(terms.includes('управляющего'));
  assert.ok(terms.includes('премию'));
  assert.ok(!terms.includes('говорил'));
  assert.ok(!terms.includes('что'));
});

test('conversation retrieval is user-scoped and includes recent plus relevant turns', async () => {
  const calls = [];
  const recent = [{
    id: 'recent-1',
    user_text: 'Мы решили обновить мотивацию',
    assistant_text: 'Зафиксировал обсуждение',
    created_at: '2026-10-20T10:00:00.000Z',
    status: 'complete',
  }];
  const relevant = [{
    id: 'relevant-1',
    user_text: 'Какая была формула премии управляющего?',
    assistant_text: 'Обсуждали формулу из документа',
    created_at: '2026-10-19T10:00:00.000Z',
    status: 'complete',
  }];
  const ctx = {
    async queryWithRetry(sql, params, options) {
      calls.push({ sql, params, options });
      return { rows: sql.includes('position(') ? relevant : recent };
    },
  };
  const result = await loadConversationContext(user, scope, 'Напомни формулу премии управляющего', ctx);
  assert.equal(result.turns.length, 2);
  assert.match(result.text, /формула премии управляющего/);
  assert.ok(calls.every(call => call.params[0] === user.organizationId));
  assert.ok(calls.every(call => call.params[1] === user.id));
  assert.ok(calls.every(call => call.sql.includes('restaurant_id')));
  assert.ok(calls.every(call => call.sql.includes('user_id=$2')));
});

test('conversation turn is persisted and completed only for its owner', async () => {
  const calls = [];
  const ctx = {
    async queryWithRetry(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('UPDATE')) return { rows: [{ id: params[2] || params[1] }] };
      return { rows: [{ id: params[0] }] };
    },
  };
  const id = await startConversationTurn(user, scope, 'Запомни обсуждение', ctx);
  assert.match(id, /^[0-9a-f-]{36}$/i);
  assert.ok(calls[0].sql.includes('INSERT INTO ai_conversation_turns'));
  assert.equal(await finishConversationTurn(user, id, 'Ответ STEN', [{ name: 'search_documents', ok: true }], ctx), true);
  assert.ok(calls[1].sql.includes('user_id=$5'));
  assert.equal(await failConversationTurn(user, id, 'Ошибка', ctx), true);
});
