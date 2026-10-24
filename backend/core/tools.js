'use strict';

const { z } = require('zod');
const { enforcePolicy } = require('./policy');

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SEVERITY_HIGH_ABS = 100_000;
const SEVERITY_HIGH_PCT = 10;
const SEVERITY_MED_ABS = 30_000;
const SEVERITY_MED_PCT = 5;

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code || `HTTP_${status}`;
  return error;
}

const scopeFields = {
  project_id: { type: 'string', description: 'UUID проекта' },
  branch_id: { type: 'string', description: 'UUID филиала' },
  restaurant_id: { type: 'string', description: 'UUID ресторана' },
  department_id: { type: 'string', description: 'UUID отдела' },
};

const pnlSchema = z.object({
  period: z.string().regex(YM_RE),
  project_id: z.string().optional().default(''),
  branch_id: z.string().optional().default(''),
  restaurant_id: z.string().optional().default(''),
  department_id: z.string().optional().default(''),
}).strict();

const deviationSchema = z.object({
  period: z.string().regex(YM_RE),
  project_id: z.string().optional().default(''),
  branch_id: z.string().optional().default(''),
  restaurant_id: z.string().optional().default(''),
  department_id: z.string().optional().default(''),
}).strict();

const fotSchema = z.object({
  period: z.string().regex(YM_RE),
  project_id: z.string().optional().default(''),
  branch_id: z.string().optional().default(''),
  restaurant_id: z.string().optional().default(''),
  department_id: z.string().optional().default(''),
}).strict();

const salesSchema = z.object({
  date: z.string().regex(DATE_RE),
  restaurant_id: z.string().optional().default(''),
}).strict();

const documentsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(30),
  status: z.enum(['ready','all','stored','processing','failed']).optional().default('ready'),
}).strict();

const documentSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(10).optional().default(5),
}).strict();

const documentReadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  start_char: z.number().int().min(0).max(99000000).optional().default(0),
  max_chars: z.number().int().min(1000).max(12000).optional().default(12000),
}).strict();

const memorySchema = z.object({
  kind: z.enum(['fact','decision','cause','action','manager_note','pattern']).optional(),
  restaurant_id: z.string().optional(),
  since: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'since должен быть ISO date'),
  limit: z.number().int().min(1).max(50).optional().default(20),
  confidence: z.enum(['unconfirmed','confirmed','rejected']).optional().default('confirmed'),
}).partial().strict();

const secretarySchema = z.object({
  from: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'from должен быть ISO date').optional(),
  to: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'to должен быть ISO date').optional(),
  mine: z.boolean().optional().default(true),
}).strict();

function parseArgs(schema, args) {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw httpError(400, `Некорректные параметры tool: ${first.path.join('.') || 'args'} — ${first.message}`, 'TOOL_ARGUMENTS_INVALID');
  }
  return parsed.data;
}

function scopeFromArgs(args) {
  return {
    project_id: String(args.project_id || ''),
    branch_id: String(args.branch_id || ''),
    restaurant_id: String(args.restaurant_id || ''),
    department_id: String(args.department_id || ''),
  };
}

async function findDeviations(user, rawArgs, ctx) {
  const args = parseArgs(deviationSchema, rawArgs);
  if (!UUID_RE.test(String(user.organizationId || ''))) {
    throw httpError(403, 'Организация не назначена пользователю.', 'NO_ORG_SCOPE');
  }
  const scope = { ...scopeFromArgs(args), period: args.period };
  const rows = await ctx.queryWithRetry(
    `SELECT rows::text FROM pnl_entries
      WHERE organization_id=$1::uuid AND period=$2
        AND ($3::text='' OR project_id=$3)
        AND ($4::text='' OR branch_id=$4)
        AND ($5::text='' OR restaurant_id=$5)
        AND ($6::text='' OR department_id=$6)`,
    [user.organizationId, args.period, scope.project_id, scope.branch_id, scope.restaurant_id, scope.department_id],
    { orgId: user.organizationId }
  );
  const all = [];
  for (const row of rows.rows || []) {
    try {
      const parsed = JSON.parse(row.rows);
      if (Array.isArray(parsed)) all.push(...parsed);
    } catch {}
  }

  let aggregated = ctx.aggregateRows(all);
  const txRows = await ctx.queryWithRetry(
    `SELECT article, SUM(amount) AS total, COUNT(*)::int AS count
       FROM pnl_transactions
      WHERE organization_id=$1::uuid AND period=$2
        AND ($3::text='' OR project_id=$3)
        AND ($4::text='' OR branch_id=$4)
        AND ($5::text='' OR restaurant_id=$5)
        AND ($6::text='' OR department_id=$6)
      GROUP BY article`,
    [user.organizationId, args.period, scope.project_id, scope.branch_id, scope.restaurant_id, scope.department_id],
    { orgId: user.organizationId }
  );
  const txByKey = new Map((txRows.rows || []).map(row => [
    ctx.canonicalArticleKey(row.article),
    { total: Number(row.total || 0), count: Number(row.count || 0) },
  ]));
  aggregated = aggregated.map(row => {
    const tx = txByKey.get(ctx.canonicalArticleKey(row.article));
    if (!tx) return row;
    return {
      ...row,
      fact: row.fact === null || row.fact === undefined ? tx.total : Number(row.fact) + tx.total,
      transaction_total: tx.total,
      transaction_count: tx.count,
      source: [row.source, 'transactions'].filter(Boolean).join(','),
    };
  });

  if (!aggregated.length) {
    return {
      period: args.period,
      scope,
      critical: [],
      positive: [],
      missing: [],
      total_impact: 0,
      has_data: false,
    };
  }

  const expenseKeys = new Set([
    'cogs', 'payroll', 'personnel', 'overtime', 'opex', 'other_operating',
    'depreciation', 'interest', 'tax', 'other',
  ]);
  const rowsByKey = new Map();
  for (const row of aggregated) {
    const key = ctx.canonicalArticleKey(row.article);
    const plan = row.plan === null || row.plan === undefined ? null : Number(row.plan);
    const fact = row.fact === null || row.fact === undefined ? null : Number(row.fact);
    const delta_abs = plan !== null && fact !== null ? fact - plan : null;
    const delta_pct = delta_abs !== null && plan !== 0 ? (delta_abs / Math.abs(plan)) * 100 : null;
    let severity = null;
    if (delta_abs !== null) {
      const abs = Math.abs(delta_abs);
      const pct = delta_pct === null ? null : Math.abs(delta_pct);
      severity = abs >= SEVERITY_HIGH_ABS || (pct !== null && pct >= SEVERITY_HIGH_PCT) ? 'high'
        : abs >= SEVERITY_MED_ABS || (pct !== null && pct >= SEVERITY_MED_PCT) ? 'medium'
        : 'low';
    }
    const favorable = delta_abs === null ? null : expenseKeys.has(key) ? delta_abs <= 0 : delta_abs >= 0;
    const item = {
      article: row.article,
      key,
      plan,
      fact,
      delta_abs,
      delta_pct,
      favorable,
      severity,
      source: row.source || 'manual',
    };
    rowsByKey.set(key, item);
  }

  const allItems = [...rowsByKey.values()];
  const missing = allItems.filter(item => item.plan === null || item.fact === null);
  const critical = allItems
    .filter(item => item.favorable === false && (item.severity === 'high' || item.severity === 'medium'))
    .sort((a, b) => {
      if (a.delta_abs === null) return 1;
      if (b.delta_abs === null) return -1;
      return Math.abs(b.delta_abs) - Math.abs(a.delta_abs);
    })
    .slice(0, 5);
  const positive = allItems
    .filter(item => item.favorable === true && (item.severity === 'high' || item.severity === 'medium'))
    .sort((a, b) => Math.abs(b.delta_abs) - Math.abs(a.delta_abs))
    .slice(0, 3);

  return {
    period: args.period,
    scope,
    critical,
    positive,
    missing,
    total_impact: critical.reduce((sum, item) => sum + Math.abs(item.delta_abs || 0), 0),
    has_data: true,
  };
}

async function getPnl(user, rawArgs, ctx) {
  const args = parseArgs(pnlSchema, rawArgs);
  if (!UUID_RE.test(String(user.organizationId || ''))) throw httpError(403, 'Организация не назначена пользователю.', 'NO_ORG_SCOPE');
  const scope = { ...scopeFromArgs(args), period: args.period };
  const rows = await ctx.queryWithRetry(
    `SELECT rows::text FROM pnl_entries
      WHERE organization_id=$1::uuid AND period=$2
        AND ($3::text='' OR project_id=$3)
        AND ($4::text='' OR branch_id=$4)
        AND ($5::text='' OR restaurant_id=$5)
        AND ($6::text='' OR department_id=$6)`,
    [user.organizationId, args.period, scope.project_id, scope.branch_id, scope.restaurant_id, scope.department_id],
    { orgId: user.organizationId }
  );
  const all = [];
  for (const row of rows.rows || []) {
    try {
      const parsed = JSON.parse(row.rows);
      if (Array.isArray(parsed)) all.push(...parsed);
    } catch {}
  }

  let aggregated = ctx.aggregateRows(all);
  const txRows = await ctx.queryWithRetry(
    `SELECT article, SUM(amount) AS total, COUNT(*)::int AS count
       FROM pnl_transactions
      WHERE organization_id=$1::uuid AND period=$2
        AND ($3::text='' OR project_id=$3)
        AND ($4::text='' OR branch_id=$4)
        AND ($5::text='' OR restaurant_id=$5)
        AND ($6::text='' OR department_id=$6)
      GROUP BY article`,
    [user.organizationId, args.period, scope.project_id, scope.branch_id, scope.restaurant_id, scope.department_id],
    { orgId: user.organizationId }
  );
  const txByKey = new Map((txRows.rows || []).map(row => [
    ctx.canonicalArticleKey(row.article),
    { total: Number(row.total || 0), count: Number(row.count || 0) },
  ]));
  aggregated = aggregated.map(row => {
    const tx = txByKey.get(ctx.canonicalArticleKey(row.article));
    if (!tx) return row;
    return {
      ...row,
      fact: row.fact === null || row.fact === undefined ? tx.total : Number(row.fact) + tx.total,
      transaction_total: tx.total,
      transaction_count: tx.count,
      source: [row.source, 'transactions'].filter(Boolean).join(','),
    };
  });

  const factInput = ctx.rollupAgg(aggregated);
  const planRows = aggregated.map(row => ({ ...row, fact: row.plan, plan: null }));
  const planInput = ctx.rollupAgg(planRows);
  const summary = {
    revenuePlan: aggregated.find(row => ctx.canonicalArticleKey(row.article) === 'revenue')?.plan ?? null,
    revenueFact: aggregated.find(row => ctx.canonicalArticleKey(row.article) === 'revenue')?.fact ?? null,
    filledRows: aggregated.filter(row => row.plan !== null || row.fact !== null).length,
    scope,
    calculated: {
      fact: ctx.calculatePnl(factInput),
      plan: ctx.calculatePnl(planInput),
    },
  };
  return { period: args.period, scope, rows: aggregated, summary, calculated: summary.calculated, count: all.length };
}

async function getFot(user, rawArgs, ctx) {
  const args = parseArgs(fotSchema, rawArgs);
  const scope = scopeFromArgs(args);
  if (Object.values(scope).some(Boolean)) {
    return { error: 'FOT_SCOPE_NOT_IMPLEMENTED' };
  }
  const result = await ctx.queryWithRetry(
    `SELECT period, department, hours, amount
       FROM payroll_records
      WHERE organization_id=$1::uuid
      ORDER BY period DESC LIMIT 5000`,
    [user.organizationId],
    { orgId: user.organizationId }
  );
  return { period: args.period, records: result.rows || [] };
}

async function getSales(user, rawArgs, ctx) {
  const args = parseArgs(salesSchema, rawArgs);
  const restaurantId = args.restaurant_id || '';
  const scope = { project_id:'', branch_id:'', restaurant_id:restaurantId, department_id:'' };
  const result = await ctx.queryWithRetry(
    `SELECT id, report_date, project_id, branch_id, restaurant_id, department_id, values_json, note, created_at, updated_at
       FROM daily_reports
      WHERE organization_id=$1::uuid
        AND report_date=$2::date
        AND ($3::text='' OR restaurant_id=$3)
      ORDER BY created_at DESC`,
    [user.organizationId, args.date, restaurantId],
    { orgId: user.organizationId }
  );
  const reports = (result.rows || []).map(row => {
    const values = row.values_json && typeof row.values_json === 'object' ? row.values_json : {};
    const checks = Number(values.checks);
    const revenue = Number(values.revenue);
    const calculated = {
      avgCheck: Number.isFinite(revenue) && Number.isFinite(checks) && checks > 0 ? revenue / checks : null,
    };
    return { ...row, values_json: values, calculated };
  });
  return { date: args.date, scope, reports };
}

async function getDocuments(user, rawArgs, ctx) {
  const args = parseArgs(documentsSchema, rawArgs);
  const result = await ctx.queryWithRetry(
    `SELECT id, name, status, created_at, length(extracted_text) AS chars,
            LEFT(COALESCE(extracted_text,''), 1500) AS preview, extraction_json
       FROM ai_documents
      WHERE organization_id=$1::uuid AND ($2='all' OR status=$2)
      ORDER BY created_at DESC LIMIT $3`,
    [user.organizationId, args.status, args.limit],
    { orgId: user.organizationId }
  );
  const documents = (result.rows || []).map(row => {
    const meta = row.extraction_json && typeof row.extraction_json === 'object' ? row.extraction_json : {};
    const chars = Number(row.chars || 0);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      chars,
      possibly_truncated: chars >= 100000 && meta.fullTextComplete !== true,
      createdAt: row.created_at,
      preview: row.preview || '',
    };
  });
  return {
    documents,
    returned: documents.length,
    limit: args.limit,
    may_be_truncated: documents.length === args.limit,
    note: documents.length === args.limit
      ? 'Достигнут лимит выдачи; если нужен полный инвентарь, повтори запрос с большим limit (до 200).'
      : undefined,
  };
}

async function searchDocuments(user, rawArgs, ctx) {
  const args = parseArgs(documentSearchSchema, rawArgs);
  if (!UUID_RE.test(String(user.organizationId || ''))) {
    throw httpError(403, 'Организация не назначена пользователю.', 'NO_ORG_SCOPE');
  }

  // Search is organization-bound. Split natural-language requests into useful
  // terms so a question such as "мотивация управляющего" still finds a workbook
  // whose cells do not contain that exact phrase.
  const stopWords = new Set([
    'что','это','как','где','когда','мне','меня','тебе','тебя','есть','был','была','были',
    'будет','быть','для','или','если','уже','еще','ещё','могу','может','пожалуйста','скажи',
    'расскажи','покажи','найди','проверь','сделай','сейчас','почему','какой','какая','какие',
    'сколько','всего','нужно','надо','можно','про','при','после','перед','между','этот','эта',
    'эти','того','тогда','там','тут','моя','мой','мои','твоя','твой','твои','помнишь',
    'говорил','говорила','рассматривали','обсуждали','информация'
  ]);
  const rawTerms = args.query.normalize('NFC').toLocaleLowerCase('ru-RU')
    .match(/[a-zа-яё0-9]{3,}/giu) || [];
  const suffixes = ['иями','ями','ами','ого','его','ому','ему','ыми','ими','иях','иях','иями','иями','иям','иях','ией','ией','ией','иями','ией','иях','иях','ией','ия','ии','ые','ое','ая','яя','ую','юю','ого','его','ому','ему','ыми','ими','ый','ий','ой','ей','ам','ям','ах','ях','ов','ев','ом','ем','ым','им','а','я','ы','и','у','ю','е','о'];
  const terms = [];
  for (const word of rawTerms) {
    if (stopWords.has(word)) continue;
    if (!terms.includes(word)) terms.push(word);
    if (/[а-яё]/iu.test(word) && word.length >= 6) {
      const suffix = suffixes.find(item => word.endsWith(item) && word.length - item.length >= 4);
      if (suffix) {
        const stem = word.slice(0, -suffix.length);
        if (!terms.includes(stem)) terms.push(stem);
      }
    }
    if (terms.length >= 12) break;
  }
  const searchTerms = terms.slice(0, 12);
  if (!searchTerms.length) {
    throw httpError(400, 'Укажите минимум одно слово для поиска.', 'DOCUMENT_QUERY_EMPTY');
  }

  const predicates = searchTerms.map((_, index) =>
    `(position(lower($${index + 3}) in lower(COALESCE(extracted_text, ''))) > 0 OR position(lower($${index + 3}) in lower(name)) > 0)`
  );
  const params = [user.organizationId, args.limit, ...searchTerms];
  const result = await ctx.queryWithRetry(
    `SELECT id, name, created_at, extracted_text, extraction_json
       FROM ai_documents
      WHERE organization_id=$1::uuid
        AND status='ready'
        AND COALESCE(extracted_text, '') <> ''
        AND (${predicates.join(' OR ')})
      ORDER BY created_at DESC
      LIMIT $2`,
    params,
    { orgId: user.organizationId }
  );

  const documents = (result.rows || []).map(row => {
    const text = String(row.extracted_text || '');
    const lower = text.toLocaleLowerCase('ru-RU');
    const hits = [];
    for (const term of searchTerms) {
      let from = 0;
      let found = 0;
      while (found < 3) {
        const at = lower.indexOf(term, from);
        if (at < 0) break;
        hits.push({ term, at });
        from = at + term.length;
        found += 1;
      }
    }
    hits.sort((a, b) => a.at - b.at);
    const excerpts = [];
    const seen = new Set();
    for (const hit of hits) {
      const start = Math.max(0, hit.at - 220);
      const end = Math.min(text.length, hit.at + hit.term.length + 380);
      const excerpt = text.slice(start, end).replace(/\s+/gu, ' ').trim();
      const key = excerpt.slice(0, 80);
      if (excerpt && !seen.has(key)) {
        seen.add(key);
        excerpts.push({ matched_term: hit.term, excerpt, char_offset: hit.at });
      }
      if (excerpts.length >= 5) break;
    }
    const meta = row.extraction_json && typeof row.extraction_json === 'object' ? row.extraction_json : {};
    const sourceRows = (Array.isArray(meta.rows) ? meta.rows : [])
      .filter(item => searchTerms.some(term => JSON.stringify([item.label, item.article, item.sheet, item.source]).toLocaleLowerCase('ru-RU').includes(term)))
      .slice(0, 10)
      .map(item => ({
        label: item.label || item.article || null,
        sheet: item.sheet || null,
        source_row: item.sourceRow || item.row || null,
        source: item.source || null,
        source_cell_plan: item.sourceCellPlan || null,
        source_cell_fact: item.sourceCellFact || null,
        plan: item.plan ?? null,
        fact: item.fact ?? null,
      }));
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      total_chars: text.length,
      extraction: { type: meta.type || null, sheets: meta.sheets || null, engine: meta.engine || null },
      source_rows: sourceRows,
      excerpts,
    };
  });
  return {
    query: args.query,
    terms: searchTerms,
    documents,
    found: documents.length,
    note: documents.length ? undefined : 'Совпадений в извлечённом тексте доступных документов не найдено.',
  };
}

async function readDocument(user, rawArgs, ctx) {
  const args = parseArgs(documentReadSchema, rawArgs);
  if (!UUID_RE.test(String(user.organizationId || ''))) {
    throw httpError(403, 'Организация не назначена пользователю.', 'NO_ORG_SCOPE');
  }
  const result = await ctx.queryWithRetry(
    `SELECT id, name, created_at, extracted_text, extraction_json
       FROM ai_documents
      WHERE organization_id=$1::uuid
        AND status='ready'
        AND position(lower($2) in lower(name)) > 0
      ORDER BY created_at DESC
      LIMIT 5`,
    [user.organizationId, args.name],
    { orgId: user.organizationId }
  );
  const matches = result.rows || [];
  if (!matches.length) {
    return { found: false, query: args.name, note: 'Документ с таким названием не найден среди готовых документов этой организации.' };
  }
  if (matches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      query: args.name,
      matches: matches.map(row => ({ id: row.id, name: row.name, created_at: row.created_at })),
      note: 'Найдено несколько документов. Уточни название, чтобы не прочитать не тот файл.',
    };
  }
  let row = matches[0];
  let text = String(row.extracted_text || '');
  let sourceTextTruncated = text.length >= 100000 && row.extraction_json?.fullTextComplete !== true;
  if (sourceTextTruncated && typeof ctx.reprocessDocument === 'function') {
    try {
      const refreshed = await ctx.reprocessDocument(user, row.id);
      if (typeof refreshed?.text === 'string') {
        text = refreshed.text;
        row = { ...row, extracted_text: text, extraction_json: refreshed.meta || row.extraction_json };
        sourceTextTruncated = false;
      }
    } catch (error) {
      // Return the available slice but make the incomplete extraction explicit.
      sourceTextTruncated = true;
    }
  }
  const content = text.slice(args.start_char, args.start_char + args.max_chars);
  return {
    found: true,
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    total_chars: text.length,
    start_char: args.start_char,
    returned_chars: content.length,
    has_more: args.start_char + content.length < text.length,
    source_text_truncated: sourceTextTruncated,
    extraction: row.extraction_json && typeof row.extraction_json === 'object'
      ? { type: row.extraction_json.type || null, sheets: row.extraction_json.sheets || null, engine: row.extraction_json.engine || null }
      : null,
    text: content,
  };
}

async function getMemory(user, rawArgs, ctx) {
  const result = await ctx.memory.listMemory(user, rawArgs ?? {});
  return { memories: result.memories || [] };
}

async function getSecretaryContext(user, rawArgs, ctx) {
  const args = parseArgs(secretarySchema, rawArgs);
  const from = args.from || new Date().toISOString();
  const to = args.to || new Date(Date.now() + 7 * 86400000).toISOString();
  if (new Date(to) <= new Date(from)) throw httpError(400, 'to должен быть позже from', 'BAD_DATE_RANGE');
  const userFilter = args.mine ? ' AND user_id=$4::text' : '';
  const params = [user.organizationId, from, to];
  if (args.mine) params.push(user.id);
  const events = await ctx.queryWithRetry(
    `SELECT id, user_id, title, description, event_type, start_at, end_at, status, reminder_minutes, location, created_at, updated_at
       FROM secretary_events
      WHERE organization_id=$1::uuid AND start_at >= $2::timestamptz AND start_at < $3::timestamptz${userFilter}
      ORDER BY start_at ASC LIMIT 500`,
    params,
    { orgId: user.organizationId }
  );
  const notes = await ctx.queryWithRetry(
    `SELECT id, user_id, title, content, source, created_at, updated_at
       FROM secretary_notes
      WHERE organization_id=$1::uuid${args.mine ? ' AND user_id=$2::text' : ''}
      ORDER BY updated_at DESC LIMIT 200`,
    args.mine ? [user.organizationId, user.id] : [user.organizationId],
    { orgId: user.organizationId }
  );
  return { events: events.rows || [], notes: notes.rows || [] };
}

const TOOLS = [
  {
    name: 'get_pnl',
    description: 'Получить детерминированный P&L выбранного периода и scope.',
    parameters: { type:'object', properties:{ period:{type:'string',description:'YYYY-MM'}, ...scopeFields }, required:['period'] },
    policy: ['requireAuth','requireOrg','assertScopeAccess'],
    handler: getPnl,
  },
  {
    name: 'find_deviations',
    description: 'Найти значимые отклонения факта от плана в P&L за период. Возвращает критические и положительные отклонения с financial impact.',
    parameters: { type:'object', properties:{ period:{type:'string',description:'YYYY-MM'}, ...scopeFields }, required:['period'] },
    policy: ['requireAuth','requireOrg','assertScopeAccess'],
    handler: findDeviations,
  },
  {
    name: 'get_fot',
    description: 'Получить ФОТ организации за период. Scope ФОТ пока не реализован и безопасно возвращает FOT_SCOPE_NOT_IMPLEMENTED.',
    parameters: { type:'object', properties:{ period:{type:'string',description:'YYYY-MM'}, ...scopeFields }, required:['period'] },
    policy: ['requireAuth','requireOrg'],
    handler: getFot,
  },
  {
    name: 'get_sales',
    description: 'Получить ежедневный отчёт продаж за дату и, при наличии, ресторан.',
    parameters: { type:'object', properties:{ date:{type:'string',description:'YYYY-MM-DD'}, restaurant_id:{type:'string',description:'UUID ресторана, optional'} }, required:['date'] },
    policy: ['requireAuth','requireOrg','assertScopeAccess'],
    handler: getSales,
  },
  {
    name: 'get_documents',
    description: 'Перечислить реальные документы текущей организации. Для полного списка передай status=all; ничего не выдумывает.',
    parameters: { type:'object', properties:{ limit:{type:'integer',minimum:1,maximum:200,default:30}, status:{type:'string',enum:['ready','all','stored','processing','failed'],default:'ready'} }, required:[] },
    policy: ['requireAuth','requireOrg'],
    handler: getDocuments,
  },
  {
    name: 'read_document',
    description: 'Прочитать точный фрагмент извлечённого текста конкретного документа по названию. Используй для первых строк/записей, проверки формулы и просмотра полного содержимого по частям; tenant-scoped.',
    parameters: { type:'object', properties:{ name:{type:'string',minLength:2,maxLength:200,description:'Название документа или уникальная часть названия'}, start_char:{type:'integer',minimum:0,maximum:99000,default:0}, max_chars:{type:'integer',minimum:1000,maximum:12000,default:12000} }, required:['name'] },
    policy: ['requireAuth','requireOrg'],
    handler: readDocument,
  },
  {
    name: 'search_documents',
    description: 'Искать по полному извлечённому тексту доступных документов организации и возвращать точные фрагменты с названием источника. Используй для вопросов о зарплатах, ФИО, должностях, мотивации, формулах и строках таблиц.',
    parameters: { type:'object', properties:{ query:{type:'string',minLength:2,maxLength:200,description:'Ключевые слова или фраза для поиска в документах'}, limit:{type:'integer',minimum:1,maximum:10,default:5} }, required:['query'] },
    policy: ['requireAuth','requireOrg'],
    handler: searchDocuments,
  },
  {
    name: 'get_memory',
    description: 'Получить структурированную память STEN с фильтрами по kind, ресторану, дате и confidence.',
    parameters: { type:'object', properties:{ kind:{type:'string',enum:['fact','decision','cause','action','manager_note','pattern']}, restaurant_id:{type:'string'}, since:{type:'string'}, limit:{type:'integer',minimum:1,maximum:50,default:20}, confidence:{type:'string',enum:['unconfirmed','confirmed','rejected'],default:'confirmed'} }, required:[] },
    policy: ['requireAuth','requireOrg','assertScopeAccess'],
    handler: getMemory,
  },
  {
    name: 'get_secretary_context',
    description: 'Получить контекст Секретаря: события и заметки пользователя или всей организации.',
    parameters: { type:'object', properties:{ from:{type:'string'}, to:{type:'string'}, mine:{type:'boolean',default:true} }, required:[] },
    policy: ['requireAuth','requireOrg'],
    handler: getSecretaryContext,
  },
];

function findTool(name) {
  return TOOLS.find(tool => tool.name === name) || null;
}

async function executeTool(user, name, args, ctx = {}) {
  const tool = findTool(name);
  if (!tool) throw httpError(404, `Tool не найден: ${name}`, 'TOOL_NOT_FOUND');
  await enforcePolicy(user, tool, args, ctx);
  if (typeof tool.handler !== 'function') throw httpError(500, `Tool ${name} не имеет handler`, 'TOOL_HANDLER_MISSING');
  return tool.handler(user, args, ctx);
}

module.exports = { TOOLS, findTool, executeTool };
