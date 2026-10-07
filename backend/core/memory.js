'use strict';

const { z } = require('zod');
const { randomUUID } = require('crypto');

const MEMORY_KINDS = ['fact','decision','cause','action','manager_note','pattern'];
const MEMORY_CONFIDENCE = ['unconfirmed','confirmed','rejected'];

const ScopeSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  restaurant_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
}).strict();

const CreateSchema = z.object({
  scope: ScopeSchema.default({}),
  kind: z.enum(MEMORY_KINDS),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50000),
  evidence: z.record(z.unknown()).optional(),
}).strict();

const ListSchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  restaurant_id: z.string().uuid().optional(),
  since: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'since должен быть ISO date').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  confidence: z.enum(MEMORY_CONFIDENCE).default('confirmed'),
}).strict();

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || `HTTP_${status}`;
  return error;
}

function requireDb(ctx) {
  if (!ctx || typeof ctx.queryWithRetry !== 'function') throw httpError(500, 'Memory DB context не настроен', 'MEMORY_DB_CONTEXT_MISSING');
}

function normalizeScope(scope = {}) {
  return {
    project_id: scope.project_id ?? '',
    branch_id: scope.branch_id ?? '',
    restaurant_id: scope.restaurant_id ?? '',
    department_id: scope.department_id ?? '',
  };
}

function validateUser(user) {
  if (!user?.id || !user?.organizationId) throw httpError(403, 'Контекст пользователя неполный', 'MEMORY_USER_CONTEXT_INVALID');
}

async function createMemory(user, payload, ctx = {}) {
  validateUser(user);
  requireDb(ctx);
  const body = CreateSchema.safeParse(payload ?? {});
  if (!body.success) {
    const issue = body.error.issues[0];
    throw httpError(400, `Ошибка валидации: ${issue.path.join('.') || 'body'} — ${issue.message}`, 'VALIDATION_ERROR');
  }
  const scope = normalizeScope(body.data.scope);
  const id = randomUUID();
  const result = await ctx.queryWithRetry(
    `INSERT INTO ai_memory
      (id, organization_id, project_id, branch_id, restaurant_id, department_id, kind, title, content, evidence_json, confidence, source_message_id, confirmed_by_user_id, confirmed_at, created_by)
     VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'unconfirmed',$11,$12::uuid,NULL,$12)
     RETURNING id, organization_id, project_id, branch_id, restaurant_id, department_id, kind, title, content, evidence_json, confidence, source_message_id, confirmed_by_user_id, confirmed_at, created_by, created_at, updated_at`,
    [id,user.organizationId,scope.project_id,scope.branch_id,scope.restaurant_id,scope.department_id,body.data.kind,body.data.title,body.data.content,JSON.stringify(body.data.evidence || {}),null,user.id],
    { orgId: user.organizationId }
  );
  if (!result.rows?.[0]) throw httpError(500, 'Память не сохранена', 'SAVE_NOT_CONFIRMED');
  const readback = await ctx.queryWithRetry(
    `SELECT id, organization_id, project_id, branch_id, restaurant_id, department_id, kind, title, content, evidence_json, confidence, source_message_id, confirmed_by_user_id, confirmed_at, created_by, created_at, updated_at
       FROM ai_memory WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1`,
    [id,user.organizationId],
    { orgId: user.organizationId }
  );
  if (!readback.rows?.[0]) throw httpError(500, 'Создание памяти не подтверждено readback', 'SAVE_NOT_CONFIRMED');
  const memory = readback.rows[0];
  if (typeof ctx.audit === 'function') await ctx.audit(user,'ai_memory.created','ai_memory',id,{kind:memory.kind,confidence:memory.confidence});
  return memory;
}

async function listMemory(user, filter = {}, ctx = {}) {
  validateUser(user);
  requireDb(ctx);
  const parsed = ListSchema.safeParse(filter ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw httpError(400, `Ошибка фильтра: ${issue.path.join('.') || 'filter'} — ${issue.message}`, 'VALIDATION_ERROR');
  }
  const f = parsed.data;
  const params = [user.organizationId];
  const where = ['organization_id=$1::uuid'];
  if (f.kind) { params.push(f.kind); where.push(`kind=$${params.length}`); }
  if (f.restaurant_id) { params.push(f.restaurant_id); where.push(`restaurant_id=$${params.length}::text`); }
  if (f.since) { params.push(f.since); where.push(`created_at >= $${params.length}::timestamptz`); }
  params.push(f.confidence); where.push(`confidence=$${params.length}`);
  params.push(f.limit);
  const result = await ctx.queryWithRetry(
    `SELECT id, organization_id, project_id, branch_id, restaurant_id, department_id, kind, title, content, evidence_json, confidence, source_message_id, confirmed_by_user_id, confirmed_at, created_by, created_at, updated_at
       FROM ai_memory WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
    { orgId: user.organizationId }
  );
  return { memories: result.rows || [] };
}

async function updateMemoryConfidence(user, id, confidence, ctx = {}) {
  validateUser(user);
  requireDb(ctx);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(id))) {
    throw httpError(400, 'Некорректный id памяти', 'BAD_ID');
  }
  if (!['confirmed','rejected'].includes(confidence)) throw httpError(400, 'Недопустимый confidence', 'BAD_CONFIDENCE');
  const result = await ctx.queryWithRetry(
    `UPDATE ai_memory
        SET confidence=$1,
            confirmed_by_user_id=CASE WHEN $1='confirmed' THEN $3::uuid ELSE confirmed_by_user_id END,
            confirmed_at=CASE WHEN $1='confirmed' THEN now() ELSE confirmed_at END,
            updated_at=now()
      WHERE id=$2::uuid AND organization_id=$4::uuid AND confidence='unconfirmed'
      RETURNING id, organization_id, project_id, branch_id, restaurant_id, department_id, kind, title, content, evidence_json, confidence, source_message_id, confirmed_by_user_id, confirmed_at, created_by, created_at, updated_at`,
    [confidence,id,user.id,user.organizationId],
    { orgId: user.organizationId }
  );
  if (!result.rows?.[0]) {
    const existing = await ctx.queryWithRetry(
      'SELECT confidence FROM ai_memory WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1',
      [id,user.organizationId],
      { orgId: user.organizationId }
    );
    if (!existing.rows?.[0]) throw httpError(404, 'Память не найдена', 'NOT_FOUND');
    throw httpError(400, 'Переход возможен только из unconfirmed', 'MEMORY_CONFIDENCE_TRANSITION_FORBIDDEN');
  }
  if (typeof ctx.audit === 'function') await ctx.audit(user,`ai_memory.${confidence}`,'ai_memory',id,{confidence});
  return result.rows[0];
}

async function deleteMemory(user, id, ctx = {}) {
  validateUser(user);
  requireDb(ctx);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(id))) {
    throw httpError(400, 'Некорректный id памяти', 'BAD_ID');
  }
  const result = await ctx.queryWithRetry(
    'DELETE FROM ai_memory WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id',
    [id,user.organizationId],
    { orgId: user.organizationId }
  );
  if (!result.rows?.[0]) throw httpError(404, 'Память не найдена', 'NOT_FOUND');
  const readback = await ctx.queryWithRetry(
    'SELECT 1 FROM ai_memory WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1',
    [id,user.organizationId],
    { orgId: user.organizationId }
  );
  if (readback.rows?.[0]) throw httpError(500, 'Удаление памяти не подтверждено readback', 'DELETE_NOT_CONFIRMED');
  if (typeof ctx.audit === 'function') await ctx.audit(user,'ai_memory.deleted','ai_memory',id,{});
  return { deleted: true };
}

async function loadMemoryContext(user, scope, limit = 15, ctx = {}) {
  validateUser(user);
  requireDb(ctx);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 15));
  const confirmedLimit = Math.min(10, safeLimit);
  const unconfirmedLimit = Math.min(5, Math.max(0, safeLimit - confirmedLimit));
  const s = normalizeScope(scope || {});
  const params = [user.organizationId];
  const where = ['organization_id=$1::uuid'];
  for (const [key, value] of Object.entries(s)) {
    if (value) {
      params.push(value);
      where.push(`${key}=$${params.length}`);
    }
  }
  const confirmed = await ctx.queryWithRetry(
    `SELECT id, kind, title, content, evidence_json, confidence, restaurant_id, project_id, branch_id, department_id, confirmed_by_user_id, confirmed_at, created_at
       FROM ai_memory WHERE ${where.join(' AND ')} AND confidence='confirmed'
      ORDER BY created_at DESC LIMIT $${params.length + 1}`,
    [...params, confirmedLimit],
    { orgId: user.organizationId }
  );
  const unconfirmed = unconfirmedLimit ? await ctx.queryWithRetry(
    `SELECT id, kind, title, content, evidence_json, confidence, restaurant_id, project_id, branch_id, department_id, confirmed_by_user_id, confirmed_at, created_at
       FROM ai_memory WHERE ${where.join(' AND ')} AND confidence='unconfirmed'
      ORDER BY created_at DESC LIMIT $${params.length + 1}`,
    [...params, unconfirmedLimit],
    { orgId: user.organizationId }
  ) : { rows: [] };
  return { confirmed: confirmed.rows || [], unconfirmed: unconfirmed.rows || [] };
}

module.exports = {
  MEMORY_KINDS,
  MEMORY_CONFIDENCE,
  createMemory,
  listMemory,
  updateMemoryConfidence,
  deleteMemory,
  loadMemoryContext,
};
