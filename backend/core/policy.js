'use strict';

const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
const buckets = new Map();

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || `HTTP_${status}`;
  return error;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(value || ''));
}

async function requireAuth(user) {
  if (!user) throw httpError(401, 'Требуется авторизация', 'UNAUTHORIZED');
}

async function requireOrg(user) {
  if (!isUuid(user?.organizationId)) throw httpError(403, 'Организация не назначена пользователю', 'NO_ORG_SCOPE');
  if (user.organizationStatus !== undefined && String(user.organizationStatus) !== 'active') {
    throw httpError(403, 'Рабочий контур организации закрыт', 'ORG_ACCESS_CLOSED');
  }
}

async function assertScopeAccess(user, args, ctx) {
  if (typeof ctx.assertScopeAccess !== 'function') throw httpError(500, 'Policy scope checker не настроен', 'POLICY_SCOPE_CHECKER_MISSING');
  await ctx.assertScopeAccess(user, {
    project_id: args?.project_id || '',
    branch_id: args?.branch_id || '',
    restaurant_id: args?.restaurant_id || '',
    department_id: args?.department_id || '',
  });
}

async function requireRole(user, _args, ctx) {
  const allowed = Array.isArray(ctx.allowedRoles) && ctx.allowedRoles.length
    ? ctx.allowedRoles
    : ['super_admin','owner','admin','director','manager'];
  if (!allowed.includes(String(user?.role || '').toLowerCase())) {
    throw httpError(403, 'Недостаточно прав для инструмента', 'ROLE_FORBIDDEN');
  }
}

async function rateLimit(user) {
  const userId = String(user?.id || '');
  const now = Date.now();
  const current = buckets.get(userId) || [];
  const active = current.filter(timestamp => now - timestamp < WINDOW_MS);
  if (active.length >= RATE_LIMIT) {
    buckets.set(userId, active);
    throw httpError(429, 'Превышен лимит AI tools: не более 30 вызовов в минуту', 'TOOL_RATE_LIMIT');
  }
  active.push(now);
  buckets.set(userId, active);
}

const POLICIES = {
  requireAuth,
  requireOrg,
  assertScopeAccess,
  requireRole,
  rateLimit,
};

async function enforcePolicy(user, tool, args, ctx = {}) {
  for (const policyName of tool?.policy || []) {
    const policy = POLICIES[policyName];
    if (typeof policy !== 'function') throw httpError(500, `Неизвестная policy: ${policyName}`, 'POLICY_UNKNOWN');
    await policy(user, args, ctx);
  }
}

module.exports = { POLICIES, enforcePolicy };
