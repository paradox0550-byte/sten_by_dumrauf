'use strict';

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: values.year + '-' + values.month + '-' + values.day,
    time: values.hour + ':' + values.minute,
  };
}

function safeTimeZone(value) {
  const candidate = String(value || 'Europe/Moscow');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'Europe/Moscow';
  }
}

async function claimDelivery(queryWithRetry, eventKey, organizationId, restaurantId, chatId, type, text) {
  const result = await queryWithRetry(
    `INSERT INTO telegram_delivery_log
      (id,organization_id,restaurant_id,chat_id,event_key,delivery_type,status,payload_text,attempts,created_at,updated_at)
     VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,'sending',$6,1,now(),now())
     ON CONFLICT(event_key) DO UPDATE
       SET status='sending',attempts=telegram_delivery_log.attempts+1,
           payload_text=EXCLUDED.payload_text,last_error=NULL,updated_at=now()
       WHERE telegram_delivery_log.status='failed'
         AND telegram_delivery_log.updated_at < now() - interval '5 minutes'
     RETURNING id`,
    [organizationId, restaurantId, chatId, eventKey, type, text],
    { orgId: organizationId },
  );
  return result.rows?.[0]?.id || null;
}

async function finishDelivery(queryWithRetry, id, status, error = null, organizationId = null) {
  await queryWithRetry(
    `UPDATE telegram_delivery_log
        SET status=$1,last_error=$2,sent_at=CASE WHEN $1='sent' THEN now() ELSE sent_at END,updated_at=now()
      WHERE id=$3::uuid`,
    [status, error ? String(error.code || error.message || error).slice(0, 500) : null, id],
    { orgId: organizationId || undefined },
  );
}

async function processTelegramLifecycleJobs({ queryWithRetry, sendMessage, now = new Date() }) {
  if (typeof queryWithRetry !== 'function' || typeof sendMessage !== 'function') {
    throw new TypeError('Telegram lifecycle worker requires database and Telegram adapters');
  }
  const stats = { reportsSent: 0, escalationsSent: 0, failed: 0, skipped: 0 };
  const settingsResult = await queryWithRetry(
    `SELECT s.chat_id,s.organization_id,s.restaurant_id,s.timezone,
            s.morning_report_time::text,s.evening_report_time::text,
            s.morning_report_enabled,s.evening_report_enabled
       FROM telegram_bot_settings s
       JOIN telegram_chat_bindings b ON b.chat_id=s.chat_id
         AND b.organization_id=s.organization_id AND b.restaurant_id=s.restaurant_id
      WHERE s.morning_report_enabled=true OR s.evening_report_enabled=true`,
    [],
    {},
  );
  for (const setting of settingsResult.rows || []) {
    const zone = safeTimeZone(setting.timezone);
    const local = zonedParts(now, zone);
    for (const [type, enabled, time] of [
      ['morning', setting.morning_report_enabled, String(setting.morning_report_time || '').slice(0, 5)],
      ['evening', setting.evening_report_enabled, String(setting.evening_report_time || '').slice(0, 5)],
    ]) {
      if (!enabled || local.time !== time) continue;
      try {
        const [findingsResult, actionsResult] = await Promise.all([
          queryWithRetry(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE analysis_json->>'needsManagerAttention'='true')::int AS urgent
               FROM telegram_message_analyses
              WHERE organization_id=$1::uuid AND restaurant_id=$2::uuid
                AND created_at >= now() - interval '24 hours'`,
            [setting.organization_id, setting.restaurant_id],
            { orgId: setting.organization_id },
          ),
          queryWithRetry(
            `SELECT count(*) FILTER (WHERE status IN ('open','overdue'))::int AS active,
                    count(*) FILTER (WHERE status='awaiting_verification')::int AS verification
               FROM operational_actions
              WHERE organization_id=$1::uuid AND restaurant_id=$2::uuid`,
            [setting.organization_id, setting.restaurant_id],
            { orgId: setting.organization_id },
          ),
        ]);
        const findings = findingsResult.rows?.[0] || {};
        const actions = actionsResult.rows?.[0] || {};
        const label = type === 'morning' ? 'Утренняя сводка' : 'Вечерняя сводка';
        const body = [
          label + ' · ' + local.date,
          'AI-находки за 24 часа: ' + Number(findings.total || 0),
          'Требуют внимания: ' + Number(findings.urgent || 0),
          'Открытые задачи: ' + Number(actions.active || 0),
          'Ожидают независимой проверки: ' + Number(actions.verification || 0),
        ].join('\\n');
        const eventKey = 'report:' + setting.chat_id + ':' + type + ':' + local.date;
        const deliveryId = await claimDelivery(queryWithRetry, eventKey, setting.organization_id, setting.restaurant_id, setting.chat_id, type, body);
        if (!deliveryId) { stats.skipped += 1; continue; }
        try {
          await sendMessage(setting.chat_id, body);
          await finishDelivery(queryWithRetry, deliveryId, 'sent', null, setting.organization_id);
          stats.reportsSent += 1;
        } catch (error) {
          await finishDelivery(queryWithRetry, deliveryId, 'failed', error, setting.organization_id);
          stats.failed += 1;
        }
      } catch {
        stats.failed += 1;
      }
    }
  }

  const overdueResult = await queryWithRetry(
    `SELECT a.id,a.organization_id,a.restaurant_id,a.title,a.due_at,a.status,
            b.chat_id,s.escalation_minutes
       FROM operational_actions a
       JOIN operational_observations o ON o.id=a.observation_id
       JOIN telegram_chat_bindings b ON b.chat_id=o.source_chat_id
         AND b.organization_id=a.organization_id AND b.restaurant_id=a.restaurant_id
       JOIN telegram_bot_settings s ON s.chat_id=b.chat_id AND s.organization_id=b.organization_id
      WHERE a.status IN ('open','overdue')
        AND a.due_at + (s.escalation_minutes * interval '1 minute') <= $1::timestamptz
      ORDER BY a.due_at ASC LIMIT 100`,
    [now.toISOString()],
    {},
  );
  for (const action of overdueResult.rows || []) {
    const body = [
      'Эскалация · просроченная задача',
      action.title,
      'Срок: ' + new Date(action.due_at).toLocaleString('ru-RU'),
      'Статус: требуется внимание руководителя',
    ].join('\\n');
    const eventKey = 'escalation:' + action.id + ':' + new Date(action.due_at).toISOString();
    try {
      const deliveryId = await claimDelivery(queryWithRetry, eventKey, action.organization_id, action.restaurant_id, action.chat_id, 'escalation', body);
      if (!deliveryId) { stats.skipped += 1; continue; }
      await sendMessage(action.chat_id, body);
      await finishDelivery(queryWithRetry, deliveryId, 'sent', null, action.organization_id);
      await queryWithRetry(
        `UPDATE operational_actions SET status='overdue',updated_at=now()
          WHERE id=$1::uuid AND organization_id=$2::uuid AND status='open'`,
        [action.id, action.organization_id],
        { orgId: action.organization_id },
      );
      await queryWithRetry(
        `INSERT INTO operational_action_events(id,organization_id,restaurant_id,action_id,actor_id,event_type,details,created_at)
         VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,'system','escalated',$4::jsonb,now())`,
        [action.organization_id, action.restaurant_id, action.id, JSON.stringify({ delivery_id: deliveryId, escalation_minutes: action.escalation_minutes })],
        { orgId: action.organization_id },
      );
      stats.escalationsSent += 1;
    } catch (error) {
      stats.failed += 1;
    }
  }
  return stats;
}

module.exports = { zonedParts, safeTimeZone, processTelegramLifecycleJobs };
