'use strict';

const DEFAULT_ESCALATION_MINUTES = 120;
const MAX_OUTBOX_BATCH = 50;

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function buildEscalationMessage(action, escalationNumber = 1) {
  const title = cleanText(action.title, 180) || 'Задача без названия';
  const assignee = cleanText(action.assignee_name, 120) || 'Исполнитель не указан';
  const due = action.due_at ? new Date(action.due_at).toLocaleString('ru-RU') : 'срок не указан';
  return [
    '⚠️ Эскалация просроченной задачи',
    cleanText(action.restaurant_name, 120),
    title,
    'Исполнитель: ' + assignee,
    'Срок: ' + due,
    'Эскалация №' + escalationNumber,
    'Статус: ' + (action.status === 'awaiting_verification' ? 'ожидает проверки' : 'не подтверждено выполнение'),
  ].filter(Boolean).join('\n');
}

function buildOperationalDigest({ restaurantName, kind, findings = [], actions = [], dateLabel, timezone = 'Europe/Moscow' }) {
  const morning = kind === 'morning';
  const title = morning ? 'Утренняя сводка' : 'Вечерняя сводка';
  const formatDate = value => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) : 'срок не указан';
  const lines = ['📋 ' + title, cleanText(restaurantName, 120), cleanText(dateLabel, 40)].filter(Boolean);
  const openFindings = findings.filter(item => item.status === 'pending');
  const approvedFindings = findings.filter(item => item.status === 'action_created');
  const activeActions = actions.filter(item => ['open', 'overdue', 'awaiting_verification'].includes(item.status));
  const overdue = activeActions.filter(item => item.status === 'overdue' || (item.due_at && new Date(item.due_at).getTime() < Date.now()));
  lines.push('');
  lines.push('AI-находки без решения: ' + openFindings.length);
  lines.push('По находкам созданы задачи: ' + approvedFindings.length);
  lines.push('Активные задачи: ' + activeActions.length);
  lines.push('Просрочено: ' + overdue.length);
  if (openFindings.length) {
    lines.push('', 'Требуют решения руководителя:');
    openFindings.slice(0, 5).forEach(item => {
      const analysis = item.analysis_json || {};
      lines.push('• [' + cleanText(analysis.severity || 'low', 16) + '] ' + cleanText(analysis.summary || analysis.title || 'AI-находка', 160));
    });
  }
  if (activeActions.length) {
    lines.push('', morning ? 'Контроль на сегодня:' : 'Не закрыты к концу дня:');
    activeActions.slice(0, 7).forEach(item => {
      lines.push('• ' + cleanText(item.title, 150) + ' — ' + cleanText(item.assignee_name, 80)
        + (item.due_at ? ' · до ' + formatDate(item.due_at) : ''));
    });
  }
  if (!openFindings.length && !activeActions.length) lines.push('', 'Открытых AI-находок и активных задач нет.');
  lines.push('', 'Сводка сформирована по сохранённым данным. Отсутствующие данные не заменяются нулями.');
  return lines.join('\n');
}

async function processTelegramAutomationJobs({ queryWithRetry, sendMessage, buildFinancialReport, now = new Date(), batchSize = MAX_OUTBOX_BATCH }) {
  if (typeof queryWithRetry !== 'function' || typeof sendMessage !== 'function') {
    throw new TypeError('Telegram automation worker requires database and Telegram adapters');
  }
  const limit = Math.max(1, Math.min(MAX_OUTBOX_BATCH, Number(batchSize) || MAX_OUTBOX_BATCH));
  const result = { escalationsQueued: 0, summariesQueued: 0, sent: 0, failed: 0, skipped: 0 };

  const escalations = await queryWithRetry(
    `WITH due AS (
       SELECT a.id, a.organization_id, a.restaurant_id, a.title, a.assignee_name, a.due_at, a.status,
              b.chat_id, u.name AS restaurant_name,
              COALESCE(s.escalation_minutes, $1)::int AS escalation_minutes,
              COALESCE(a.escalation_count, 0) + 1 AS next_escalation
         FROM operational_actions a
         JOIN telegram_chat_bindings b ON b.restaurant_id=a.restaurant_id AND b.organization_id=a.organization_id
         JOIN org_units u ON u.id=a.restaurant_id AND u.organization_id=a.organization_id
         LEFT JOIN telegram_bot_settings s ON s.chat_id=b.chat_id AND s.organization_id=b.organization_id
        WHERE a.status IN ('open','overdue','awaiting_verification')
          AND a.due_at + (COALESCE(s.escalation_minutes, $1)::int * interval '1 minute') <= $2::timestamptz
          AND (a.last_escalated_at IS NULL OR a.last_escalated_at <= $2::timestamptz - (COALESCE(s.escalation_minutes, $1)::int * interval '1 minute'))
        ORDER BY a.due_at ASC LIMIT $3
     ), updated AS (
       UPDATE operational_actions a
          SET status=CASE WHEN a.status='open' THEN 'overdue' ELSE a.status END,
              last_escalated_at=$2::timestamptz, escalation_count=due.next_escalation, updated_at=now()
         FROM due WHERE a.id=due.id AND a.organization_id=due.organization_id
       RETURNING a.id, a.organization_id, a.restaurant_id, a.title, a.assignee_name, a.due_at, a.status,
                 a.escalation_count, due.chat_id, due.restaurant_name
     )
     INSERT INTO telegram_outbox
       (organization_id, restaurant_id, chat_id, kind, idempotency_key, message_text, scheduled_for, status)
     SELECT organization_id, restaurant_id, chat_id, 'escalation',
            'action:' || id::text || ':escalation:' || escalation_count::text,
            '⚠️ Эскалация задачи: ' || title || E'\\nИсполнитель: ' || COALESCE(assignee_name,'не указан')
              || E'\\nСрок: ' || due_at::text || E'\\nРесторан: ' || restaurant_name,
            $2::timestamptz, 'pending'
       FROM updated
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [DEFAULT_ESCALATION_MINUTES, now.toISOString(), limit],
    {}
  );
  result.escalationsQueued = escalations.rows?.length || 0;

  const schedules = await queryWithRetry(
    `SELECT s.chat_id, s.organization_id, s.restaurant_id, s.morning_report_time, s.evening_report_time,
            COALESCE(s.timezone, 'Europe/Moscow') AS timezone, u.name AS restaurant_name,
            to_char(now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'), 'YYYY-MM-DD') AS local_date,
            CASE
              WHEN (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time >= s.morning_report_time
               AND (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time < s.morning_report_time + interval '5 minutes'
              THEN 'morning'
              WHEN (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time >= s.evening_report_time
               AND (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time < s.evening_report_time + interval '5 minutes'
              THEN 'evening'
              ELSE NULL
            END AS digest_kind
       FROM telegram_bot_settings s
       JOIN telegram_chat_bindings b ON b.chat_id=s.chat_id AND b.organization_id=s.organization_id
       JOIN org_units u ON u.id=s.restaurant_id AND u.organization_id=s.organization_id
      WHERE (
        ((now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time >= s.morning_report_time
          AND (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time < s.morning_report_time + interval '5 minutes')
        OR
        ((now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time >= s.evening_report_time
          AND (now() AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'))::time < s.evening_report_time + interval '5 minutes')
      )
      ORDER BY s.organization_id, s.restaurant_id LIMIT $1`,
    [limit],
    {}
  );

  for (const schedule of schedules.rows || []) {
    if (!schedule.digest_kind) continue;
    const key = 'digest:' + schedule.chat_id + ':' + schedule.digest_kind + ':' + schedule.local_date;
    const claimed = await queryWithRetry(
      `INSERT INTO telegram_outbox
        (organization_id, restaurant_id, chat_id, kind, idempotency_key, message_text, scheduled_for, status)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,'',now(),'building')
       ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
      [schedule.organization_id, schedule.restaurant_id, schedule.chat_id, schedule.digest_kind, key],
      { orgId: schedule.organization_id }
    );
    if (!claimed.rows?.length) { result.skipped += 1; continue; }
    const [findings, actions] = await Promise.all([
      queryWithRetry(
        `SELECT analysis_json, status FROM telegram_message_analyses
          WHERE organization_id=$1::uuid AND restaurant_id=$2::uuid
            AND created_at >= now() - interval '24 hours'
          ORDER BY created_at DESC LIMIT 100`,
        [schedule.organization_id, schedule.restaurant_id], { orgId: schedule.organization_id }
      ),
      queryWithRetry(
        `SELECT title, assignee_name, due_at, status FROM operational_actions
          WHERE organization_id=$1::uuid AND restaurant_id=$2::uuid
            AND status IN ('open','overdue','awaiting_verification')
          ORDER BY due_at ASC LIMIT 100`,
        [schedule.organization_id, schedule.restaurant_id], { orgId: schedule.organization_id }
      ),
    ]);
    const operationalDigest = buildOperationalDigest({
      restaurantName: schedule.restaurant_name,
      kind: schedule.digest_kind,
      dateLabel: schedule.local_date,
      timezone: schedule.timezone,
      findings: (findings.rows || []).map(row => ({ ...row, ...(row.analysis_json || {}) })),
      actions: actions.rows || [],
    });
    let financialReport = '';
    if (typeof buildFinancialReport === 'function') {
      try { financialReport = await buildFinancialReport(schedule); }
      catch { financialReport = ''; }
    }
    const message = [financialReport || 'Финансовая часть сводки временно недоступна.', operationalDigest].filter(Boolean).join('\n\n');
    await queryWithRetry(
      "UPDATE telegram_outbox SET message_text=$1,status='pending',updated_at=now() WHERE id=$2::uuid AND status='building'",
      [message, claimed.rows[0].id], { orgId: schedule.organization_id }
    );
    result.summariesQueued += 1;
  }

  const pending = await queryWithRetry(
    `WITH claimable AS (
       SELECT id FROM telegram_outbox
        WHERE ((status='pending' AND scheduled_for <= $1::timestamptz)
           OR (status='sending' AND updated_at < $1::timestamptz - interval '5 minutes'))
          AND attempts < 5
        ORDER BY scheduled_for ASC LIMIT $2 FOR UPDATE SKIP LOCKED
     )
     UPDATE telegram_outbox o
        SET status='sending',attempts=o.attempts+1,updated_at=$1::timestamptz
       FROM claimable c WHERE o.id=c.id
     RETURNING o.id,o.organization_id,o.restaurant_id,o.chat_id,o.kind,o.message_text,o.attempts`,
    [now.toISOString(), limit],
    {}
  );
  for (const item of pending.rows || []) {
    try {
      await sendMessage(item.chat_id, item.message_text);
      await queryWithRetry(
        `UPDATE telegram_outbox SET status='sent',sent_at=$1::timestamptz,last_error=NULL,updated_at=now()
          WHERE id=$2::uuid AND status='sending'`,
        [now.toISOString(), item.id], { orgId: item.organization_id }
      );
      result.sent += 1;
    } catch (error) {
      await queryWithRetry(
        `UPDATE telegram_outbox SET status=CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
              last_error=$1,updated_at=now()
          WHERE id=$2::uuid AND status='sending'`,
        [cleanText(error?.code || error?.message || 'telegram_delivery_failed', 300), item.id],
        { orgId: item.organization_id }
      );
      result.failed += 1;
    }
  }
  return result;
}

module.exports = {
  DEFAULT_ESCALATION_MINUTES,
  cleanText,
  buildEscalationMessage,
  buildOperationalDigest,
  processTelegramAutomationJobs,
};
