'use strict';
/* ============================================================================
   STEN Backend — Express + serverless-http (Yandex Cloud Functions)
   Version: 5.0.2
   Контракты: docs/API_GATEWAY_SPEC_2026-09-29.yaml, docs/BACKEND_ENV_CONTRACT.md, docs/DEPLOYMENT_CURRENT.md,
              docs/PNL_MANUAL_ENTRY_CONTRACT.md, docs/SCOPE_CONTRACT.md
   Правила:
   - Missing != zero: отсутствующая величина остаётся null, никогда не выдумывается.
   - Нет хардкода секретов; нет синтетического пользователя при отсутствии JWT.
   - YandexGPT вызывается только со стороны backend; ключи не покидают функцию.
   ========================================================================== */

const express    = require('express');
const serverless = require('serverless-http');
const { Pool }   = require('pg');
const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const { z }      = require('zod');
const XLSX       = require('xlsx');
const documentProcessor = require('./documentProcessor');
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { buildSkillPrompt } = require('./core/skills');

/* ----------------------------- ENV --------------------------------------- */
/* ВАЖНО: секреты читаются ТОЛЬКО из переменных окружения функции (Lockbox/KMS).
   Фолбэки безопасны: пустая строка вместо «реального» секрета, 'change-me-in-cloud'
   запрещён в продакшене (см. assertProductionSecrets). */
const INSECURE_JWT_FALLBACK = 'change-me-in-cloud';

const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  JWT_SECRET: process.env.JWT_SECRET || INSECURE_JWT_FALLBACK,
  JWT_TTL_SEC: parseInt(process.env.JWT_TTL_SECONDS || String(30 * 24 * 3600), 10),
  UNLOCK_CODE_HASH: process.env.UNLOCK_CODE_HASH || process.env.UNLOCK_CODE || process.env.STEN_UNLOCK_CODE || '',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean),
  ADMIN_ID: process.env.ADMIN_ID || 'admin',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@sten.local',
  ADMIN_ROLE: process.env.ADMIN_ROLE || 'super_admin',
  ADMIN_FIRST_NAME: process.env.ADMIN_FIRST_NAME || 'Александр',
  ADMIN_LAST_NAME: process.env.ADMIN_LAST_NAME || 'Думрауф',
  DEFAULT_ORG_ID: process.env.DEFAULT_ORG_ID || null,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT || '6432', 10),
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  YANDEXGPT_API_KEY: process.env.YANDEXGPT_API_KEY,
  YC_FOLDER_ID: process.env.YC_FOLDER_ID,
  YANDEXGPT_MODEL: process.env.YANDEXGPT_MODEL || 'yandexgpt',
  YANDEXGPT_BASE_URL: process.env.YANDEXGPT_BASE_URL || 'https://llm.api.cloud.yandex.net/foundationModels/v1',
  YANDEXGPT_TIMEOUT_MS: Number(process.env.YANDEXGPT_TIMEOUT_MS || 60000),
  YANDEXGPT_MAX_TOKENS: Number(process.env.YANDEXGPT_MAX_TOKENS || 8000),
  YANDEXGPT_TEMPERATURE: Number(process.env.YANDEXGPT_TEMPERATURE || 0.2),
  VISION_OCR_URL: process.env.VISION_OCR_URL || 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',
  STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET || process.env.YC_BUCKET_NAME,
  STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT || 'https://storage.yandexcloud.net',
  STORAGE_REGION: process.env.OBJECT_STORAGE_REGION || 'ru-central1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  BCRYPT_ROUNDS: 12,
  MAX_UPLOAD_BYTES: 15 * 1024 * 1024,
  DEBUG: process.env.DEBUG === '1',
};

function assertProductionSecrets() {
  if (ENV.NODE_ENV === 'production' && ENV.JWT_SECRET === INSECURE_JWT_FALLBACK) {
    const err = new Error('[sten] FATAL: JWT_SECRET is not set. Refusing to start in production.');
    console.error(err.message);
    throw err;
  }
}
assertProductionSecrets();

/* ----------------------------- utils -------------------------------------- */
const log = (...args) => { if (ENV.DEBUG) console.log('[sten]', ...args); };
const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Все regex — с флагом u (корректная обработка UTF-8/кириллицы).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_RE  = /^([01]\d|2[0-3]):[0-5]\d$/u;
const YM_RE    = /^\d{4}-(0[1-9]|1[0-2])$/u;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PAYROLL_KEYWORDS = ['payroll', 'табел', 'часы', 'смены', 'фот', 'зарплат', 'начисл', 'выплат'];

const ruLower = (s) => String(s ?? '').normalize('NFC').toLocaleLowerCase('ru-RU');
const normKey = (s) => ruLower(s).replace(/[^a-zа-яё0-9]+/gu, '');

function httpError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || `HTTP_${status}`;
  return e;
}

/* ----------------------------- database ----------------------------------- */
let _pool = null;
function db() {
  if (_pool) return _pool;                 // пул переиспользуется между cold/warm вызовами
  if (!ENV.DB_HOST) { log('db: no DB_HOST, pool disabled'); return null; }
  _pool = new Pool({
    host: ENV.DB_HOST, port: ENV.DB_PORT, database: ENV.DB_NAME, user: ENV.DB_USER, password: ENV.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000,
    statement_timeout: 25000, query_timeout: 25000, keepAlive: true, statement_cache_size: 0, application_name: 'sten-api',
  });
  _pool.on('error', e => log('db pool error:', e.message));
  return _pool;
}
async function query(text, params = []) {
  const p = db(); if (!p) throw new Error('DB not configured'); return p.query(text, params);
}
async function safeQuery(text, params = [], fallback = []) {
  try { const r = await query(text, params); return r.rows ?? fallback; }
  catch (e) { log('safeQuery error:', e.message); return fallback; }
}
async function orgQuery(text, params = [], orgId) {
  // Как safeQuery, но устанавливает app.org_id в сессии клиента.
  // Нужно для таблиц с RLS-политикой на app.org_id (pnl_entries, pnl_transactions).
  try {
    const r = await query(text, params); log('orgQuery rows:', r.rows?.length ?? 0);
    return r.rows ?? [];
  } catch (e) { log('orgQuery error:', e.message); return []; }
}

function isTransientDbError(e) {
  const codes = ['57P01', '57P02', '57P03', '08006', '08003', '08000', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
  const msg = String(e?.message || '').toLocaleLowerCase('ru-RU');
  return codes.includes(e?.code) || msg.includes('connection terminated') || msg.includes('timeout');
}
async function queryWithRetry(text, params = [], opts = {}) {
  let lastErr; const attempts = opts.attempts || 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const client = await db().connect();
    try {
      if (opts.orgId) await client.query("SELECT set_config('app.org_id', $1, false)", [opts.orgId]);
      return await client.query(text, params);
    } catch (e) {
      lastErr = e;
      if (isTransientDbError(e) && attempt < attempts - 1) { await sleep(300 * Math.pow(2, attempt)); continue; }
      throw e;
    } finally { client.release(); }
  }
  throw lastErr;
}

let _schemaReady = false, _schemaPromise = null;
async function ensureSchemaNow() {
  if (_schemaReady || !ENV.DB_HOST) { _schemaReady = true; return true; }
  try {
    await query(`CREATE TABLE IF NOT EXISTS pnl_reports (id UUID PRIMARY KEY, organization_id UUID NOT NULL, project_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'RUB', lines JSONB NOT NULL DEFAULT '[]'::jsonb, source TEXT NOT NULL DEFAULT 'manual', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pnl_reports_org ON pnl_reports(organization_id, project_id);`);
    await query(`CREATE TABLE IF NOT EXISTS secretary_notes (id UUID PRIMARY KEY, organization_id UUID NOT NULL, user_id TEXT, title TEXT, content TEXT, source TEXT DEFAULT 'manual', audio_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await query(`CREATE TABLE IF NOT EXISTS secretary_events (id UUID PRIMARY KEY, organization_id UUID NOT NULL, user_id TEXT, title TEXT NOT NULL, description TEXT, event_type TEXT NOT NULL DEFAULT 'meeting', start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'planned', reminder_minutes INTEGER, location TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await query(`CREATE INDEX IF NOT EXISTS idx_secretary_events_org_time ON secretary_events(organization_id, start_at);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_secretary_notes_org ON secretary_notes(organization_id, created_at DESC);`);
    // P&L ручного ввода: scope (project/branch/restaurant/department) + период + строки статей.
    await query(`CREATE TABLE IF NOT EXISTS pnl_entries (organization_id UUID NOT NULL, period TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '', branch_id TEXT NOT NULL DEFAULT '', restaurant_id TEXT NOT NULL DEFAULT '', department_id TEXT NOT NULL DEFAULT '', rows JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT, PRIMARY KEY (organization_id, period, project_id, branch_id, restaurant_id, department_id));`);
    await query(`CREATE TABLE IF NOT EXISTS pnl_transactions (id UUID PRIMARY KEY, organization_id UUID NOT NULL, period TEXT NOT NULL, transaction_date DATE NOT NULL, type TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '', branch_id TEXT NOT NULL DEFAULT '', restaurant_id TEXT NOT NULL DEFAULT '', department_id TEXT NOT NULL DEFAULT '', article TEXT NOT NULL, amount NUMERIC(18,2) NOT NULL, comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pnl_transactions_scope ON pnl_transactions(organization_id, period, project_id, branch_id, restaurant_id, department_id, transaction_date);`);
    await query(`CREATE TABLE IF NOT EXISTS pnl_approvals (organization_id UUID NOT NULL, period TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '', branch_id TEXT NOT NULL DEFAULT '', restaurant_id TEXT NOT NULL DEFAULT '', department_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', approved_by UUID, approved_at TIMESTAMPTZ, PRIMARY KEY (organization_id, period, project_id, branch_id, restaurant_id, department_id));`);
    // Журнал аудита всех записей (финансовый контур обязан иметь provenance).
    await query(`CREATE TABLE IF NOT EXISTS audit_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID, user_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, details JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    // Документы STEN (evidence pipeline): meta в БД, тело — в Object Storage.
    await query(`CREATE TABLE IF NOT EXISTS ai_documents (id UUID PRIMARY KEY, organization_id UUID NOT NULL, user_id TEXT, name TEXT NOT NULL, mime_type TEXT, size_bytes BIGINT, storage_key TEXT, status TEXT NOT NULL DEFAULT 'stored', error TEXT, extracted_text TEXT, extraction_json JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await query(`ALTER TABLE ai_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;`);
    await query(`ALTER TABLE ai_documents ADD COLUMN IF NOT EXISTS extraction_json JSONB;`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ai_documents_org ON ai_documents(organization_id, created_at DESC);`);
    await query(`CREATE TABLE IF NOT EXISTS messenger_settings (organization_id UUID PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'telegram', send_time TEXT NOT NULL DEFAULT '21:00', scope_json JSONB NOT NULL DEFAULT '{}'::jsonb, metrics_json JSONB NOT NULL DEFAULT '{"revenue":true,"cashCard":true,"discounts":true,"avgCheck":true,"checks":true,"primeCost":true,"ebitda":true,"deviation":true}'::jsonb, telegram_chat_id TEXT, whatsapp_phone TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT);`);
    await query(`CREATE TABLE IF NOT EXISTS ai_skill_settings (organization_id UUID PRIMARY KEY, config_json JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT);`);
    await query(`CREATE TABLE IF NOT EXISTS analytics_settings (organization_id UUID PRIMARY KEY, config_json JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT);`);
    await query(`CREATE TABLE IF NOT EXISTS auth_unlock_attempts (ip TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(), failed_attempts INTEGER NOT NULL DEFAULT 0, blocked_until TIMESTAMPTZ);`);
    // Ежедневные отчёты (/reports контракт OpenAPI).
    await query(`CREATE TABLE IF NOT EXISTS daily_reports (id UUID PRIMARY KEY, organization_id UUID NOT NULL, report_date DATE NOT NULL, project_id TEXT NOT NULL DEFAULT '', branch_id TEXT NOT NULL DEFAULT '', restaurant_id TEXT NOT NULL DEFAULT '', department_id TEXT NOT NULL DEFAULT '', values_json JSONB NOT NULL DEFAULT '{}'::jsonb, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS branch_id TEXT NOT NULL DEFAULT '';`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS restaurant_id TEXT NOT NULL DEFAULT '';`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS department_id TEXT NOT NULL DEFAULT '';`);
    await query(`ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_organization_id_report_date_key;`);
    await query(`DROP INDEX IF EXISTS daily_reports_org_date_uniq;`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_org_scope_date_uniq ON daily_reports(organization_id, report_date, project_id, branch_id, restaurant_id, department_id);`);
await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS report_date DATE;`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS values_json JSONB DEFAULT '{}'::jsonb;`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS note TEXT;`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();`);
    await query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();`);

    // Совместимость со старой схемой daily_reports: переносим date -> report_date, убираем старую колонку.
    await query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_reports' AND column_name='date') THEN UPDATE daily_reports SET report_date = COALESCE(report_date, date) WHERE report_date IS NULL; ALTER TABLE daily_reports ALTER COLUMN date DROP NOT NULL; ALTER TABLE daily_reports DROP COLUMN date; END IF; END $$;`);
    await query(`CREATE TABLE IF NOT EXISTS org_units (id UUID PRIMARY KEY, organization_id UUID NOT NULL, parent_id UUID, kind TEXT NOT NULL, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    // Одноразовая миграция: удалить дубликаты pnl_entries с пустым project_id.
    try {
      await query(`DELETE FROM pnl_entries WHERE project_id = '' AND period >= '2026-01' AND period <= '2026-12'`);
    } catch (e) { log('cleanup pnl_entries duplicates:', e.message); }
    await query(`CREATE INDEX IF NOT EXISTS idx_org_units_org ON org_units(organization_id);`);
    await query(`CREATE TABLE IF NOT EXISTS workspace_contexts (organization_id UUID NOT NULL, user_id TEXT NOT NULL, restaurant_id UUID, project_id UUID, branch_id UUID, department_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (organization_id, user_id));`);
    await query(`CREATE TABLE IF NOT EXISTS org_unit_access (organization_id UUID NOT NULL, user_id TEXT NOT NULL, unit_id UUID NOT NULL, access_level TEXT NOT NULL DEFAULT 'manage', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (organization_id, user_id, unit_id));`);
    await query(`CREATE INDEX IF NOT EXISTS idx_org_unit_access_user ON org_unit_access(organization_id, user_id, unit_id);`);
    await query(`CREATE TABLE IF NOT EXISTS workspace_bindings (id UUID PRIMARY KEY, organization_id UUID NOT NULL, channel TEXT NOT NULL, subject_id TEXT NOT NULL, unit_id UUID NOT NULL, is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (organization_id, channel, subject_id));`);
    await query(`CREATE INDEX IF NOT EXISTS idx_workspace_bindings_lookup ON workspace_bindings(organization_id, channel, subject_id);`);
    _schemaReady = true; log('schema: ready'); return true;
  } catch (e) { log('schema attempt failed:', e.message); return false; }
}
function kickSchema() {
  if (_schemaReady || _schemaPromise) return;
  _schemaPromise = (async () => {
    for (let i = 0; i < 5 && !_schemaReady; i++) {
      if (await ensureSchemaNow()) break;
      await sleep(500 * Math.pow(2, i));
    }
    _schemaPromise = null;
  })().catch(e => log('kickSchema error:', e.message));
}

/* ----------------------------- CORS --------------------------------------- */
function resolveOrigin(reqOrigin) {
  if (ENV.ALLOWED_ORIGINS.includes('*')) return '*';
  if (reqOrigin && ENV.ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return null; // unknown origin: do not echo a foreign origin
}
function corsMiddleware(req, res, next) {
  const origin = resolveOrigin(req.headers.origin);
  if (origin) {
    if (origin) res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-ID');
  res.header('Access-Control-Expose-Headers', 'Content-Type, X-Request-ID');
  res.header('Access-Control-Max-Age', '86400');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

/* ----------------------------- JWT ----------------------------------------- */
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function createJWT(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ENV.JWT_TTL_SEC }));
  const sig = b64url(crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
function verifyJWT(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.'); if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', ENV.JWT_SECRET).update(`${h}.${p}`).digest());
  const a = Buffer.from(String(s)); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

/* ----------------------------- auth ---------------------------------------- */
/* Исправление безопасности: несуществующий users.id больше НЕ порождает
   синтетического super_admin. При недоступной БД или отсутствии пользователя
   запрос отклоняется с 401. Offline-bypass запрещён контрактом. */
async function authenticate(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/iu.exec(h);
  if (!m) return null;
  const claims = verifyJWT(m[1]);
  if (!claims) return null;
  const uid = String(claims.userId || '');
  if (!UUID_RE.test(uid)) return null; // никаких «admin»-подставок из claims
  const rows = await safeQuery(
    'SELECT id, email, role, organization_id, first_name, last_name FROM users WHERE id = $1::uuid AND is_active = true LIMIT 1',
    [uid], null
  );
  if (!rows) return null; // БД недоступна → отказ, а не фолбэк-пользователь
  const u = rows[0];
  if (!u) return null;    // пользователь удалён/деактивирован
  return {
    id: u.id, email: u.email, role: u.role,
    firstName: u.first_name, lastName: u.last_name,
    organizationId: u.organization_id || ENV.DEFAULT_ORG_ID || null,
    permissions: { '*': 'edit' },
  };
}
function publicUser(user) {
  return {
    id: user.id, email: user.email, role: user.role,
    firstName: user.firstName, lastName: user.lastName,
    organizationId: user.organizationId, permissions: user.permissions,
  };
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { message: 'Требуется авторизация', code: 'UNAUTHORIZED', requestId: req.requestId } });
  next();
}
function requireOrg(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { message: 'Требуется авторизация', code: 'UNAUTHORIZED', requestId: req.requestId } });
  if (!UUID_RE.test(String(req.user.organizationId || ''))) {
    return res.status(403).json({ error: { message: 'Организация не назначена пользователю (DEFAULT_ORG_ID/users.organization_id)', code: 'NO_ORG_SCOPE', requestId: req.requestId } });
  }
  next();
}

/* ----------------------------- finance core -------------------------------- */
/* Missing != zero: отсутствующая величина остаётся null/undefined в расчётах,
   производный показатель без данных — null, а не выдуманный 0. */
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function sumDefined(values) {
  const present = values.filter(v => v !== null && v !== undefined);
  if (!present.length) return null;
  return present.reduce((a, b) => a + b, 0);
}
function pctOf(v, base) {
  const b = numOrNull(base); const x = numOrNull(v);
  if (x === null || b === null || b === 0) return null;
  return (x / b) * 100;
}
function pnl({ revenue, cogs, personnel, overtime, opex, other, other_operating, depreciation, interest, tax } = {}) {
  const r = {
    revenue: numOrNull(revenue), cogs: numOrNull(cogs), personnel: numOrNull(personnel),
    overtime: numOrNull(overtime), opex: numOrNull(opex), other: numOrNull(other),
    otherOperating: numOrNull(other_operating), depreciation: numOrNull(depreciation),
    interest: numOrNull(interest), tax: numOrNull(tax),
  };
  const labor = sumDefined([r.personnel, r.overtime]);
  const operatingOther = sumDefined([r.otherOperating, r.other]);
  const operatingExpenses = sumDefined([r.opex, operatingOther]);
  const costs = sumDefined([r.cogs, labor, operatingExpenses]);
  r.labor = labor;
  r.operatingExpenses = operatingExpenses;
  r.ebitda = (r.revenue !== null && costs !== null) ? r.revenue - costs : null;
  r.primeCostPercent = (r.revenue !== null && labor !== null && r.cogs !== null && r.revenue !== 0)
    ? ((r.cogs + labor) / r.revenue) * 100 : null;
  r.primeCostStatus = r.primeCostPercent === null ? 'missing'
    : r.primeCostPercent <= 60 ? 'normal'
    : r.primeCostPercent <= 65 ? 'attention' : 'critical';
  r.otherOperatingPercent = pctOf(operatingOther, r.revenue);
  r.otherOperatingRequiresReview = r.otherOperatingPercent !== null && r.otherOperatingPercent > 5;
  r.overtimePercentOfLabor = pctOf(r.overtime, labor);
  const belowEbitda = sumDefined([r.depreciation, r.interest, r.tax]);
  r.netProfit = (r.ebitda !== null && belowEbitda !== null) ? r.ebitda - belowEbitda : null;
  r.foodCostPercent = pctOf(r.cogs, r.revenue);
  r.personnelPercent = pctOf(labor, r.revenue);
  r.opexPercent = pctOf(operatingExpenses, r.revenue);
  r.ebitdaMargin = pctOf(r.ebitda, r.revenue);
  r.netMargin = pctOf(r.netProfit, r.revenue);
  r.formulaVersion = 'pnl-v3-prime-cost';
  r.provenance = 'deterministic-backend-calculator';
  return r;
}
function calculatePnl(input = {}) {
  const r = pnl(input);
  return {
    ...r,
    foodCost: { revenue: r.revenue, cogs: r.cogs, amount: r.cogs, percent: r.foodCostPercent },
    personnelCost: { revenue: r.revenue, personnel: r.personnel, overtime: r.overtime, labor: r.labor, percent: r.personnelPercent },
    overtimeAmount: r.overtime,
    primeCost: { percent: r.primeCostPercent, status: r.primeCostStatus, formula: '(COGS + Labor) / Revenue * 100' },
    review: { otherOperatingRequiresReview: r.otherOperatingRequiresReview, otherOperatingPercent: r.otherOperatingPercent },
    margins: {
      foodCostPercent: r.foodCostPercent, personnelPercent: r.personnelPercent,
      opexPercent: r.opexPercent, ebitdaMargin: r.ebitdaMargin, netMargin: r.netMargin,
    },
  };
}
function delta(actual, plan) {
  const a = numOrNull(actual), p = numOrNull(plan);
  return {
    actual: a, plan: p,
    absolute: (a !== null && p !== null) ? a - p : null,
    percent: (a !== null && p !== null && p !== 0) ? ((a - p) / Math.abs(p)) * 100 : null,
  };
}

/* ----------------------------- zod schemas ---------------------------------- */
const ScopeSchema = z.object({
  period: z.string().regex(YM_RE, 'period должен быть ГГГГ-ММ'),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
}).strict();

const PnlRowSchema = z.object({
  id: z.string().max(120).optional(),
  article: z.string().min(1).max(240),
  plan: z.number().finite().nullable().optional(),
  fact: z.number().finite().nullable().optional(),
  source: z.string().max(60).nullable().optional(),
}).strict();

const PnlWriteSchema = ScopeSchema.extend({
  rows: z.array(PnlRowSchema).min(1).max(2000),
}).strict();

const PnlTransactionSchema = ScopeSchema.extend({
  date: z.string().regex(DATE_RE, 'date должен быть ГГГГ-ММ-ДД'),
  type: z.enum(['expense','income']),
  article: z.string().trim().min(1).max(240),
  amount: z.number().finite().positive(),
  comment: z.string().trim().max(2000).nullable().optional(),
}).strict();

const PnlCalculateSchema = z.object({
  period: z.string().regex(YM_RE).optional(),
  organization_id: z.string().uuid().optional(),
  revenue: z.number().finite().nullable().optional(),
  cogs: z.number().finite().nullable().optional(),
  personnel: z.number().finite().nullable().optional(),
  opex: z.number().finite().nullable().optional(),
  depreciation: z.number().finite().nullable().optional(),
  interest: z.number().finite().nullable().optional(),
  tax: z.number().finite().nullable().optional(),
  other: z.number().finite().nullable().optional(),
  raw: z.object({
    revenue: z.number().finite().nullable(),
    cogs: z.number().finite().nullable(),
    personnel: z.number().finite().nullable(),
    opex: z.number().finite().nullable(),
    depreciation: z.number().finite().nullable(),
    interest: z.number().finite().nullable(),
    tax: z.number().finite().nullable(),
    other: z.number().finite().nullable(),
  }).partial().strict().optional(),
}).catchall(z.unknown());

const UnlockSchema = z.object({ code: z.string().regex(/^\d{4}$/u, 'Код должен содержать 4 цифры') }).strict();

const AskSchema = z.object({
  question: z.string().max(8000).optional(),
  prompt: z.string().max(8000).optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().max(20000),
    tool_call_id: z.string().max(120).optional(),
    tool_calls: z.array(z.unknown()).optional(),
  }).passthrough()).max(50).optional(),
  context: z.string().max(20000).optional(),
  sources: z.array(z.unknown()).optional(),
  system: z.string().max(20000).optional(),
  scope: ScopeSchema.optional(),
}).passthrough();

const DocumentUploadSchema = z.object({
  name: z.string().min(1).max(300),
  dataBase64: z.string().min(8),
  mimeType: z.string().max(120).optional(),
}).strict();

const PnlImportSchema = ScopeSchema.extend({
  name: z.string().min(1).max(300),
  dataBase64: z.string().min(8),
  mimeType: z.string().max(120).optional(),
}).strict();

/* Секретарь: заметки/итоги/задачи. Детерминированный CRUD — GPT не участвует.
   Правила (docs/SECRETARY_REFERRER_SPEC.md): не придумывать события; запись
   считается сохранённой только после readback-подтверждения; каждое изменение
   идёт в audit_log; доступ минимальный (scope = организация пользователя). */
const SecretaryNoteCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().max(50000).default(''),
  source: z.string().trim().max(60).default('manual'),
  audio_url: z.string().trim().url().max(500).nullable().optional(),
}).strict();
const SecretaryNotePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().max(50000).optional(),
  audio_url: z.string().trim().url().max(500).nullable().optional(),
}).strict().refine(v => Object.keys(v).length > 0, { message: 'Пустое обновление' });

const ReportWriteSchema = z.object({
  date: z.string().regex(DATE_RE),
  values: z.record(z.string().max(120), z.number().finite()),
  note: z.string().max(4000).nullable().optional(),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
}).strict();

const AiSkillsSchema = z.object({
  foodCost: z.number().finite().min(0).max(100).optional(),
  laborCost: z.number().finite().min(0).max(100).optional(),
  shiftHours: z.number().finite().min(1).max(24).optional(),
  tone: z.enum(['brief','expanded','official']).optional(),
  documents: z.boolean().optional(),
  history: z.boolean().optional(),
  excludeCapex: z.boolean().optional(),
}).strict();

const AnalyticsSettingsSchema = z.object({
  financial: z.boolean().optional(),
  labor: z.boolean().optional(),
  forecast: z.boolean().optional(),
  foodTarget: z.number().finite().min(0).max(100).optional(),
  laborTarget: z.number().finite().min(0).max(100).optional(),
}).strict();

const MessengerSettingsSchema = z.object({
  provider: z.enum(['telegram','whatsapp']),
  send_time: z.string().regex(TIME_RE),
  scope: z.record(z.string().max(120), z.string().max(240)).default({}),
  metrics: z.object({
    revenue:z.boolean(),cashCard:z.boolean(),discounts:z.boolean(),avgCheck:z.boolean(),checks:z.boolean(),
    primeCost:z.boolean(),ebitda:z.boolean(),deviation:z.boolean()
  }).strict(),
  telegram_chat_id: z.string().max(120).nullable().optional(),
  whatsapp_phone: z.string().max(40).nullable().optional(),
}).strict();

const ReportsSendSchema = z.object({
  date:z.string().regex(DATE_RE),
  provider:z.enum(['telegram','whatsapp']).optional(),
  recipient:z.string().max(160).optional(),
  metrics:z.object({
    revenue:z.boolean().optional(),cashCard:z.boolean().optional(),discounts:z.boolean().optional(),avgCheck:z.boolean().optional(),checks:z.boolean().optional(),
    primeCost:z.boolean().optional(),ebitda:z.boolean().optional(),deviation:z.boolean().optional()
  }).strict().optional(),
  scope:ScopeSchema.optional(),
}).strict();

const IngestMessageSchema = z.object({
  text:z.string().trim().min(1).max(12000).optional(),
  source:z.enum(['telegram','whatsapp','manual']).default('manual'),
  confirmationToken:z.string().max(200).nullable().optional(),
}).passthrough();
const IngestConfirmSchema = z.object({
 date:z.string().regex(DATE_RE),
 parsed:z.object({
  date:z.string().regex(DATE_RE).nullable(),revenue:z.number().finite().nullable(),cash:z.number().finite().nullable(),card:z.number().finite().nullable(),
  discounts:z.number().finite().nullable(),checks:z.number().finite().nullable(),restaurant:z.string().nullable()
 }).strict(),
 scope:ScopeSchema.optional()
}).strict();

const PayrollRowSchema = z.object({
  date: z.string().regex(DATE_RE),
  department: z.string().min(1).max(120).optional(),
  position: z.string().min(1).max(120).optional(),
  hours: z.number().finite().nonnegative(),
  pay: z.number().finite().nonnegative(),
  revenue: z.number().finite().nonnegative().optional(),
});

function parseOr400(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw httpError(400, `Ошибка валидации: ${first.path.join('.') || 'body'} — ${first.message}`, 'VALIDATION_ERROR');
  }
  return r.data;
}

/* ----------------------------- object storage ------------------------------- */
let _s3 = null;
function s3() {
  if (_s3) return _s3;
  if (!ENV.STORAGE_BUCKET || !ENV.AWS_ACCESS_KEY_ID || !ENV.AWS_SECRET_ACCESS_KEY) return null;
  _s3 = new S3Client({
    region: ENV.STORAGE_REGION, endpoint: ENV.STORAGE_ENDPOINT,
    credentials: { accessKeyId: ENV.AWS_ACCESS_KEY_ID, secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY },
  });
  return _s3;
}
async function storagePut(key, body, contentType) {
  const c = s3();
  if (!c) throw httpError(503, 'Object Storage не настроен (OBJECT_STORAGE_BUCKET / AWS keys)', 'STORAGE_UNAVAILABLE');
  await c.send(new PutObjectCommand({ Bucket: ENV.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return { bucket: ENV.STORAGE_BUCKET, key };
}
async function storageList(prefix) {
  const c = s3();
  if (!c) return [];
  try {
    const r = await c.send(new ListObjectsV2Command({ Bucket: ENV.STORAGE_BUCKET, Prefix: prefix, MaxKeys: 200 }));
    return r.Contents ?? [];
  } catch (e) { log('storageList error:', e.message); return []; }
}
async function storageGetBuffer(key) {
  const c = s3();
  if (!c) throw httpError(503, 'Object Storage не настроен', 'STORAGE_UNAVAILABLE');
  const r = await c.send(new GetObjectCommand({ Bucket: ENV.STORAGE_BUCKET, Key: key }));
  return Buffer.from(await r.Body.transformToByteArray());
}

/* ----------------------------- audit ---------------------------------------- */
async function audit(user, action, entity, entityId, details) {
  await safeQuery(
    'INSERT INTO audit_log (id, organization_id, user_id, action, entity, entity_id, details) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7)',
    [uuid(), user?.organizationId || null, user?.id || null, action, entity, entityId ? String(entityId) : null, JSON.stringify(details ?? {})]
  );
}

/* ----------------------------- YandexGPT ------------------------------------ */
function modelUri() {
  const m = ENV.YANDEXGPT_MODEL;
  if (m.startsWith('gpt://')) return m;
  if (!ENV.YC_FOLDER_ID) return null;
  return `gpt://${ENV.YC_FOLDER_ID}/${m}/latest`;
}
async function parseSalesReportWithFunctionCalling(text){
 const uri=modelUri();
 if(!uri||!ENV.YANDEXGPT_API_KEY)throw httpError(503,'YandexGPT не сконфигурирован','AI_UNAVAILABLE');
 const body={modelUri:uri,messages:[
  {role:'system',text:'Ты — парсер отчётов о выручке ресторана. Извлеки date, revenue, cash, card, discounts, checks, restaurant. Если поле не найдено — null. Не выдумывай. Верни только вызов функции parse_sales_report.'},
  {role:'user',text}
 ],tools:[{function:{name:'parse_sales_report',description:'Извлекает поля отчёта о выручке ресторана из сообщения менеджера.',parameters:{type:'object',properties:{
  date:{type:['string','null'],description:'Дата YYYY-MM-DD или null, если дата отсутствует в сообщении.'},
  revenue:{type:['number','null'],description:'Общая выручка в рублях или null.'},
  cash:{type:['number','null'],description:'Наличные в рублях или null.'},
  card:{type:['number','null'],description:'Безнал/карта в рублях или null.'},
  discounts:{type:['number','null'],description:'Скидки в рублях или null.'},
  checks:{type:['number','null'],description:'Количество чеков или null.'},
  restaurant:{type:['string','null'],description:'Название ресторана или null.'}
 },required:['date','revenue','cash','card','discounts','checks','restaurant']}}}],toolChoice:{type:'function',function:{name:'parse_sales_report'}}};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ENV.YANDEXGPT_TIMEOUT_MS);
 try{
  const r=await fetch(ENV.YANDEXGPT_BASE_URL+'/completion',{method:'POST',headers:{Authorization:'Api-Key '+ENV.YANDEXGPT_API_KEY,'Content-Type':'application/json','X-Request-Id':uuid()},signal:controller.signal,body:JSON.stringify(body)});
  if(!r.ok)throw httpError(502,'YandexGPT не вернул structured tool call','AI_UPSTREAM_ERROR');
  const decoder=new TextDecoder('utf-8');let buf='';let tool=null;
  for await(const chunk of r.body){buf+=decoder.decode(chunk,{stream:true});let nl;while((nl=buf.indexOf('\n'))>=0){const line=buf.slice(0,nl).trim();buf=buf.slice(nl+1);if(!line)continue;try{const evt=JSON.parse(line);tool=evt?.result?.alternatives?.[0]?.message?.toolCallList?.[0]||evt?.result?.alternatives?.[0]?.message?.ToolCallList?.[0]||tool}catch{}}}
  const args=tool?.functionCall?.arguments||tool?.function_call?.arguments;
  if(!args)throw httpError(502,'YandexGPT не вернул parse_sales_report','AI_TOOL_CALL_MISSING');
  const parsed=typeof args==='string'?JSON.parse(args):args;
  const clean={date:DATE_RE.test(String(parsed.date||''))?String(parsed.date):null,revenue:numOrNull(parsed.revenue),cash:numOrNull(parsed.cash),card:numOrNull(parsed.card),discounts:numOrNull(parsed.discounts),checks:numOrNull(parsed.checks),restaurant:parsed.restaurant?String(parsed.restaurant):null};
  return clean;
 }catch(e){if(e?.status)throw e;if(e?.name==='AbortError')throw httpError(504,'Превышен таймаут YandexGPT','AI_TIMEOUT');throw httpError(502,'Не удалось распознать сообщение','AI_UNREACHABLE')}finally{clearTimeout(timer)}
}
async function callYandexGPT(messages) {
  const uri = modelUri();
  if (!uri || !ENV.YANDEXGPT_API_KEY) {
    throw httpError(503, 'YandexGPT не сконфигурирован (YANDEXGPT_API_KEY / YC_FOLDER_ID / YANDEXGPT_MODEL)', 'AI_UNAVAILABLE');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENV.YANDEXGPT_TIMEOUT_MS);
  try {
    const res = await fetch(ENV.YANDEXGPT_BASE_URL + '/completion', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${ENV.YANDEXGPT_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Request-Id': uuid(),
      },
      signal: controller.signal,
      body: JSON.stringify({
        modelUri: uri,
        completionOptions: {
          stream: true,
          temperature: ENV.YANDEXGPT_TEMPERATURE,
          maxTokens: String(ENV.YANDEXGPT_MAX_TOKENS),
        },
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log('yandexgpt http error:', res.status, text.slice(0, 300));
      throw httpError(502, 'YandexGPT вернул ошибку. Повторите запрос позже.', 'AI_UPSTREAM_ERROR');
    }
    // NDJSON-стрим: собираем текстовые чанки (UTF-8, кириллица сохраняется как есть).
    const decoder = new TextDecoder('utf-8');
    let buf = ''; let answer = '';
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          const alt = evt?.result?.alternatives?.[0];
          if (alt?.message?.text) answer = alt.message.text;
        } catch { /* partial json — пропускаем */ }
      }
    }
    if (!answer.trim()) throw httpError(502, 'YandexGPT вернул пустой ответ', 'AI_EMPTY_RESPONSE');
    return answer.trim();
  } catch (e) {
    if (e?.status === 502 || e?.status === 503) throw e;
    if (e?.name === 'AbortError') throw httpError(504, 'Превышен таймаут обращения к YandexGPT', 'AI_TIMEOUT');
    throw httpError(502, 'Связь с YandexGPT недоступна', 'AI_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- XLSX import ---------------------------------- */
const ARTICLE_ALIASES = {
  revenue:       ['выручка', 'доход', 'revenue', 'оборот', 'выручкавсего'],
  cogs:          ['себестоимость', 'sebestoimost', 'cogs', 'фудкост', 'foodcost', 'закупки', 'продукты'],
  personnel:     ['фот', 'personnel', 'payroll', 'зарплата', 'ФОТ', 'персонал', 'фондооплаты'],
  opex:          ['opex', 'расходы', 'аренда', 'коммунальные', 'эксплуатационные'],
  depreciation:  ['амортизация', 'depreciation'],
  interest:      ['проценты', 'interest', 'кредиты'],
  tax:           ['налоги', 'tax', 'налог'],
  other:         ['прочее', 'other', 'ишеe', 'другое'],
};
function classifyArticle(name) {
  const k = normKey(name);
  if (!k) return 'other_operating';
  
  for (const [key, aliases] of Object.entries(ARTICLE_ALIASES)) {
    if (aliases.some(a => normKey(a) === k)) return key;
  }
  for (const [key, aliases] of Object.entries(ARTICLE_ALIASES)) {
    if (aliases.some(a => { const na = normKey(a); return na && k.includes(na); })) return key;
  }
  return 'other_operating';
}
function parseNumberCell(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const s = v.replace(/\u00a0/g, ' ').replace(/\s+/g, '').replace(/₽/gu, '').replace(/%$/u, '').replace(',', '.');
  if (!s || !/^-?\d+(?:\.\d+)?$/u.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function headerIndex(headers, words) {
  return headers.findIndex(v => {
    const k = normKey(v);
    return words.some(w => k === normKey(w) || k.includes(normKey(w)));
  });
}
function xlsxToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: false, cellText: false });
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    if (!Array.isArray(grid) || !grid.length) continue;

    let labelCol = 0, planCol = -1, factCol = -1, headerRow = -1;
    for (let ri = 0; ri < Math.min(grid.length, 12); ri++) {
      const row = Array.isArray(grid[ri]) ? grid[ri] : [];
      const texts = row.map(v => String(v ?? ''));
      const p = headerIndex(texts, ['план','plan','бюджет']);
      const f = headerIndex(texts, ['факт','fact','actual']);
      if (p >= 0 || f >= 0) {
        headerRow = ri;
        planCol = p;
        factCol = f;
        const l = headerIndex(texts, ['статья','наименование','показатель','article','name']);
        if (l >= 0) labelCol = l;
        break;
      }
    }

    const start = headerRow >= 0 ? headerRow + 1 : 0;
    for (let ri = start; ri < grid.length; ri++) {
      const line = Array.isArray(grid[ri]) ? grid[ri] : [];
      if (!line.length) continue;
      let foundLabelCol = labelCol;
      if (typeof line[foundLabelCol] !== 'string' || !String(line[foundLabelCol]).trim()) {
        foundLabelCol = line.findIndex(v => typeof v === 'string' && String(v).trim().length);
      }
      if (foundLabelCol < 0) continue;
      const label = String(line[foundLabelCol]).trim();
      const article = classifyArticle(label);
      if (!article) continue;

      let plan = planCol >= 0 ? parseNumberCell(line[planCol]) : null;
      let fact = factCol >= 0 ? parseNumberCell(line[factCol]) : null;
      if (planCol < 0 || factCol < 0) {
        const numeric = [];
        for (let ci = foundLabelCol + 1; ci < line.length; ci++) {
          const n = parseNumberCell(line[ci]);
          if (n !== null) numeric.push({ ci, n });
        }
        if (planCol < 0) plan = numeric[0]?.n ?? null;
        if (factCol < 0) fact = numeric[1]?.n ?? numeric[0]?.n ?? null;
      }
      out.push({
        id: crypto.randomUUID(),
        article,
        label,
        plan,
        fact,
        source: `xlsx:${sheetName}`,
        sheet: sheetName,
        sourceRow: ri + 1,
        sourceCellPlan: planCol >= 0 ? XLSX.utils.encode_cell({ r: ri, c: planCol }) : null,
        sourceCellFact: factCol >= 0 ? XLSX.utils.encode_cell({ r: ri, c: factCol }) : null,
      });
    }
  }
  return out;
}

/* ----------------------------- express app ---------------------------------- */
const app = express();
app.disable('x-powered-by');
app.use(corsMiddleware);
app.use(express.json({ limit: '12mb' }));

// Request-ID сквозной (frontend шлёт X-Request-ID).
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || uuid();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
});
// Auth-context: не подставляем синтетического пользователя. req.user = null → 401 на requireAuth.
app.use(async (req, _res, next) => {
  try { req.user = await authenticate(req); } catch (e) { log('authMiddleware error:', e.message); req.user = null; }
  next();
});

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data, requestId: res.req?.requestId || undefined });

/* ---- health ---- */
app.get('/healthz', async (_req, res) => {
  const dbOk = !!ENV.DB_HOST;
  let dbReachable = false;
  if (dbOk) {
    try { await query('SELECT 1'); dbReachable = true; kickSchema(); } catch (e) { log('healthz db:', e.message); }
  }
  ok(res, {
    status: 'ok',
    version: '5.0.2',
    time: new Date().toISOString(),
    db: dbOk ? (dbReachable ? 'connected' : 'configured-unreachable') : 'not-configured',
    ai: ENV.YANDEXGPT_API_KEY ? 'configured' : 'not-configured',
    storage: ENV.STORAGE_BUCKET ? 'configured' : 'not-configured',
  });
});

/* ---- auth: unlock (код существует только в env/secret storage) ---- */
app.post('/auth/unlock', async (req, res) => {
  const body = parseOr400(UnlockSchema, req.body ?? {});
  if (ENV.DB_HOST) await ensureSchemaNow();
  const hash = String(ENV.UNLOCK_CODE_HASH || '');
  if (!hash || !hash.startsWith('$2')) {
    return res.status(503).json({ error: { message: 'Сервер авторизации не настроен. Укажите bcrypt-хеш кода доступа в secret storage.', code: 'AUTH_NOT_CONFIGURED', requestId: req.requestId } });
  }
  try {
    if (bcrypt.getRounds(hash) !== ENV.BCRYPT_ROUNDS) {
      return res.status(503).json({ error: { message: 'Сервер авторизации требует bcrypt cost 12.', code: 'AUTH_HASH_CONFIG', requestId: req.requestId } });
    }
  } catch {
    return res.status(503).json({ error: { message: 'Сервер авторизации настроен некорректно.', code: 'AUTH_HASH_CONFIG', requestId: req.requestId } });
  }

  const ip = String(req.ip || 'unknown').slice(0, 255);
  const rate = await query(
    `INSERT INTO auth_unlock_attempts (ip, window_started_at, failed_attempts, blocked_until)
     VALUES ($1, now(), 0, NULL)
     ON CONFLICT (ip) DO UPDATE SET
       failed_attempts = CASE
         WHEN auth_unlock_attempts.window_started_at < now() - interval '15 minutes' THEN 0
         ELSE auth_unlock_attempts.failed_attempts
       END,
       window_started_at = CASE
         WHEN auth_unlock_attempts.window_started_at < now() - interval '15 minutes' THEN now()
         ELSE auth_unlock_attempts.window_started_at
       END,
       blocked_until = CASE
         WHEN auth_unlock_attempts.window_started_at < now() - interval '15 minutes' THEN NULL
         ELSE auth_unlock_attempts.blocked_until
       END
     RETURNING failed_attempts, blocked_until`,
    [ip]
  );
  const blockedUntil = rate.rows?.[0]?.blocked_until ? new Date(rate.rows[0].blocked_until) : null;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    return res.status(429).json({ error: { message: 'Слишком много попыток. Повторите вход позже.', code: 'AUTH_RATE_LIMITED', requestId: req.requestId } });
  }

  const match = await bcrypt.compare(String(body.code), hash);
  if (!match) {
    const failed = await query(
      `UPDATE auth_unlock_attempts
       SET failed_attempts = failed_attempts + 1,
           blocked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '30 minutes' ELSE blocked_until END
       WHERE ip = $1
       RETURNING failed_attempts, blocked_until`,
      [ip]
    );
    const row = failed.rows?.[0];
    await audit(null, 'auth.unlock.denied', 'auth', null, { ip, attempts: row?.failed_attempts || 1 });
    return res.status(401).json({ error: { message: 'Неверный код доступа', code: 'INVALID_CODE', requestId: req.requestId } });
  }

  await query('DELETE FROM auth_unlock_attempts WHERE ip = $1', [ip]);

  // Пользователь берётся из БД (users по ADMIN_EMAIL), а не выдумывается.
  let user = null;
  if (ENV.DB_HOST) {
    const rows = await safeQuery('SELECT id, email, role, organization_id, first_name, last_name FROM users WHERE lower(email) = lower($1) AND is_active = true LIMIT 1', [ENV.ADMIN_EMAIL], null);
    user = rows?.[0] || null;
  }
  if (!user) {
    return res.status(503).json({ error: { message: 'Учётная запись не найдена в базе. Обратитесь к администратору.', code: 'USER_NOT_PROVISIONED', requestId: req.requestId } });
  }
  const claims = { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id };
  const token = createJWT(claims);
  await audit({ id: user.id, organizationId: user.organization_id }, 'auth.unlock.ok', 'auth', user.id, {});
  ok(res, {
    token,
    user: {
      id: user.id, email: user.email, role: user.role,
      firstName: user.first_name, lastName: user.last_name,
      organizationId: user.organization_id, permissions: { '*': 'edit' },
    },
  });
});

/* ---- auth: me ---- */
app.get('/auth/me', requireAuth, (req, res) => ok(res, { user: publicUser(req.user) }));

/* ---- P&L scope helpers ---- */
function scopeFromQuery(q) {
  return {
    period: String(q.period || ''),
    project_id: String(q.project_id || ''),
    branch_id: String(q.branch_id || ''),
    restaurant_id: String(q.restaurant_id || ''),
    department_id: String(q.department_id || ''),
  };
}
const ALIASES = {
  revenue: 'revenue', выручка: 'revenue',
  cogs: 'cogs', себестоимость: 'cogs',
  payroll: 'payroll', personnel: 'payroll', фот: 'payroll',
  opex: 'opex', 'операционные расходы': 'opex', 'операционные затраты': 'opex',
  overtime: 'overtime', 'переработки': 'overtime', 'сверхурочные': 'overtime', 'overtime hours': 'overtime',
  other_operating: 'other_operating', 'прочее операционные': 'other_operating', 'other operating': 'other_operating',
  depreciation: 'depreciation', амортизация: 'depreciation',
  interest: 'interest', проценты: 'interest',
  tax: 'tax', налоги: 'tax',
  other: 'other', прочее: 'other',
};
function normalizeArticleKey(value) {
  return String(value || '').normalize('NFC').trim().toLocaleLowerCase('ru-RU').replace(/[–—-]+/g, ' ').replace(/\s+/g, ' ');
}
function canonicalArticleKey(value) {
  const key = normalizeArticleKey(value);
  return ALIASES[key] || key;
}
function canonicalArticleLabel(value) {
  switch (canonicalArticleKey(value)) {
    case 'revenue': return 'Выручка';
    case 'cogs': return 'Себестоимость';
    case 'payroll': return 'ФОТ';
    case 'opex': return 'OPEX';
    case 'depreciation': return 'Амортизация';
    case 'interest': return 'Проценты';
    case 'tax': return 'Налоги';
    case 'other': return 'Прочее';
    default: return String(value || '').trim() || 'Без названия';
  }
}
function aggregateRows(rows) {
  const byArticle = new Map();
  for (const r of rows) {
    const key = canonicalArticleKey(r.article);
    const cur = byArticle.get(key) || { article: canonicalArticleLabel(r.article), plan: null, fact: null, sources: new Set() };
    if (r.plan !== null && r.plan !== undefined && Number.isFinite(Number(r.plan))) cur.plan = (cur.plan ?? 0) + Number(r.plan);
    if (r.fact !== null && r.fact !== undefined && Number.isFinite(Number(r.fact))) cur.fact = (cur.fact ?? 0) + Number(r.fact);
    if (r.source) cur.sources.add(String(r.source));
    byArticle.set(key, cur);
  }
  return [...byArticle.values()].map(x => ({ ...x, source: [...x.sources].join(',') || null }));
}
function rollupAgg(agg) {
  const byKey = new Map((agg || []).map(x => [canonicalArticleKey(x.article), x]));
  const pick = (key, field = 'fact') => {
    const row = byKey.get(canonicalArticleKey(key));
    return row && row[field] !== undefined ? row[field] : null;
  };
  return {
    revenue: pick('revenue'),
    cogs: pick('cogs'),
    personnel: pick('payroll'),
    overtime: pick('overtime'),
    opex: pick('opex'),
    other_operating: pick('other_operating'),
    depreciation: pick('depreciation'),
    interest: pick('interest'),
    tax: pick('tax'),
    other: pick('other'),
  };
}

/* ---- authoritative workspace context / chat-room binding ------------------ */
const WorkspaceContextSchema = z.object({
  restaurant_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
}).strict();

const BindingSchema = z.object({
  channel: z.enum(['telegram','whatsapp','web']),
  subject_id: z.string().trim().min(1).max(160),
  unit_id: z.string().uuid(),
  is_default: z.boolean().optional(),
}).strict();

async function getAccessibleRestaurants(user) {
  const explicit = await safeQuery(
    `SELECT u.id,u.name,u.parent_id,u.kind
       FROM org_units u
       JOIN org_unit_access a ON a.unit_id=u.id AND a.organization_id=u.organization_id
      WHERE u.organization_id=$1::uuid AND a.user_id=$2
        AND u.kind='restaurant'
      ORDER BY u.name`,
    [user.organizationId, user.id], null
  );
  if (explicit && explicit.length) return explicit;
  if (['super_admin','owner'].includes(String(user.role || '').toLowerCase())) {
    return safeQuery(
      `SELECT id,name,parent_id,kind FROM org_units WHERE organization_id=$1::uuid AND kind='restaurant' ORDER BY name`,
      [user.organizationId], []
    );
  }
  return [];
}

async function assertRestaurantAccess(user, restaurantId) {
  if (!restaurantId) return true;
  const r = await safeQuery(
    'SELECT id, parent_id, kind FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid AND kind=\'restaurant\' LIMIT 1',
    [restaurantId, user.organizationId], null
  );
  if (!r?.[0]) throw httpError(404, 'Ресторан не найден в текущей организации.', 'RESTAURANT_NOT_FOUND');
  const explicit = await safeQuery(
    'SELECT 1 FROM org_unit_access WHERE organization_id=$1::uuid AND user_id=$2 AND unit_id=$3::uuid LIMIT 1',
    [user.organizationId, user.id, restaurantId], []
  );
  if (explicit.length || ['super_admin','owner'].includes(String(user.role || '').toLowerCase())) return true;
  throw httpError(403, 'Нет доступа к выбранному ресторану.', 'RESTAURANT_FORBIDDEN');
}

async function assertScopeAccess(user, scope = {}) {
  const restaurantIds = new Set();
  if (scope.restaurant_id) restaurantIds.add(String(scope.restaurant_id));
  if (scope.department_id) {
    const rows = await safeQuery(
      'SELECT parent_id FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid AND kind=\'department\' LIMIT 1',
      [scope.department_id,user.organizationId], null
    );
    if (!rows?.[0]) throw httpError(404,'Отдел не найден в текущей организации.','DEPARTMENT_NOT_FOUND');
    if (rows[0].parent_id) restaurantIds.add(String(rows[0].parent_id));
  }
  if (scope.branch_id) {
    const rows = await safeQuery(
      'SELECT id FROM org_units WHERE parent_id=$1::uuid AND organization_id=$2::uuid AND kind=\'restaurant\' ORDER BY id',
      [scope.branch_id,user.organizationId], null
    );
    if (!rows) throw httpError(503,'Не удалось проверить доступ к филиалу.','SCOPE_ACCESS_CHECK_FAILED');
    rows.forEach(r => restaurantIds.add(String(r.id)));
  }
  if (scope.project_id) {
    const branches = await safeQuery(
      'SELECT id FROM org_units WHERE parent_id=$1::uuid AND organization_id=$2::uuid AND kind=\'branch\' ORDER BY id',
      [scope.project_id,user.organizationId], null
    );
    if (!branches) throw httpError(503,'Не удалось проверить доступ к проекту.','SCOPE_ACCESS_CHECK_FAILED');
    for (const b of branches) {
      const restaurants = await safeQuery(
        'SELECT id FROM org_units WHERE parent_id=$1::uuid AND organization_id=$2::uuid AND kind=\'restaurant\' ORDER BY id',
        [b.id,user.organizationId], null
      );
      if (!restaurants) throw httpError(503,'Не удалось проверить доступ к проекту.','SCOPE_ACCESS_CHECK_FAILED');
      restaurants.forEach(r => restaurantIds.add(String(r.id)));
    }
  }
  for (const id of restaurantIds) await assertRestaurantAccess(user,id);
  return true;
}

async function resolveWorkspaceContext(user, supplied = {}, persist = false) {
  const requestedRestaurant = supplied.restaurant_id ? String(supplied.restaurant_id) : null;
  if (requestedRestaurant) await assertRestaurantAccess(user, requestedRestaurant);
  let current = null;
  const saved = await safeQuery(
    'SELECT restaurant_id,project_id,branch_id,department_id FROM workspace_contexts WHERE organization_id=$1::uuid AND user_id=$2 LIMIT 1',
    [user.organizationId, user.id], []
  );
  if (saved[0]) current = saved[0];
  const restaurantId = requestedRestaurant || current?.restaurant_id || null;
  if (restaurantId) await assertRestaurantAccess(user, restaurantId);
  if (persist) {
    await queryWithRetry(
      `INSERT INTO workspace_contexts(organization_id,user_id,restaurant_id,project_id,branch_id,department_id,updated_at)
       VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,now())
       ON CONFLICT(organization_id,user_id) DO UPDATE SET restaurant_id=excluded.restaurant_id,project_id=excluded.project_id,branch_id=excluded.branch_id,department_id=excluded.department_id,updated_at=now()`,
      [user.organizationId,user.id,restaurantId,supplied.project_id||null,supplied.branch_id||null,supplied.department_id||null],
      {orgId:user.organizationId}
    );
  }
  return {
    restaurant_id: restaurantId,
    project_id: supplied.project_id ?? current?.project_id ?? null,
    branch_id: supplied.branch_id ?? current?.branch_id ?? null,
    department_id: supplied.department_id ?? current?.department_id ?? null,
  };
}

app.get('/api/b2b/context', requireAuth, requireOrg, async (req,res,next)=>{try{
  const restaurants=await getAccessibleRestaurants(req.user);
  const saved=await safeQuery('SELECT restaurant_id,project_id,branch_id,department_id,updated_at FROM workspace_contexts WHERE organization_id=$1::uuid AND user_id=$2 LIMIT 1',[req.user.organizationId,req.user.id],[]);
  ok(res,{context:saved[0]||{restaurant_id:null,project_id:null,branch_id:null,department_id:null},restaurants});
}catch(e){next(e)}});

app.put('/api/b2b/context', requireAuth, requireOrg, async (req,res,next)=>{try{
  const body=parseOr400(WorkspaceContextSchema,req.body??{});
  const context=await resolveWorkspaceContext(req.user,body,true);
  await audit(req.user,'workspace.context.changed','workspace_contexts',req.user.id,{restaurant_id:context.restaurant_id});
  ok(res,{context,confirmed:true});
}catch(e){next(e)}});

app.get('/api/b2b/bindings', requireAuth, requireOrg, async (req,res,next)=>{try{
  const rows=await safeQuery(
    `SELECT b.id,b.channel,b.subject_id,b.unit_id,u.name AS unit_name,b.is_default,b.created_at,b.updated_at
       FROM workspace_bindings b JOIN org_units u ON u.id=b.unit_id AND u.organization_id=b.organization_id
      WHERE b.organization_id=$1::uuid ORDER BY b.channel,b.subject_id`,
    [req.user.organizationId], []
  );
  ok(res,{bindings:rows});
}catch(e){next(e)}});

app.post('/api/b2b/bindings', requireAuth, requireOrg, async (req,res,next)=>{try{
  const body=parseOr400(BindingSchema,req.body??{});
  await assertRestaurantAccess(req.user,body.unit_id);
  const unit=await safeQuery('SELECT id,kind FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1',[body.unit_id,req.user.organizationId],[]);
  if(unit[0]?.kind!=='restaurant') throw httpError(400,'Связать канал можно только с рестораном.','BINDING_UNIT_INVALID');
  if(body.is_default) await queryWithRetry('UPDATE workspace_bindings SET is_default=false,updated_at=now() WHERE organization_id=$1::uuid AND channel=$2',[req.user.organizationId,body.channel],{orgId:req.user.organizationId});
  const id=uuid();
  await queryWithRetry(
    `INSERT INTO workspace_bindings(id,organization_id,channel,subject_id,unit_id,is_default,updated_at)
     VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6,now())
     ON CONFLICT(organization_id,channel,subject_id) DO UPDATE SET unit_id=excluded.unit_id,is_default=excluded.is_default,updated_at=now()`,
    [id,req.user.organizationId,body.channel,body.subject_id,body.unit_id,Boolean(body.is_default)],
    {orgId:req.user.organizationId}
  );
  await audit(req.user,'workspace.binding.saved','workspace_bindings',id,{channel:body.channel,subject_id:body.subject_id,unit_id:body.unit_id});
  const saved=await safeQuery('SELECT b.id,b.channel,b.subject_id,b.unit_id,u.name AS unit_name,b.is_default FROM workspace_bindings b JOIN org_units u ON u.id=b.unit_id WHERE b.id=$1::uuid AND b.organization_id=$2::uuid LIMIT 1',[id,req.user.organizationId],null);
  ok(res,{binding:saved?.[0]||null,confirmed:Boolean(saved?.[0])},201);
}catch(e){next(e)}});

app.delete('/api/b2b/bindings/:id', requireAuth, requireOrg, async(req,res,next)=>{try{
  if(!UUID_RE.test(req.params.id)) throw httpError(400,'Некорректный id связи','BAD_ID');
  const del=await queryWithRetry('DELETE FROM workspace_bindings WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id',[req.params.id,req.user.organizationId],{orgId:req.user.organizationId});
  if(!del.rows.length) throw httpError(404,'Связь не найдена','NOT_FOUND');
  await audit(req.user,'workspace.binding.deleted','workspace_bindings',req.params.id,{});
  ok(res,{deleted:true,confirmed:true});
}catch(e){next(e)}});

async function resolveInboundBinding(user, channel, subjectId) {
  if (!subjectId) return null;
  const rows = user?.organizationId
    ? await safeQuery(
        'SELECT b.id,b.unit_id,b.is_default,u.name AS unit_name FROM workspace_bindings b JOIN org_units u ON u.id=b.unit_id AND u.organization_id=b.organization_id WHERE b.organization_id=$1::uuid AND b.channel=$2 AND b.subject_id=$3 LIMIT 1',
        [user.organizationId,channel,String(subjectId)],[])
    : await safeQuery(
        'SELECT b.id,b.organization_id,b.unit_id,b.is_default,u.name AS unit_name FROM workspace_bindings b JOIN org_units u ON u.id=b.unit_id AND u.organization_id=b.organization_id WHERE b.channel=$1 AND b.subject_id=$2 ORDER BY b.is_default DESC,b.updated_at DESC LIMIT 1',
        [channel,String(subjectId)],[]);
  return rows[0]||null;
}

/* ---- P&L transactions: отдельный журнал фактических доходов/расходов ---- */
app.get('/api/pnl/transactions', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const q = scopeFromQuery(req.query);
    await assertScopeAccess(req.user, q);
    if (!YM_RE.test(q.period)) throw httpError(400, 'Некорректный период (ожидается ГГГГ-ММ)', 'BAD_PERIOD');
    const rows = await safeQuery(
      `SELECT id, transaction_date, type, article, amount, comment, created_at
       FROM pnl_transactions
       WHERE organization_id=$1::uuid AND period=$2
         AND ($3::text='' OR project_id=$3)
         AND ($4::text='' OR branch_id=$4)
         AND ($5::text='' OR restaurant_id=$5)
         AND ($6::text='' OR department_id=$6)
       ORDER BY transaction_date DESC, created_at DESC LIMIT 1000`,
      [req.user.organizationId,q.period,q.project_id,q.branch_id,q.restaurant_id,q.department_id], []
    );
    ok(res,{period:q.period,scope:q,transactions:rows.map(x=>({...x,amount:Number(x.amount)})),count:rows.length});
  } catch(e){next(e);}
});

app.post('/api/pnl/transactions', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body=parseOr400(PnlTransactionSchema,req.body??{});
    await assertScopeAccess(req.user, body);
    if(body.date.slice(0,7)!==body.period) throw httpError(400,'Дата операции не относится к выбранному периоду','DATE_PERIOD_MISMATCH');
    const scope=[body.project_id||'',body.branch_id||'',body.restaurant_id||'',body.department_id||''];
    const existing=await safeQuery(
      `SELECT rows::text FROM pnl_entries
       WHERE organization_id=$1::uuid AND period=$2 AND project_id=$3 AND branch_id=$4 AND restaurant_id=$5 AND department_id=$6 LIMIT 1`,
      [req.user.organizationId,body.period,...scope],[]
    );
    let rows=[];
    try{rows=existing[0]?.rows?JSON.parse(existing[0].rows):[]}catch{rows=[]}
    const articleKey=canonicalArticleKey(body.article);
    const articleExists=rows.some(r=>canonicalArticleKey(r.article)===articleKey);
    if(!articleExists) throw httpError(422,'Статья не найдена в P&L выбранного рабочего контура. Сначала добавьте её в основной P&L.','ARTICLE_NOT_IN_PNL');
    const id=uuid();
    await queryWithRetry(
      `INSERT INTO pnl_transactions(id,organization_id,period,transaction_date,type,project_id,branch_id,restaurant_id,department_id,article,amount,comment,created_by)
       VALUES($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,req.user.organizationId,body.period,body.date,body.type,body.project_id||'',body.branch_id||'',body.restaurant_id||'',body.department_id||'',body.article.trim(),body.amount,body.comment||null,req.user.id],
      {orgId:req.user.organizationId}
    );
    const verify=await safeQuery(
      `SELECT id,transaction_date,type,article,amount,comment,created_at FROM pnl_transactions WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1`,
      [id,req.user.organizationId],null
    );
    const confirmed=Boolean(verify?.[0]);
    await audit(req.user,confirmed?'pnl.transaction.confirmed':'pnl.transaction.unconfirmed','pnl_transactions',id,{period:body.period,type:body.type,article:body.article,amount:body.amount,scope});
    if(!confirmed) return res.status(500).json({error:{message:'Операция сохранена не подтверждена сервером (readback failed)',code:'TRANSACTION_NOT_CONFIRMED',requestId:req.requestId}});
    ok(res,{saved:true,confirmed:true,transaction:{...verify[0],amount:Number(verify[0].amount)}},201);
  } catch(e){next(e);}
});

/* ---- GET /api/pnl — readback по scope (All = все дочерние внутри родителя) ---- */
app.get('/api/pnl', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const s = scopeFromQuery(req.query);
    await assertScopeAccess(req.user, s);
    if (!YM_RE.test(s.period)) throw httpError(400, 'Некорректный период (ожидается ГГГГ-ММ)', 'BAD_PERIOD');
    const rows = await safeQuery(
      `SELECT rows::text FROM pnl_entries
        WHERE organization_id = $1::uuid AND period = $2
          AND ($3::text = '' OR project_id = $3)
          AND ($4::text = '' OR branch_id = $4)
          AND ($5::text = '' OR restaurant_id = $5)
          AND ($6::text = '' OR department_id = $6)`,
      [req.user.organizationId, s.period, s.project_id, s.branch_id, s.restaurant_id, s.department_id]
    );
    const all = [];
    for (const r of rows) { try { const parsed = JSON.parse(r.rows); if (Array.isArray(parsed)) all.push(...parsed); } catch { /* ignore broken json row */ } }
    let aggregated = aggregateRows(all);
    const txRows = await safeQuery(
      `SELECT article, SUM(amount) AS total, COUNT(*)::int AS count
       FROM pnl_transactions
       WHERE organization_id=$1::uuid AND period=$2
         AND ($3::text='' OR project_id=$3)
         AND ($4::text='' OR branch_id=$4)
         AND ($5::text='' OR restaurant_id=$5)
         AND ($6::text='' OR department_id=$6)
       GROUP BY article`,
      [req.user.organizationId,s.period,s.project_id,s.branch_id,s.restaurant_id,s.department_id]
    );
    const txByKey=new Map(txRows.map(x=>[canonicalArticleKey(x.article),{total:Number(x.total||0),count:Number(x.count||0)}]));
    aggregated=aggregated.map(x=>{
      const tx=txByKey.get(canonicalArticleKey(x.article));
      if(!tx)return x;
      return {...x,fact:x.fact===null||x.fact===undefined?tx.total:Number(x.fact)+tx.total,transaction_total:tx.total,transaction_count:tx.count,source:[x.source,'transactions'].filter(Boolean).join(',')};
    });
    const filled = aggregated.filter(x => x.plan !== null || x.fact !== null).length;
    const fact = rollupAgg(aggregated);
    const planRows = aggregated.map(x => ({ ...x, fact: x.plan, plan: null }));
    const plan = rollupAgg(planRows);
    const summary = {
      revenuePlan: (() => { const o = aggregated.find(x => normKey(x.article) === normKey('revenue') || normKey(x.article) === normKey('выручка')); return o ? (o.plan ?? null) : null; })(),
      revenueFact: (() => { const o = aggregated.find(x => normKey(x.article) === normKey('revenue') || normKey(x.article) === normKey('выручка')); return o ? (o.fact ?? null) : null; })(),
      filledRows: filled,
      scope: s,
      calculated: { fact: calculatePnl(fact), plan: calculatePnl(plan) },
    };
    ok(res, { period: s.period, scope: s, rows: aggregated, summary, calculated: summary.calculated, count: all.length });
  } catch (e) { next(e); }
});

/* ---- POST /api/pnl — сохранение scope+периода + READBACK подтверждение ---- */
app.post('/api/pnl', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(PnlWriteSchema, req.body ?? {});
    if (body.restaurant_id) await assertRestaurantAccess(req.user, body.restaurant_id);
    const cleanRows = body.rows.map(r => ({
      id: r.id || null,
      article: String(r.article).normalize('NFC').trim(),
      plan: r.plan ?? null,
      fact: r.fact ?? null,
      source: r.source || 'manual',
    }));
    const writeRes = await queryWithRetry(
      `INSERT INTO pnl_entries (organization_id, period, project_id, branch_id, restaurant_id, department_id, rows, updated_at, updated_by)
       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::jsonb, now(), $8)
       ON CONFLICT (organization_id, period, project_id, branch_id, restaurant_id, department_id)
       DO UPDATE SET rows = excluded.rows, updated_at = now(), updated_by = excluded.updated_by
       RETURNING jsonb_array_length(rows) AS saved_count`,
      [req.user.organizationId, body.period, body.project_id || '', body.branch_id || '', body.restaurant_id || '', body.department_id || '', JSON.stringify(cleanRows), req.user.id],
      { orgId: req.user.organizationId }
    );
    // Подтверждение через RETURNING — readback в той же сессии, что и запись.
    const savedCount = writeRes?.rows?.[0]?.saved_count ?? -1;
    const confirmed = savedCount === cleanRows.length;
    await audit(req.user, confirmed ? 'pnl.save.confirmed' : 'pnl.save.unconfirmed', 'pnl_entries', `${body.period}|${body.project_id || ''}|${body.branch_id || ''}|${body.restaurant_id || ''}|${body.department_id || ''}`, { rows: cleanRows.length });
    if (!confirmed) {
      return res.status(500).json({ error: { message: 'Сохранение не подтверждено сервером (readback failed)', code: 'SAVE_NOT_CONFIRMED', requestId: req.requestId } });
    }
    ok(res, { saved: true, confirmed: true, count: savedCount, period: body.period });
  } catch (e) { next(e); }
});

/* ---- P&L approval ---- */
const APPROVER_ROLES = new Set((process.env.PNL_APPROVER_ROLES || 'super_admin,admin,director,owner').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
app.get('/api/pnl/approval', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const s = scopeFromQuery(req.query);
    if (s.restaurant_id) await assertRestaurantAccess(req.user, s.restaurant_id);
    if (!YM_RE.test(s.period)) throw httpError(400, 'Некорректный период (ожидается ГГГГ-ММ)', 'BAD_PERIOD');
    const rows = await safeQuery(
      `SELECT status, approved_by, approved_at FROM pnl_approvals WHERE organization_id=$1::uuid AND period=$2 AND project_id=$3 AND branch_id=$4 AND restaurant_id=$5 AND department_id=$6 LIMIT 1`,
      [req.user.organizationId, s.period, s.project_id, s.branch_id, s.restaurant_id, s.department_id], []
    );
    ok(res, { status: rows[0]?.status || 'draft', approvedAt: rows[0]?.approved_at || null, canApprove: APPROVER_ROLES.has(String(req.user.role || '').toLowerCase()), scope: s });
  } catch (e) { next(e); }
});
app.post('/api/pnl/approve', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!APPROVER_ROLES.has(String(req.user.role || '').toLowerCase())) throw httpError(403, 'У Вас нет права утверждать план.', 'FORBIDDEN_APPROVAL');
    const s = scopeFromQuery(req.body || {});
    if (s.restaurant_id) await assertRestaurantAccess(req.user, s.restaurant_id);
    if (!YM_RE.test(s.period)) throw httpError(400, 'Некорректный период (ожидается ГГГГ-ММ)', 'BAD_PERIOD');
    const exists = await safeQuery(
      `SELECT 1 FROM pnl_entries WHERE organization_id=$1::uuid AND period=$2 AND project_id=$3 AND branch_id=$4 AND restaurant_id=$5 AND department_id=$6 LIMIT 1`,
      [req.user.organizationId, s.period, s.project_id, s.branch_id, s.restaurant_id, s.department_id], []
    );
    if (!exists?.length) throw httpError(409, 'Нельзя утвердить план: P&L для выбранной области не сохранён.', 'PNL_NOT_FOUND');
    await queryWithRetry(
      `INSERT INTO pnl_approvals (organization_id,period,project_id,branch_id,restaurant_id,department_id,status,approved_by,approved_at)
       VALUES ($1::uuid,$2,$3,$4,$5,$6,'approved',$7,now())
       ON CONFLICT (organization_id,period,project_id,branch_id,restaurant_id,department_id)
       DO UPDATE SET status='approved',approved_by=excluded.approved_by,approved_at=now()`,
      [req.user.organizationId,s.period,s.project_id,s.branch_id,s.restaurant_id,s.department_id,req.user.id], { orgId:req.user.organizationId }
    );
    await audit(req.user,'pnl.approved','pnl_approvals',`${s.period}|${s.project_id}|${s.branch_id}|${s.restaurant_id}|${s.department_id}`,{});
    ok(res,{status:'approved',approvedAt:new Date().toISOString(),scope:s});
  } catch(e){next(e);}
});

/* ---- POST /api/pnl/calculate — детерминированный калькулятор ---- */
app.post('/api/pnl/calculate', requireAuth, (req, res, next) => {
  try {
    const body = parseOr400(PnlCalculateSchema, req.body ?? {});
    const src = (body.raw && typeof body.raw === 'object') ? body.raw : body;
    ok(res, calculatePnl(src));
  } catch (e) { next(e); }
});

/* ---- POST /api/pnl/import — Excel → строки статей (без молчаливой записи) ---- */
app.post('/api/pnl/import', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(PnlImportSchema, req.body ?? {});
    let buf;
    try { buf = Buffer.from(body.dataBase64, 'base64'); } catch { throw httpError(400, 'dataBase64 некорректен', 'BAD_BASE64'); }
    if (!buf.length || buf.length > ENV.MAX_UPLOAD_BYTES) throw httpError(413, 'Файл пуст или превышает лимит 15 МБ', 'FILE_TOO_LARGE');
    let rows = [];
    try { rows = documentProcessor.xlsxRows(buf); } catch (e) { throw httpError(400, `Не удалось разобрать файл: ${e.message}`, 'XLSX_PARSE_ERROR'); }
    if (!rows.length) throw httpError(400, 'В файле не найдено распознанных статей (нужны подписанные строки: выручка, себестоимость, ФОТ, OPEX…)', 'NO_ARTICLES_DETECTED');
    // Импорт НЕ пишет в БД молча: возвращаем candidate rows для явного решения пользователя.
    await audit(req.user, 'pnl.import.prepared', 'pnl_import', body.name, { detected: rows.length, period: body.period });
    ok(res, {
      detected: rows.length,
      period: body.period,
      rows,
      totals: calculatePnl(rollupAgg(aggregateRows(rows))),
      requiresConfirmation: true,
    }, 202);
  } catch (e) { next(e); }
});

function buildPlanFactAnalysis(agg) {
  const expenseKeys = new Set(['cogs','payroll','overtime','opex','other_operating','depreciation','interest','tax','other']);
  return (agg || []).map(row => {
    const plan = numOrNull(row.plan), fact = numOrNull(row.fact);
    const absolute = plan !== null && fact !== null ? fact - plan : null;
    const percent = plan !== null && fact !== null && plan !== 0 ? (absolute / Math.abs(plan)) * 100 : null;
    const key = canonicalArticleKey(row.article);
    const favorable = absolute === null ? null : expenseKeys.has(key) ? absolute <= 0 : absolute >= 0;
    return { article: row.article, key, plan, fact, absolute, percent, favorable, source: row.source ?? null };
  });
}

function metricValue(values,key){const v=values?.[key];return typeof v==='number'&&Number.isFinite(v)?v:null;}
function fmtRub(v){return v===null||v===undefined?'Нет данных':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(v)+' ₽';}
function fmtPct(v){return v===null||v===undefined?'Нет данных':Number(v).toFixed(1).replace('.',',')+'%';}
function reportText(date, restaurant, values, pnlData, metrics){
  const revenue=metricValue(values,'revenue'), cash=metricValue(values,'cash'), card=metricValue(values,'card'), discounts=metricValue(values,'discounts'), checks=metricValue(values,'checks');
  const avgCheck=metricValue(values,'avgCheck') ?? (revenue!==null&&checks!==null&&checks>0?revenue/checks:null);
  const p=calculatePnl(rollupAgg(pnlData));
  const primeCost=(p.revenue!==null&&p.cogs!==null&&p.personnel!==null&&p.revenue!==0)?((p.cogs+p.personnel)/p.revenue)*100:null;
  const revenuePlan=pnlData.find(x=>canonicalArticleKey(x.article)==='revenue')?.plan;
  const deviation=(p.revenue!==null&&revenuePlan!==null&&Number.isFinite(revenuePlan)&&revenuePlan!==0)?((p.revenue-revenuePlan)/revenuePlan)*100:null;
  const lines=['📊 STEN · Итоги смены за '+date];
  if(restaurant)lines.push('Ресторан: '+restaurant);
  lines.push('');
  if(metrics.revenue)lines.push('💰 Выручка: '+fmtRub(revenue));
  if(metrics.cashCard)lines.push('   ├ Наличные: '+fmtRub(cash)+(revenue!==null&&cash!==null&&revenue!==0?' ('+fmtPct(cash/revenue*100)+')':'')+' · Карта: '+fmtRub(card)+(revenue!==null&&card!==null&&revenue!==0?' ('+fmtPct(card/revenue*100)+')':''));
  if(metrics.discounts)lines.push('   └ Скидки: '+fmtRub(discounts)+(revenue!==null&&discounts!==null&&revenue!==0?' ('+fmtPct(discounts/revenue*100)+')':''));
  if(metrics.avgCheck)lines.push('📈 Средний чек: '+fmtRub(avgCheck));
  if(metrics.checks)lines.push('🧾 Чеков: '+(checks===null?'Нет данных':String(checks)));
  if(metrics.primeCost)lines.push('🔥 Prime Cost: '+fmtPct(primeCost));
  if(metrics.ebitda)lines.push('📊 EBITDA: '+fmtRub(p.ebitda)+(p.ebitdaMargin!==null?' ('+fmtPct(p.ebitdaMargin)+')':''));
  if(metrics.deviation)lines.push('⚠️ Отклонение от плана: '+(Number.isFinite(deviation)?fmtPct(deviation):'Нет данных'));
  return lines.join('\n');
}
async function sendTelegram(chatId,textBody){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)throw httpError(503,'Telegram Bot API не настроен (TELEGRAM_BOT_TOKEN)','MESSENGER_NOT_CONFIGURED');
  const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:textBody})});
  if(!r.ok)throw httpError(502,'Telegram не принял отчёт','MESSENGER_UPSTREAM_ERROR');
  return {provider:'telegram',sent:true};
}
async function sendWhatsApp(phone,textBody){
  const token=process.env.WHATSAPP_ACCESS_TOKEN,phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID,version=process.env.WHATSAPP_API_VERSION;
  if(!token||!phoneId||!version)throw httpError(503,'WhatsApp Business API не настроен','MESSENGER_NOT_CONFIGURED');
  const r=await fetch('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'text',text:{body:textBody}})});
  if(!r.ok)throw httpError(502,'WhatsApp Business API не принял отчёт','MESSENGER_UPSTREAM_ERROR');
  return {provider:'whatsapp',sent:true};
}
async function loadReportMetrics(user,date,scope){
  const s=scope||{period:date.slice(0,7),project_id:'',branch_id:'',restaurant_id:'',department_id:''};
  const reportRows=await safeQuery('SELECT values_json FROM daily_reports WHERE organization_id=$1::uuid AND report_date=$2::date AND ($3::text=\'\' OR project_id=$3) AND ($4::text=\'\' OR branch_id=$4) AND ($5::text=\'\' OR restaurant_id=$5) AND ($6::text=\'\' OR department_id=$6) LIMIT 1',[user.organizationId,date,s.project_id||'',s.branch_id||'',s.restaurant_id||'',s.department_id||''],[]);
  const values=reportRows[0]?.values_json||{};
  const rows=await safeQuery('SELECT rows::text FROM pnl_entries WHERE organization_id=$1::uuid AND period=$2 AND ($3::text=\'\' OR project_id=$3) AND ($4::text=\'\' OR branch_id=$4) AND ($5::text=\'\' OR restaurant_id=$5) AND ($6::text=\'\' OR department_id=$6)',[user.organizationId,s.period,s.project_id||'',s.branch_id||'',s.restaurant_id||'',s.department_id||''],[]);
  const all=[];for(const r of rows){try{const parsed=JSON.parse(r.rows);if(Array.isArray(parsed))all.push(...parsed)}catch{}}
  const pnlData=aggregateRows(all);
  return {values,pnlData};
}

app.get('/api/ai/skills',requireAuth,requireOrg,async(req,res,next)=>{try{
  const rows=await safeQuery('SELECT config_json,updated_at FROM ai_skill_settings WHERE organization_id=$1::uuid LIMIT 1',[req.user.organizationId],[]);
  ok(res,{settings:rows[0]?{...rows[0].config_json,updated_at:rows[0].updated_at}:null});
 }catch(e){next(e)}});

app.put('/api/ai/skills',requireAuth,requireOrg,async(req,res,next)=>{try{
  const config=parseOr400(AiSkillsSchema,req.body??{});
  await queryWithRetry('INSERT INTO ai_skill_settings(organization_id,config_json,updated_at,updated_by) VALUES($1::uuid,$2::jsonb,now(),$3) ON CONFLICT(organization_id) DO UPDATE SET config_json=excluded.config_json,updated_at=now(),updated_by=excluded.updated_by',
    [req.user.organizationId,JSON.stringify(config),req.user.id],{orgId:req.user.organizationId});
  await audit(req.user,'ai.skills.updated','ai_skill_settings',req.user.organizationId,{keys:Object.keys(config)});
  ok(res,{saved:true,confirmed:true,settings:config});
}catch(e){next(e)}});

app.get('/api/analytics/settings',requireAuth,requireOrg,async(req,res,next)=>{try{
  const rows=await safeQuery('SELECT config_json,updated_at FROM analytics_settings WHERE organization_id=$1::uuid LIMIT 1',[req.user.organizationId],[]);
  ok(res,{settings:rows[0]?{...rows[0].config_json,updated_at:rows[0].updated_at}:null});
}catch(e){next(e)}});

app.put('/api/analytics/settings',requireAuth,requireOrg,async(req,res,next)=>{try{
  const config=parseOr400(AnalyticsSettingsSchema,req.body??{});
  await queryWithRetry('INSERT INTO analytics_settings(organization_id,config_json,updated_at,updated_by) VALUES($1::uuid,$2::jsonb,now(),$3) ON CONFLICT(organization_id) DO UPDATE SET config_json=excluded.config_json,updated_at=now(),updated_by=excluded.updated_by',
    [req.user.organizationId,JSON.stringify(config),req.user.id],{orgId:req.user.organizationId});
  await audit(req.user,'analytics.settings.updated','analytics_settings',req.user.organizationId,{keys:Object.keys(config)});
  ok(res,{saved:true,confirmed:true,settings:config});
}catch(e){next(e)}});

app.get('/api/messenger/settings',requireAuth,requireOrg,async(req,res,next)=>{try{
 const rows=await safeQuery('SELECT provider,send_time,scope_json,metrics_json,telegram_chat_id,whatsapp_phone,updated_at FROM messenger_settings WHERE organization_id=$1::uuid LIMIT 1',[req.user.organizationId],[]);
 const s=rows[0];ok(res,{settings:s?{provider:s.provider,send_time:s.send_time,scope:s.scope_json,metrics:s.metrics_json,telegram_chat_id:s.telegram_chat_id,whatsapp_phone:s.whatsapp_phone,updated_at:s.updated_at}:null});
}catch(e){next(e)}});

app.post('/api/messenger/settings',requireAuth,requireOrg,async(req,res,next)=>{try{
 const b=parseOr400(MessengerSettingsSchema,req.body??{});
 await queryWithRetry('INSERT INTO messenger_settings(organization_id,provider,send_time,scope_json,metrics_json,telegram_chat_id,whatsapp_phone,updated_at,updated_by) VALUES($1::uuid,$2,$3,$4::jsonb,$5::jsonb,$6,$7,now(),$8) ON CONFLICT(organization_id) DO UPDATE SET provider=excluded.provider,send_time=excluded.send_time,scope_json=excluded.scope_json,metrics_json=excluded.metrics_json,telegram_chat_id=excluded.telegram_chat_id,whatsapp_phone=excluded.whatsapp_phone,updated_at=now(),updated_by=excluded.updated_by',[req.user.organizationId,b.provider,b.send_time,JSON.stringify(b.scope),JSON.stringify(b.metrics),b.telegram_chat_id||null,b.whatsapp_phone||null,req.user.id],{orgId:req.user.organizationId});
 await audit(req.user,'messenger.settings.updated','messenger_settings',req.user.organizationId,{provider:b.provider});
 ok(res,{saved:true,confirmed:true});
}catch(e){next(e)}});

app.post('/api/reports/send',requireAuth,requireOrg,async(req,res,next)=>{try{
 const b=parseOr400(ReportsSendSchema,req.body??{});
 const settingsRows=await safeQuery('SELECT provider,scope_json,metrics_json,telegram_chat_id,whatsapp_phone FROM messenger_settings WHERE organization_id=$1::uuid LIMIT 1',[req.user.organizationId],[]);
 const settings=settingsRows[0]||{};
 const provider=b.provider||settings.provider;
 const metrics={revenue:true,cashCard:true,discounts:true,avgCheck:true,checks:true,primeCost:true,ebitda:true,deviation:true,...(settings.metrics_json||{}),...(b.metrics||{})};
 const recipient=b.recipient||(provider==='telegram'?settings.telegram_chat_id:settings.whatsapp_phone);
 if(!provider||!recipient)throw httpError(400,'Не выбран мессенджер или получатель','MESSENGER_RECIPIENT_REQUIRED');
 const scope=b.scope||settings.scope_json||{};
 await assertScopeAccess(req.user,scope);
 const data=await loadReportMetrics(req.user,b.date,scope);
 const restaurant=scope.restaurant_id||data.values.restaurant||null;
 const textBody=reportText(b.date,restaurant,data.values,data.pnlData,metrics);
 const result=provider==='telegram'?await sendTelegram(recipient,textBody):await sendWhatsApp(recipient,textBody);
 await audit(req.user,'report.sent','daily_reports',b.date,{provider,metrics});
 ok(res,{...result,date:b.date,preview:textBody});
}catch(e){next(e)}});

/* ---- reports ---- */
app.get('/reports', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const date = req.query.date ? String(req.query.date) : null;
    const reportScope = scopeFromQuery({ ...req.query, period: date ? String(date).slice(0,7) : new Date().toISOString().slice(0,7) });
    await assertScopeAccess(req.user, reportScope);
    const rows = await safeQuery(
      `SELECT id, report_date, project_id, branch_id, restaurant_id, department_id, values_json, note, updated_at
         FROM daily_reports
        WHERE organization_id = $1::uuid
          AND ($2::date IS NULL OR report_date = $2::date)
          AND ($3::text='' OR project_id=$3)
          AND ($4::text='' OR branch_id=$4)
          AND ($5::text='' OR restaurant_id=$5)
          AND ($6::text='' OR department_id=$6)
        ORDER BY report_date DESC LIMIT 366`,
      [req.user.organizationId, date, reportScope.project_id, reportScope.branch_id, reportScope.restaurant_id, reportScope.department_id], []
    );
    const reports = [];
    for (const r of rows) {
      const values = r.values_json || {};
      const scope = { period: String(r.report_date).slice(0, 7), project_id: r.project_id || '', branch_id: r.branch_id || '', restaurant_id: r.restaurant_id || '', department_id: r.department_id || '' };
      const pnlRows = await safeQuery('SELECT rows::text FROM pnl_entries WHERE organization_id=$1::uuid AND period=$2 AND project_id=$3 AND branch_id=$4 AND restaurant_id=$5 AND department_id=$6 LIMIT 1',
        [req.user.organizationId, scope.period, scope.project_id, scope.branch_id, scope.restaurant_id, scope.department_id], []);
      const all = [];
      for (const item of pnlRows) { try { const parsed = JSON.parse(item.rows); if (Array.isArray(parsed)) all.push(...parsed); } catch {} }
      const aggregated = aggregateRows(all);
      const fact = calculatePnl(rollupAgg(aggregated));
      reports.push({ id: r.id, date: r.report_date, values, note: r.note, updatedAt: r.updated_at, calculated: fact });
    }
    ok(res, { reports });
  } catch (e) { next(e); }
});
app.post('/reports', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(ReportWriteSchema, req.body ?? {});
    const reportScope = { project_id: body.project_id || '', branch_id: body.branch_id || '', restaurant_id: body.restaurant_id || '', department_id: body.department_id || '' };
    await assertScopeAccess(req.user, reportScope);
    await queryWithRetry(
      `INSERT INTO daily_reports (id, organization_id, report_date, project_id, branch_id, restaurant_id, department_id, values_json, note)
       VALUES ($1::uuid,$2::uuid,$3::date,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (organization_id, report_date, project_id, branch_id, restaurant_id, department_id)
       DO UPDATE SET values_json = excluded.values_json, note = excluded.note, updated_at = now()`,
      [uuid(), req.user.organizationId, body.date, reportScope.project_id, reportScope.branch_id, reportScope.restaurant_id, reportScope.department_id, JSON.stringify(body.values), body.note ?? null],
      { orgId: req.user.organizationId }
    );
    await audit(req.user, 'report.upsert', 'daily_reports', body.date, { keys: Object.keys(body.values).length });
    ok(res, { saved: true, date: body.date });
  } catch (e) { next(e); }
});
app.delete('/reports/:date', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!DATE_RE.test(req.params.date)) throw httpError(400, 'Некорректная дата', 'BAD_DATE');
    const reportScope = scopeFromQuery({ ...req.query, period: req.params.date.slice(0,7) });
    await assertScopeAccess(req.user, reportScope);
    await queryWithRetry('DELETE FROM daily_reports WHERE organization_id = $1::uuid AND report_date = $2::date AND ($3::text=\'\' OR project_id=$3) AND ($4::text=\'\' OR branch_id=$4) AND ($5::text=\'\' OR restaurant_id=$5) AND ($6::text=\'\' OR department_id=$6)',
      [req.user.organizationId, req.params.date, reportScope.project_id, reportScope.branch_id, reportScope.restaurant_id, reportScope.department_id], { orgId: req.user.organizationId });
    await audit(req.user, 'report.delete', 'daily_reports', req.params.date, {});
    ok(res, { deleted: true, date: req.params.date });
  } catch (e) { next(e); }
});

/* ---- Секретарь: календарь, встречи и задачи, без GPT ---- */
app.get('/api/secretary/events', requireAuth, requireOrg, async(req,res,next)=>{try{const from=String(req.query.from||new Date().toISOString()),to=String(req.query.to||new Date(Date.now()+31*86400000).toISOString());const rows=await safeQuery(`SELECT id,title,description,event_type,start_at,end_at,status,reminder_minutes,location,created_at,updated_at FROM secretary_events WHERE organization_id=$1::uuid AND start_at >= $2::timestamptz AND start_at < $3::timestamptz ORDER BY start_at ASC`,[req.user.organizationId,from,to],[]);ok(res,{events:rows||[]})}catch(e){next(e)}});
app.post('/api/secretary/events', requireAuth, requireOrg, async(req,res,next)=>{try{const b=req.body||{};if(!String(b.title||'').trim()||!b.start_at)throw httpError(400,'Название и начало события обязательны','BAD_EVENT');const id=uuid();const q=await queryWithRetry(`INSERT INTO secretary_events(id,organization_id,user_id,title,description,event_type,start_at,end_at,status,reminder_minutes,location) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11) RETURNING id,title,description,event_type,start_at,end_at,status,reminder_minutes,location,created_at,updated_at`,[id,req.user.organizationId,req.user.id,String(b.title).trim(),b.description||null,b.event_type||'meeting',b.start_at,b.end_at||null,b.status||'planned',b.reminder_minutes==null?30:Number(b.reminder_minutes),b.location||null],{orgId:req.user.organizationId});if(!q?.rows?.[0])throw httpError(500,'Событие не сохранено','SAVE_NOT_CONFIRMED');await audit(req.user,'secretary.event.created','secretary_events',id,{title:q.rows[0].title});ok(res,{event:q.rows[0],confirmed:true},201)}catch(e){next(e)}});
app.patch('/api/secretary/events/:id', requireAuth, requireOrg, async(req,res,next)=>{try{if(!UUID_RE.test(req.params.id))throw httpError(400,'Некорректный id','BAD_ID');const b=req.body||{},f=[],p=[req.params.id,req.user.organizationId];for(const [k,col] of [['title','title'],['description','description'],['event_type','event_type'],['start_at','start_at'],['end_at','end_at'],['status','status'],['reminder_minutes','reminder_minutes'],['location','location']])if(b[k]!==undefined){p.push(b[k]);f.push(`${col} = ${p.length}${k==='start_at'||k==='end_at'?'::timestamptz':''}`)}if(!f.length)throw httpError(400,'Нет изменений','NO_CHANGES');const q=await queryWithRetry(`UPDATE secretary_events SET ${f.join(',')},updated_at=now() WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id,title,description,event_type,start_at,end_at,status,reminder_minutes,location,created_at,updated_at`,p,{orgId:req.user.organizationId});if(!q?.rows?.[0])throw httpError(404,'Событие не найдено','NOT_FOUND');await audit(req.user,'secretary.event.updated','secretary_events',req.params.id,{fields:Object.keys(b)});ok(res,{event:q.rows[0],confirmed:true})}catch(e){next(e)}});
app.delete('/api/secretary/events/:id', requireAuth, requireOrg, async(req,res,next)=>{try{if(!UUID_RE.test(req.params.id))throw httpError(400,'Некорректный id','BAD_ID');const q=await queryWithRetry('DELETE FROM secretary_events WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id',[req.params.id,req.user.organizationId],{orgId:req.user.organizationId});if(!q?.rows?.[0])throw httpError(404,'Событие не найдено','NOT_FOUND');await audit(req.user,'secretary.event.deleted','secretary_events',req.params.id,{});ok(res,{deleted:true,confirmed:true})}catch(e){next(e)}});

/* ---- Секретарь: заметки/итоги встреч (детерминированный CRUD, без GPT) ---- */
app.get('/api/secretary/notes', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const rows = await safeQuery(
      `SELECT id, title, content, source, audio_url, created_at, updated_at
         FROM secretary_notes
        WHERE organization_id = $1::uuid AND ($2::uuid IS NULL OR user_id = $2::text)
        ORDER BY updated_at DESC LIMIT $3`,
      [req.user.organizationId, req.query.mine === '1' ? req.user.id : null, limit],
      null
    );
    if (!rows) return res.status(503).json({ error: { message: 'Заметки временно недоступны (БД)', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    ok(res, { notes: rows });
  } catch (e) { next(e); }
});

app.post('/api/secretary/notes', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(SecretaryNoteCreateSchema, req.body ?? {});
    const noteId = uuid();
    await queryWithRetry(
      `INSERT INTO secretary_notes (id, organization_id, user_id, title, content, source, audio_url)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7)`,
      [noteId, req.user.organizationId, req.user.id,
       body.title.normalize('NFC'), body.content.normalize('NFC'), body.source, body.audio_url ?? null],
      { orgId: req.user.organizationId }
    );
    // Readback-подтверждение: «сохранено» только если БД вернула запись.
    const verify = await safeQuery(
      `SELECT id, title, content, source, audio_url, created_at, updated_at
         FROM secretary_notes WHERE id = $1::uuid AND organization_id = $2::uuid LIMIT 1`,
      [noteId, req.user.organizationId], null
    );
    const saved = verify?.[0] || null;
    await audit(req.user, saved ? 'secretary.note.created' : 'secretary.note.unconfirmed', 'secretary_notes', noteId, { title: body.title });
    if (!saved) {
      return res.status(500).json({ error: { message: 'Сохранение не подтверждено сервером (readback failed)', code: 'SAVE_NOT_CONFIRMED', requestId: req.requestId } });
    }
    ok(res, { note: saved, confirmed: true }, 201);
  } catch (e) { next(e); }
});

app.patch('/api/secretary/notes/:id', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id заметки', 'BAD_ID');
    const body = parseOr400(SecretaryNotePatchSchema, req.body ?? {});
    const sets = []; const params = [req.params.id, req.user.organizationId];
    if (body.title !== undefined)     { params.push(body.title.normalize('NFC'));   sets.push(`title = $${params.length}`); }
    if (body.content !== undefined)   { params.push(body.content.normalize('NFC')); sets.push(`content = $${params.length}`); }
    if (body.audio_url !== undefined) { params.push(body.audio_url ?? null);        sets.push(`audio_url = $${params.length}`); }
    let saved = null;
    try {
      const upd = await queryWithRetry(
        `UPDATE secretary_notes SET ${sets.join(', ')}, updated_at = now()
          WHERE id = $1::uuid AND organization_id = $2::uuid
          RETURNING id, title, content, source, audio_url, created_at, updated_at`,
        params,
        { orgId: req.user.organizationId }
      );
      saved = upd?.rows?.[0] || null;
    } catch (e) { log('secretary patch error:', e.message); }
    if (!saved) {
      await audit(req.user, 'secretary.note.update.failed', 'secretary_notes', req.params.id, { fields: Object.keys(body) });
      return res.status(404).json({ error: { message: 'Заметка не найдена или недоступна', code: 'NOT_FOUND', requestId: req.requestId } });
    }
    await audit(req.user, 'secretary.note.updated', 'secretary_notes', req.params.id, { fields: Object.keys(body) });
    ok(res, { note: saved, confirmed: true });
  } catch (e) { next(e); }
});

app.delete('/api/secretary/notes/:id', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id заметки', 'BAD_ID');
    const del = await queryWithRetry(
      `DELETE FROM secretary_notes WHERE id = $1::uuid AND organization_id = $2::uuid RETURNING id`,
      [req.params.id, req.user.organizationId],
      { orgId: req.user.organizationId }
    );
    if (!del?.rows?.length) {
      return res.status(404).json({ error: { message: 'Заметка не найдена', code: 'NOT_FOUND', requestId: req.requestId } });
    }
    // Readback: убеждаемся, что записи больше нет.
    const gone = await safeQuery(`SELECT 1 FROM secretary_notes WHERE id=$1::uuid LIMIT 1`, [req.params.id], null);
    await audit(req.user, 'secretary.note.deleted', 'secretary_notes', req.params.id, { verified: !gone || gone.length === 0 });
    ok(res, { deleted: true, id: req.params.id });
  } catch (e) { next(e); }
});

/* ---- org tree (scope: Project → Branch → Restaurant → Department) ---- */
app.get('/api/b2b/org/tree', requireAuth, requireOrg, async (req, res, next) => {
  try {
    let rows = await safeQuery(
      `SELECT id, name, parent_id, kind FROM org_units WHERE organization_id = $1::uuid ORDER BY name`,
      [req.user.organizationId], null
    );
    if (!rows) {
      return res.status(503).json({ error: { message: 'Справочник организации временно недоступен (БД)', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    }
    // Пустой справочник остаётся пустым: STEN не создаёт фиктивные рестораны/отделы.\n    const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      const parent = node.parent_id ? byId.get(node.parent_id) : null;
      if (parent) parent.children.push(node); else roots.push(node);
    }
    ok(res, { tree: roots });
  } catch (e) { next(e); }
});

/* ---- org_units CRUD (создание/переименование/удаление узлов контура) ---- */
const OrgUnitCreateSchema = z.object({
  kind: z.enum(['project','branch','restaurant','department']),
  name: z.string().trim().min(1).max(200),
  parent_id: z.string().uuid().nullable().optional(),
}).strict();

const OrgUnitPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
}).strict();

app.post('/api/b2b/org/units', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(OrgUnitCreateSchema, req.body ?? {});
    if (body.kind !== 'project') {
      if (!body.parent_id) throw httpError(400, body.kind + ': нужен parent_id', 'PARENT_REQUIRED');
      const parent = await safeQuery(
        'SELECT id, kind FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1',
        [body.parent_id, req.user.organizationId], null
      );
      if (!parent || !parent[0]) throw httpError(404, 'Родительский узел не найден', 'PARENT_NOT_FOUND');
      const expected = { branch:'project', restaurant:'branch', department:'restaurant' }[body.kind];
      if (parent[0].kind !== expected) throw httpError(400, 'Родитель для ' + body.kind + ' должен быть ' + expected, 'PARENT_KIND_MISMATCH');
    } else if (body.parent_id) {
      throw httpError(400, 'project не может иметь parent', 'PARENT_NOT_ALLOWED');
    }
    const id = uuid();
    await queryWithRetry(
      'INSERT INTO org_units (id, organization_id, parent_id, kind, name) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)',
      [id, req.user.organizationId, body.parent_id || null, body.kind, body.name],
      { orgId: req.user.organizationId }
    );
    const verify = await safeQuery(
      'SELECT id, name, parent_id, kind FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid LIMIT 1',
      [id, req.user.organizationId], null
    );
    if (!verify || !verify[0]) throw httpError(500, 'Не удалось подтвердить создание', 'SAVE_NOT_CONFIRMED');
    await audit(req.user, 'org.unit.created', 'org_units', id, { kind: body.kind, name: body.name });
    ok(res, { unit: verify[0], confirmed: true }, 201);
  } catch (e) { next(e); }
});

app.patch('/api/b2b/org/units/:id', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id', 'BAD_ID');
    const body = parseOr400(OrgUnitPatchSchema, req.body ?? {});
    if (body.name === undefined) throw httpError(400, 'Нет изменений', 'NO_CHANGES');
    const upd = await queryWithRetry(
      'UPDATE org_units SET name=$1, updated_at=now() WHERE id=$2::uuid AND organization_id=$3::uuid RETURNING id, name, parent_id, kind',
      [body.name, req.params.id, req.user.organizationId],
      { orgId: req.user.organizationId }
    );
    if (!upd || !upd.rows || !upd.rows[0]) throw httpError(404, 'Узел не найден', 'NOT_FOUND');
    await audit(req.user, 'org.unit.updated', 'org_units', req.params.id, { fields: ['name'] });
    ok(res, { unit: upd.rows[0], confirmed: true });
  } catch (e) { next(e); }
});

app.delete('/api/b2b/org/units/:id', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id', 'BAD_ID');
    const kids = await safeQuery(
      'SELECT 1 FROM org_units WHERE parent_id=$1::uuid AND organization_id=$2::uuid LIMIT 1',
      [req.params.id, req.user.organizationId], null
    );
    if (kids && kids.length) throw httpError(409, 'Нельзя удалить: есть дочерние узлы. Сначала удалите их.', 'HAS_CHILDREN');
    const del = await queryWithRetry(
      'DELETE FROM org_units WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id',
      [req.params.id, req.user.organizationId],
      { orgId: req.user.organizationId }
    );
    if (!del || !del.rows || !del.rows.length) throw httpError(404, 'Узел не найден', 'NOT_FOUND');
    await audit(req.user, 'org.unit.deleted', 'org_units', req.params.id, {});
    ok(res, { deleted: true, confirmed: true });
  } catch (e) { next(e); }
});
function decodePdfText(buffer) {
  const raw = buffer.toString('latin1');
  const parts = [];
  const re = /\\((?:\\\\.|[^\\)])*\\)\\s*T[Jj]/g;
  let m;
  while ((m = re.exec(raw))) {
    const s = m[0].replace(/\\s*T[Jj]$/,'').slice(1,-1)
      .replace(/\\\\([\\\\()])/g,'$1')
      .replace(/\\n/g,'\n').replace(/\\r/g,'\r');
    if (s.trim()) parts.push(s);
  }
  const hex = /<([0-9A-Fa-f]{4,})>\\s*T[Jj]/g;
  while ((m = hex.exec(raw))) {
    try { const b = Buffer.from(m[1], 'hex'); const s = b.toString('utf16be'); if (s.trim()) parts.push(s); } catch {}
  }
  return parts.join(' ').replace(/\\s{2,}/g,' ').trim();
}
function extractDocxXml(buffer) {
  const text = buffer.toString('binary');
  const marker = 'word/document.xml';
  const at = text.indexOf(marker);
  if (at < 0) return '';
  const start = Math.max(0, text.lastIndexOf('PK\x03\x04', at));
  if (start < 0) return '';
  const view = Buffer.from(buffer);
  const nameLen = view.readUInt16LE(start + 26);
  const extraLen = view.readUInt16LE(start + 28);
  const compSize = view.readUInt32LE(start + 18);
  const pos = start + 30 + nameLen + extraLen;
  if (pos + compSize > view.length) return '';
  try {
    const zlib = require('zlib');
    const method = view.readUInt16LE(start + 8);
    const data = view.subarray(pos, pos + compSize);
    const xml = method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
    return xml.replace(/<w:tab\s*\/>/gu,'\t').replace(/<w:br\s*\/>/gu,'\n').replace(/<[^>]+>/gu,' ').replace(/\s+/gu,' ').trim();
  } catch { return ''; }
}
async function extractDocument(buf, name, mime) {
  const ext = String(name).split('.').pop()?.toLowerCase() || '';
  if (['xlsx','xlsm','xls'].includes(ext)) {
    const rows = xlsxToRows(buf);
    return { text: rows.map(r => [r.label, r.plan, r.fact].filter(v => v !== null && v !== undefined).join(' | ')).join('\n'), meta: { type: 'spreadsheet', sheets: [...new Set(rows.map(r => r.sheet))], rows } };
  }
  if (['csv','txt','md','json'].includes(ext) || String(mime).startsWith('text/')) {
    return { text: buf.toString('utf8').replace(/^\uFEFF/u,''), meta: { type: 'text', format: ext || mime } };
  }
  if (['pdf','docx','png','jpg','jpeg','webp','tiff','bmp'].includes(ext)) {
    const processed = await documentProcessor.process(buf, name, mime, {
      YANDEXGPT_API_KEY: ENV.YANDEXGPT_API_KEY,
      YC_FOLDER_ID: ENV.YC_FOLDER_ID,
      VISION_OCR_URL: ENV.VISION_OCR_URL,
    });
    return { text: processed.text, meta: { ...processed.data, type: processed.kind } };
  }
  return { text: '', meta: { type: 'binary', mime } };
}
/* ---- documents (evidence pipeline, analysis-first) ---- */
app.post('/ai/documents/upload', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const body = parseOr400(DocumentUploadSchema, req.body ?? {});
    const buf = Buffer.from(body.dataBase64, 'base64');
    if (!buf.length || buf.length > ENV.MAX_UPLOAD_BYTES) throw httpError(413, 'Файл пуст или превышает лимит 15 МБ', 'FILE_TOO_LARGE');
    const docId = uuid();
    const safeName = String(body.name).replace(/[\\/:*?"<>|\\u0000-\\u001f]/gu, '_').slice(0, 200);
    const key = `documents/${req.user.organizationId}/${docId}/${safeName}`;
    const mime = body.mimeType || 'application/octet-stream';
    const extracted = await extractDocument(buf, safeName, mime);
    if (!extracted.text.trim() && ['xlsx','xlsm','xls','csv','txt','md','json','pdf','docx'].includes(String(safeName).split('.').pop()?.toLowerCase() || '')) {
      throw httpError(422, 'Файл принят, но из него не удалось извлечь содержимое', 'DOCUMENT_EXTRACTION_EMPTY');
    }
    await storagePut(key, buf, mime);
    await queryWithRetry(
      `INSERT INTO ai_documents (id, organization_id, user_id, name, mime_type, size_bytes, storage_key, status, extracted_text, extraction_json)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'ready',$8,$9::jsonb)`,
      [docId, req.user.organizationId, req.user.id, safeName, mime, buf.length, key, extracted.text.slice(0, 100000), JSON.stringify(extracted.meta)],
      { orgId: req.user.organizationId }
    );
    await audit(req.user, 'document.upload.processed', 'ai_documents', docId, { name: safeName, bytes: buf.length, chars: extracted.text.length });
    ok(res, { id: docId, name: safeName, size: buf.length, status: 'ready', chars: extracted.text.length, extraction: extracted.meta }, 201);
  } catch (e) { next(e); }
});
app.get('/ai/documents', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const rows = await safeQuery(
      `SELECT id, name, mime_type, size_bytes, status, created_at, length(extracted_text) AS chars, extraction_json FROM ai_documents WHERE organization_id = $1::uuid ORDER BY created_at DESC LIMIT 200`,
      [req.user.organizationId], null
    );
    if (!rows) return res.status(503).json({ error: { message: 'Хранилище документов временно недоступно', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    ok(res, { documents: rows.map(r => ({ id:r.id, name:r.name, mimeType:r.mime_type, size:Number(r.size_bytes||0), status:r.status, createdAt:r.created_at, chars:Number(r.chars||0), extraction:r.extraction_json })) });
  } catch (e) { next(e); }
});

/* Предпросмотр извлечённого содержимого: чтение-only, без записи в P&L. */
app.get('/ai/documents/:id/preview', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id документа', 'BAD_ID');
    const rows = await safeQuery(
      `SELECT id, name, mime_type, size_bytes, status, extracted_text, extraction_json, created_at
       FROM ai_documents
       WHERE id = $1::uuid AND organization_id = $2::uuid LIMIT 1`,
      [req.params.id, req.user.organizationId], null
    );
    if (!rows) return res.status(503).json({ error: { message: 'Хранилище документов временно недоступно', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    const d = rows[0];
    if (!d) throw httpError(404, 'Документ не найден', 'NOT_FOUND');
    const text = String(d.extracted_text || '');
    ok(res, {
      id: d.id,
      name: d.name,
      mimeType: d.mime_type,
      size: Number(d.size_bytes || 0),
      status: d.status,
      createdAt: d.created_at,
      preview: text.slice(0, 12000),
      truncated: text.length > 12000,
      chars: text.length,
      extraction: d.extraction_json,
      readOnly: true,
    });
  } catch (e) { next(e); }
});

/* Удаление документа из контура STEN: meta из БД + тело из Object Storage.
   Финансовые данные не затрагиваются (документы никогда не пишут в P&L сами). */
app.delete('/ai/documents/:id', requireAuth, requireOrg, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpError(400, 'Некорректный id документа', 'BAD_ID');
    const found = await safeQuery(
      `SELECT id, storage_key FROM ai_documents WHERE id = $1::uuid AND organization_id = $2::uuid LIMIT 1`,
      [req.params.id, req.user.organizationId], null
    );
    if (!found || !found[0]) throw httpError(404, 'Документ не найден', 'NOT_FOUND');
    const del = await queryWithRetry(
      `DELETE FROM ai_documents WHERE id = $1::uuid AND organization_id = $2::uuid RETURNING id`,
      [req.params.id, req.user.organizationId], { orgId: req.user.organizationId }
    );
    if (!del?.rows?.length) throw httpError(404, 'Документ не найден', 'NOT_FOUND');
    // Readback: убеждаемся, что записи больше нет.
    const gone = await safeQuery(`SELECT 1 FROM ai_documents WHERE id = $1::uuid LIMIT 1`, [req.params.id], []);
    // Тело файла из Object Storage удаляем best-effort (ошибка хранилища не отменяет удаление meta).
    const c = s3();
    if (c && found[0].storage_key) {
      try { const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); await c.send(new DeleteObjectCommand({ Bucket: ENV.STORAGE_BUCKET, Key: found[0].storage_key })); }
      catch (e) { log('document body delete failed:', e.message); }
    }
    await audit(req.user, 'document.deleted', 'ai_documents', req.params.id, { verified: !gone || gone.length === 0 });
    ok(res, { deleted: true, confirmed: true, id: req.params.id });
  } catch (e) { next(e); }
});

/* ---- STEN /ask — YandexGPT только со стороны backend, без fake fallback ---- */
const SYSTEM_PROMPT = [
  'Ты — СТЕН, операционный ассистент ресторанных бизнесов.',
  'Отвечай по-русски. Опирайся ТОЛЬКО на предоставленный контекст и данные.',
  'Если данных нет — честно скажи «данных нет», не придумывай числа и события.',
  'Финансовые расчёты выполняет детерминированный калькулятор backend; не пересчитывай цифры сам.',
  'Контекст ресторана является жёсткой границей: анализируй только выбранный restaurant_id и его дочерний department/branch/project scope. Не смешивай данные разных ресторанов. Если ресторан не определён — не делай точечных выводов о конкретной точке.',
  'Если вопрос не относится к бизнесу, финансам или операционке ресторана — отвечай прямо и кратко, без шаблонов про P&L, план/факт и отклонения.',
  'Никогда не дублируй текст ответа. Ответ выдаётся один раз, целиком.',
  'ПРАВИЛА ЗНАКОВ: Для расходных статей (COGS, ФОТ, OPEX, себестоимость, зарплата) снижение факта относительно плана — БЛАГОПРИЯТНО (экономия). Рост — НЕБЛАГОПРИЯТНО (перерасход). Для доходных статей (Выручка, EBITDA) рост факта относительно плана — благоприятно, снижение — неблагоприятно. Никогда не называй экономию по расходам «минусом» в негативном смысле. Если ФОТ факт 1,5 млн ниже плана 1,7 млн — это экономия 200 тыс., это плюс для бизнеса.',
].join('\n');

app.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const body = parseOr400(AskSchema, req.body ?? {});
    const question = String(body.question || body.prompt || '').trim();
    if (!question && !Array.isArray(body.messages)) throw httpError(400, 'Пустой вопрос', 'EMPTY_QUESTION');

    const messages = [];
    messages.push({ role: 'system', text: (body.system ? String(body.system) + '\n\n' : '') + SYSTEM_PROMPT });
    if (Array.isArray(body.messages) && body.messages.length) {
      for (const m of body.messages.slice(-20)) {
        if (m.role === 'system') continue;
        messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', text: String(m.content || '').slice(0, 8000) });
      }
    }
    const _last = messages[messages.length - 1];
    if (!_last || _last.role !== 'user' || _last.text !== question) {
      messages.push({ role: 'user', text: question });
    }
    // Детерминированный financial-context (если вопрос про деньги — даём реальные числа из БД).
    const wantsFinance = PAYROLL_KEYWORDS.some(k => ruLower(question).includes(k)) || ruLower(question).includes('прибыл') || ruLower(question).includes('p&l');
    if (req.user.organizationId) {  // всегда грузим P&L-контекст для AI, без фильтра wantsFinance
      const rawScope = body.scope || {};
      const selectedContext = await resolveWorkspaceContext(req.user, rawScope, false);
      if (selectedContext.restaurant_id) await assertRestaurantAccess(req.user, selectedContext.restaurant_id);
      // Период валидируем отдельно; ресторан/проект/филиал/отдел берём из server-authoritative context.
      const selected = { ...selectedContext, period: YM_RE.test(String(rawScope.period || '')) ? String(rawScope.period) : new Date().toISOString().slice(0, 7) };
      const ym = selected.period;
      const rows = await safeQuery(`SELECT rows::text FROM pnl_entries WHERE organization_id=$1::uuid AND period=$2
        AND ($3::text = '' OR project_id = $3)
        AND ($4::text = '' OR branch_id = $4)
        AND ($5::text = '' OR restaurant_id = $5)
        AND ($6::text = '' OR department_id = $6)
        LIMIT 200`, [req.user.organizationId, ym, selected.project_id || '', selected.branch_id || '', selected.restaurant_id || '', selected.department_id || ''], []);
      const all = [];
      for (const r of rows) { try { const p = JSON.parse(r.rows); if (Array.isArray(p)) all.push(...p); } catch {} }
      if (all.length) {
        const agg = aggregateRows(all);
        const calc = calculatePnl(rollupAgg(agg));
        messages.splice(1, 0, { role: 'system', text: 'Контекст P&L выбранной области (реальные данные БД, план/факт в ₽):\n' + JSON.stringify({ agg, calc }).slice(0, 12000) });
      } else {
        messages.splice(1, 0, { role: 'system', text: `Данных P&L за ${ym} в базе нет. Сообщите об этом пользователю прямо.` });
      }
    }
    if (body.context) messages.splice(1, 0, { role: 'system', text: String(body.context).slice(0, 12000) });

    const skillRows = await safeQuery('SELECT config_json FROM ai_skill_settings WHERE organization_id=$1::uuid LIMIT 1',[req.user.organizationId],[]);
    const skillConfig = skillRows[0]?.config_json && typeof skillRows[0].config_json === 'object' ? skillRows[0].config_json : {};
    messages.splice(1, 0, { role: 'system', text: buildSkillPrompt(question, skillConfig) });
    if (skillConfig.history === false) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      messages.splice(1, messages.length - 1, ...(lastUser ? [lastUser] : []));
    }
    if (skillConfig.documents !== false) {
      const docs = await safeQuery(
        'SELECT name, extracted_text, extraction_json FROM ai_documents WHERE organization_id=$1::uuid AND status=\'ready\' ORDER BY created_at DESC LIMIT 20',
        [req.user.organizationId], []
      );
      const docContext = docs.filter(d => d.extracted_text).map(d => `Документ: ${d.name}\\n${String(d.extracted_text).slice(0, 12000)}`).join('\\n\\n').slice(0, 36000);
      if (docContext) messages.splice(1, 0, { role: 'system', text: 'КОНТЕКСТ ДОКУМЕНТОВ:\\n' + docContext });
    }
    const answer = await callYandexGPT(messages);
    await audit(req.user, 'sten.ask', 'ask', null, { length: answer.length });
    ok(res, { answer, model: ENV.YANDEXGPT_MODEL, sources: body.sources ?? [] });
  } catch (e) { next(e); }
});

app.get('/api/ingest/message',(req,res)=>{
 const token=process.env.WHATSAPP_VERIFY_TOKEN;
 if(token&&String(req.query['hub.verify_token']||'')===token)return res.status(200).send(String(req.query['hub.challenge']||''));
 return res.status(403).json({error:{message:'Webhook verification failed',code:'WEBHOOK_VERIFY_FAILED'}});
});
app.post('/api/ingest/message',async(req,res,next)=>{try{
 const body=req.body||{};
 const telegramText=body?.message?.text||body?.edited_message?.text;
 const telegramChat=body?.message?.chat?.id||body?.edited_message?.chat?.id;
 const waMessage=body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
 const whatsappText=waMessage?.text?.body;
 const whatsappFrom=waMessage?.from;
 const b=parseOr400(IngestMessageSchema,{...body,text:body.text||telegramText||whatsappText,source:body.source||(telegramText?'telegram':whatsappText?'whatsapp':'manual')});
 if(!b.text)throw httpError(400,'Текст сообщения не найден','EMPTY_MESSAGE');
 const subjectId=telegramChat||whatsappFrom||null;
 const binding=await resolveInboundBinding(req.user,b.source,subjectId);
 const context=binding?{restaurant_id:binding.unit_id,restaurant_name:binding.unit_name}:null;
 const parsed=await parseSalesReportWithFunctionCalling(b.text);
 if(context && !parsed.restaurant) parsed.restaurant=context.restaurant_name;
 await audit(null,'ingest.message.parsed','message',null,{source:b.source,fields:Object.keys(parsed),recipient:subjectId,unit_id:binding?.unit_id||null});
 ok(res,{parsed,context,requiresConfirmation:true,requiresBinding:!binding,writeToPnl:false,recipient:subjectId});
}catch(e){next(e)}});
 
app.post('/api/ingest/message/confirm',requireAuth,requireOrg,async(req,res,next)=>{try{
 const b=parseOr400(IngestConfirmSchema,req.body??{});
 const explicit=b.scope||{};
 const s={period:b.date.slice(0,7),project_id:explicit.project_id||'',branch_id:explicit.branch_id||'',restaurant_id:explicit.restaurant_id||'',department_id:explicit.department_id||''};
 if(!s.restaurant_id) throw httpError(422,'Для подтверждения отчёта необходимо выбрать ресторан.','RESTAURANT_CONTEXT_REQUIRED');
 await assertRestaurantAccess(req.user,s.restaurant_id);
 const existing=await safeQuery('SELECT rows::text FROM pnl_entries WHERE organization_id=$1::uuid AND period=$2 AND project_id=$3 AND branch_id=$4 AND restaurant_id=$5 AND department_id=$6 LIMIT 1',[req.user.organizationId,s.period,s.project_id||'',s.branch_id||'',s.restaurant_id||'',s.department_id||''],[]);
 let rows=[];try{rows=existing[0]?.rows?JSON.parse(existing[0].rows):[]}catch{rows=[]}
 const idx=rows.findIndex(r=>canonicalArticleKey(r.article)==='revenue');
 if(idx>=0)rows[idx]={...rows[idx],article:'Выручка',fact:b.parsed.revenue,source:'message-confirmed'};
 else rows.push({id:null,article:'Выручка',plan:null,fact:b.parsed.revenue,source:'message-confirmed'});
 await queryWithRetry('INSERT INTO pnl_entries(organization_id,period,project_id,branch_id,restaurant_id,department_id,rows,updated_at,updated_by) VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb,now(),$8) ON CONFLICT(organization_id,period,project_id,branch_id,restaurant_id,department_id) DO UPDATE SET rows=excluded.rows,updated_at=now(),updated_by=excluded.updated_by',[req.user.organizationId,s.period,s.project_id||'',s.branch_id||'',s.restaurant_id||'',s.department_id||'',JSON.stringify(rows),req.user.id],{orgId:req.user.organizationId});
 const reportValues={};for(const k of ['revenue','cash','card','discounts','checks']){if(b.parsed[k]!==null)reportValues[k]=b.parsed[k]}
 await queryWithRetry('INSERT INTO daily_reports(id,organization_id,report_date,values_json,note) VALUES($1::uuid,$2,$3::date,$4::jsonb,$5) ON CONFLICT(organization_id,report_date) DO UPDATE SET values_json=excluded.values_json,note=excluded.note,updated_at=now()',[uuid(),req.user.organizationId,b.date,JSON.stringify(reportValues),'message-confirmed'],{orgId:req.user.organizationId});
 await audit(req.user,'ingest.message.confirmed','pnl_entries',b.date,{source:'message',scope:s});
 ok(res,{confirmed:true,writtenToPnl:true,date:b.date});
}catch(e){next(e)}});
 
/* ---- payroll helpers (детерминированные, без GPT-выводов) ---- */
app.post('/calculate-salary', requireAuth, async (req, res, next) => {
  try {
    const rows = parseOr400(z.array(PayrollRowSchema).min(1).max(5000), req.body?.rows ?? req.body);
    const totalHours = rows.reduce((a, r) => a + r.hours, 0);
    const totalPay = rows.reduce((a, r) => a + r.pay, 0);
    const byDept = {};
    for (const r of rows) {
      const d = r.department ? String(r.department).normalize('NFC') : '—';
      byDept[d] = byDept[d] || { hours: 0, pay: 0 };
      byDept[d].hours += r.hours; byDept[d].pay += r.pay;
    }
    ok(res, { totalHours, totalPay, avgRate: totalHours ? totalPay / totalHours : null, byDepartment: byDept, formulaVersion: 'salary-v1' });
  } catch (e) { next(e); }
});
app.get('/my-earnings', requireAuth, async (req, res, next) => {
  try {
    if (!ENV.DB_HOST) return res.status(503).json({ error: { message: 'Данные о начислениях недоступны (БД не настроена)', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    const rows = await safeQuery(`SELECT period, SUM(hours) AS hours, SUM(amount) AS amount FROM payroll_records WHERE user_id=$1::uuid GROUP BY period ORDER BY period DESC LIMIT 24`, [req.user.id], null);
    if (!rows) return res.status(503).json({ error: { message: 'Данные о начислениях временно недоступны', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    ok(res, { earnings: rows });
  } catch (e) { next(e); }
});
app.get('/fot-analytics', requireAuth, requireOrg, async (req, res, next) => {
  try {
    const rows = await safeQuery(`SELECT period, department, hours, amount FROM payroll_records WHERE organization_id=$1::uuid ORDER BY period DESC LIMIT 5000`, [req.user.organizationId], null);
    if (!rows) return res.status(503).json({ error: { message: 'Данные ФОТ временно недоступны', code: 'DB_UNAVAILABLE', requestId: req.requestId } });
    ok(res, { records: rows });
  } catch (e) { next(e); }
});

/* ---- 404 и обработчик ошибок (graceful degradation) ---- */
app.use((req, res) => {
  res.status(404).json({ error: { message: `Маршрут не найден: ${req.method} ${req.path}`, code: 'NOT_FOUND', requestId: req.requestId } });
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[sten] error:', err.message, '| path:', req.method, req.path, '| requestId:', req.requestId);
  const publicMessage = status >= 500 && !err.code
    ? 'Внутренняя ошибка сервера. Повторите запрос позже.'
    : (err.message || 'Ошибка запроса');
  res.status(status).json({ error: { message: publicMessage, code: err.code || `HTTP_${status}`, requestId: req.requestId } });
});

/* ----------------------------- handler -------------------------------------- */
const handlerAsync = serverless(app, { binary: false });

module.exports.handler = async (event, context) => {
  // Cold-start оптимизация: не ждём опустошения event loop (пул pg переиспользуется контейнером).
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  kickSchema(); // фоновая идемпотентная миграция схемы, не блокирует ответ
  try {
    return await handlerAsync(event, context);
  } catch (e) {
    console.error('[sten] fatal handler error:', e && e.stack ? e.stack : e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: { message: 'Внутренняя ошибка сервера.', code: 'HANDLER_CRASH' } }),
    };
  }
};
