'use strict';

const { buildTelegramAnalysisPrompt, parseTelegramAnalysis } = require('./telegramSecretary');

async function processTelegramMessageBatch({ queryWithRetry, analyze, limit = 20, orgId = null }) {
  if (typeof queryWithRetry !== 'function' || typeof analyze !== 'function') {
    throw new TypeError('Telegram secretary worker requires database and AI adapters');
  }
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));

  // 0. Очистка "зомби" записей (если воркер упал 15 минут назад и не удалил claim)
  try {
    await queryWithRetry(
      `DELETE FROM telegram_message_analyses 
        WHERE analysis_json->>'status' = 'processing' 
          AND created_at < now() - interval '15 minutes'`,
      [],
      { orgId: orgId || undefined }
    );
  } catch (e) {
    console.error('[sten] telegram zombie cleanup failed:', e.message);
  }

  // 1. Получаем пачку необработанных сообщений
  const pending = await queryWithRetry(
    `SELECT m.chat_id, m.message_id, m.sender_id, m.sender_name, m.message_text,
            m.message_date, b.organization_id, b.restaurant_id, u.name AS restaurant_name,
            COALESCE(s.mode, 'observer') AS bot_mode
       FROM telegram_messages m
       JOIN telegram_chat_bindings b ON b.chat_id=m.chat_id
       JOIN org_units u ON u.id=b.restaurant_id AND u.organization_id=b.organization_id
       LEFT JOIN telegram_bot_settings s ON s.chat_id=b.chat_id AND s.organization_id=b.organization_id
       LEFT JOIN telegram_message_analyses a ON a.chat_id=m.chat_id AND a.message_id=m.message_id
       WHERE a.message_id IS NULL
         AND length(trim(m.message_text)) >= 3
         AND ($1::uuid IS NULL OR b.organization_id=$1::uuid)
       ORDER BY m.message_date ASC NULLS LAST, m.received_at ASC
       LIMIT $2`,
    [orgId, safeLimit],
    { orgId: orgId || undefined }
  );

  const results = { scanned: pending.rows?.length || 0, analyzed: 0, skipped: 0, failed: 0 };

  for (const row of pending.rows || []) {
    // 2. Механизм "Захвата" (Claim) — блокируем сообщение до вызова LLM
    let claimed = false;
    try {
      const claim = await queryWithRetry(
        `INSERT INTO telegram_message_analyses 
           (chat_id, message_id, organization_id, restaurant_id, sender_id, analysis_json, created_at)
         VALUES ($1, $2, $3::uuid, $4::uuid, $5, jsonb_build_object('status', 'processing', 'text', $6), now())
         ON CONFLICT (chat_id, message_id) DO NOTHING
         RETURNING message_id`,
        [row.chat_id, row.message_id, row.organization_id, row.restaurant_id, row.sender_id, row.message_text],
        { orgId: row.organization_id }
      );
      claimed = claim.rows?.length > 0;
    } catch (e) {
      console.error('[sten] telegram claim failed:', row.message_id, e.message);
    }

    // Если не удалось захватить — его уже обрабатывает другой воркер
    if (!claimed) {
      results.skipped += 1;
      continue;
    }

    // 3. Сбор контекста (последние 8 сообщений до текущего)
    let context = '';
    try {
      const contextResult = await queryWithRetry(
        `SELECT sender_name, message_text, message_date
           FROM telegram_messages
          WHERE chat_id=$1 AND message_id<>$2
            AND message_date <= COALESCE($3::timestamptz, now())
          ORDER BY message_date DESC NULLS LAST, received_at DESC LIMIT 8`,
        [row.chat_id, row.message_id, row.message_date],
        { orgId: row.organization_id }
      );
      context = (contextResult.rows || []).reverse()
        .map(item => `${item.sender_name || 'Участник'}: ${String(item.message_text || '').slice(0, 700)}`)
        .join('\n');
    } catch (e) {
      console.warn('[sten] context fetch failed, proceeding without:', e.message);
    }

    // 4. Вызов LLM и сохранение результата
    try {
      const prompt = buildTelegramAnalysisPrompt(row.restaurant_name, context, row.message_text);
      const raw = await analyze(prompt, row);
      const analysis = parseTelegramAnalysis(raw, {
        chatId: row.chat_id,
        messageId: row.message_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        messageDate: row.message_date,
        mode: row.bot_mode,
      });

      if (!analysis) {
        throw new Error('LLM returned invalid analysis (parsed to null)');
      }

      // Обновляем пустышку на реальный анализ. 
      // Проверяем, что текст не изменился (защита от редактирования).
      const updateRes = await queryWithRetry(
        `UPDATE telegram_message_analyses
            SET analysis_json = $1::jsonb, created_at = now()
          WHERE chat_id = $2 
            AND message_id = $3 
            AND analysis_json->>'status' = 'processing'
            AND analysis_json->>'text' = $4
          RETURNING message_id`,
        [JSON.stringify(analysis), row.chat_id, row.message_id, row.message_text],
        { orgId: row.organization_id }
      );

      if (updateRes.rows?.length) {
        results.analyzed += 1;
      } else {
        // Текст изменился (отредактировали) или запись удалена параллельным процессом.
        results.skipped += 1;
      }
    } catch (err) {
      results.failed += 1;
      console.error(
        '[sten] telegram analyze failed:',
        'chat=', row.chat_id,
        'message=', row.message_id,
        'code=', err?.code || '',
        'msg=', err?.message || err
      );
      
      // 5. ОТКАТ: Если упали — удаляем claim, чтобы сообщение попало в следующую пачку
      try {
        await queryWithRetry(
          `DELETE FROM telegram_message_analyses 
            WHERE chat_id = $1 AND message_id = $2 AND analysis_json->>'status' = 'processing'`,
          [row.chat_id, row.message_id],
          { orgId: row.organization_id }
        );
      } catch (dbErr) {
        console.error('[sten] failed to release claim:', dbErr.message);
      }
    }
  }

  return results;
}

module.exports = { processTelegramMessageBatch };
