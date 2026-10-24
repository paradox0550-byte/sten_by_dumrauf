'use strict';

const { randomUUID } = require('crypto');

const SCOPE_KEYS = ['project_id', 'branch_id', 'restaurant_id', 'department_id'];
const STOP_WORDS = new Set([
  'что','это','как','где','когда','который','которая','которые','мне','меня','тебе','тебя',
  'есть','был','была','были','будет','быть','для','или','если','уже','ещё','могу','может',
  'пожалуйста','скажи','расскажи','покажи','найди','проверь','сделай','сейчас','почему',
  'какой','какая','какие','сколько','всего','нужно','надо','можно','про','при','после',
  'перед','между','этот','эта','эти','того','тогда','там','тут','моя','мой','мои','твоя',
  'твой','твои','прошу','спасибо','привет','здравствуй','помнишь','говорил','говорила',
]);

function normalizeScope(scope = {}) {
  return Object.fromEntries(SCOPE_KEYS.map(key => [key, scope?.[key] ? String(scope[key]) : '']));
}

function searchTerms(value) {
  return [...new Set(
    String(value || '').normalize('NFC').toLocaleLowerCase('ru-RU')
      .match(/[a-zа-яё0-9]{3,}/giu)
      ?.filter(term => !STOP_WORDS.has(term)) || []
  )].slice(0, 8);
}

function scopeWhere(scope, params) {
  const normalized = normalizeScope(scope);
  const clauses = [];
  for (const key of SCOPE_KEYS) {
    const value = normalized[key];
    if (value) {
      params.push(value);
      clauses.push(`(COALESCE(scope_json->>'${key}', '') = '' OR scope_json->>'${key}' = $${params.length})`);
    } else {
      clauses.push(`COALESCE(scope_json->>'${key}', '') = ''`);
    }
  }
  return clauses.length ? ' AND ' + clauses.join(' AND ') : '';
}

async function loadConversationContext(user, scope, question, ctx = {}) {
  if (!user?.id || !user?.organizationId || typeof ctx.queryWithRetry !== 'function') {
    return { turns: [], text: '', terms: [] };
  }
  const params = [user.organizationId, String(user.id)];
  const scoped = scopeWhere(scope, params);
  const base = `organization_id=$1::uuid AND user_id=$2${scoped}`;
  const latest = await ctx.queryWithRetry(
    `SELECT id, user_text, assistant_text, status, created_at, scope_json
       FROM ai_conversation_turns WHERE ${base}
      ORDER BY created_at DESC LIMIT 6`,
    params,
    { orgId: user.organizationId }
  );
  const terms = searchTerms(question);
  let relevant = { rows: [] };
  if (terms.length) {
    const searchParams = [...params];
    const predicates = terms.map(term => {
      searchParams.push(term);
      return `(position($${searchParams.length} in lower(COALESCE(user_text,'') || ' ' || COALESCE(assistant_text,''))) > 0)`;
    });
    searchParams.push(8);
    relevant = await ctx.queryWithRetry(
      `SELECT id, user_text, assistant_text, status, created_at, scope_json
         FROM ai_conversation_turns
        WHERE ${base} AND (${predicates.join(' OR ')})
        ORDER BY created_at DESC LIMIT $${searchParams.length}`,
      searchParams,
      { orgId: user.organizationId }
    );
  }
  const unique = new Map();
  for (const row of [...(latest.rows || []), ...(relevant.rows || [])]) unique.set(row.id, row);
  const turns = [...unique.values()]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-10);
  let budget = 10000;
  const lines = [];
  for (const turn of turns) {
    const userText = String(turn.user_text || '').slice(0, 1600);
    const assistantText = String(turn.assistant_text || '').slice(0, 1600);
    const line = `Пользователь: ${userText}${assistantText ? `\nSTEN: ${assistantText}` : '\nSTEN: ответ в прошлой сессии не был сохранён'}`;
    if (line.length > budget) continue;
    lines.push(line);
    budget -= line.length;
  }
  return { turns, terms, text: lines.join('\n\n') };
}

async function startConversationTurn(user, scope, question, ctx = {}) {
  if (!user?.id || !user?.organizationId || typeof ctx.queryWithRetry !== 'function') return null;
  const id = randomUUID();
  await ctx.queryWithRetry(
    `INSERT INTO ai_conversation_turns
      (id, organization_id, user_id, scope_json, user_text, assistant_text, status, tools_json)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, '', 'processing', '[]'::jsonb)`,
    [id, user.organizationId, String(user.id), JSON.stringify(normalizeScope(scope)), String(question || '').slice(0, 20000)],
    { orgId: user.organizationId }
  );
  return id;
}

async function finishConversationTurn(user, id, answer, toolsUsed, ctx = {}) {
  if (!id || !user?.organizationId || typeof ctx.queryWithRetry !== 'function') return false;
  const result = await ctx.queryWithRetry(
    `UPDATE ai_conversation_turns
        SET assistant_text=$1, status='complete', tools_json=$2::jsonb, updated_at=now()
      WHERE id=$3::uuid AND organization_id=$4::uuid AND user_id=$5
      RETURNING id`,
    [String(answer || '').slice(0, 20000), JSON.stringify((toolsUsed || []).map(tool => ({ name: tool.name, ok: tool.ok }))), id, user.organizationId, String(user.id)],
    { orgId: user.organizationId }
  );
  return Boolean(result.rows?.[0]);
}

async function failConversationTurn(user, id, error, ctx = {}) {
  if (!id || !user?.organizationId || typeof ctx.queryWithRetry !== 'function') return false;
  const result = await ctx.queryWithRetry(
    `UPDATE ai_conversation_turns SET status='failed', assistant_text=$1, updated_at=now()
      WHERE id=$2::uuid AND organization_id=$3::uuid AND user_id=$4 RETURNING id`,
    [String(error || 'Запрос завершился ошибкой').slice(0, 2000), id, user.organizationId, String(user.id)],
    { orgId: user.organizationId }
  );
  return Boolean(result.rows?.[0]);
}

module.exports = {
  searchTerms,
  normalizeScope,
  loadConversationContext,
  startConversationTurn,
  finishConversationTurn,
  failConversationTurn,
};
