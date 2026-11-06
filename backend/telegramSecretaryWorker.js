'use strict';

const { buildTelegramAnalysisPrompt, parseTelegramAnalysis } = require('./telegramSecretary');

async function processTelegramMessageBatch({ queryWithRetry, analyze, limit = 20, orgId = null }) {
  if (typeof queryWithRetry !== 'function' || typeof analyze !== 'function') {
    throw new TypeError('Telegram secretary worker requires database and AI adapters');
  }
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const pending = await queryWithRetry(
    `SELECT m.chat_id, m.message_id, m.sender_id, m.sender_name, m.sender_username, m.message_text,
            m.message_date, c.title AS chat_title, b.organization_id, b.restaurant_id,
            u.name AS restaurant_name, COALESCE(bs.mode,'secretary') AS bot_mode
       FROM telegram_messages m
       JOIN telegram_chat_bindings b ON b.chat_id=m.chat_id
       JOIN telegram_chats c ON c.chat_id=m.chat_id
       JOIN org_units u ON u.id=b.restaurant_id AND u.organization_id=b.organization_id
       LEFT JOIN telegram_bot_settings bs ON bs.chat_id=b.chat_id AND bs.organization_id=b.organization_id
       LEFT JOIN telegram_message_analyses a
         ON a.chat_id=m.chat_id AND a.message_id=m.message_id
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
    const contextResult = await queryWithRetry(
      `SELECT sender_name, message_text, message_date
         FROM telegram_messages
        WHERE chat_id=$1 AND message_id<>$2
          AND message_date <= COALESCE($3::timestamptz, now())
        ORDER BY message_date DESC NULLS LAST LIMIT 8`,
      [row.chat_id, row.message_id, row.message_date],
      { orgId: row.organization_id }
    );
    const context = (contextResult.rows || []).reverse()
      .map(item => `${item.sender_name || 'Участник'}: ${String(item.message_text || '').slice(0, 700)}`)
      .join('\\n');
    try {
      const prompt = buildTelegramAnalysisPrompt(row.restaurant_name, context, row.message_text);
      const raw = await analyze(prompt, row);
      const parsedAnalysis = parseTelegramAnalysis(raw, {
        chatId: row.chat_id,
        messageId: row.message_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        messageDate: row.message_date,
        mode: row.bot_mode,
      });
      if (!parsedAnalysis) {
        results.skipped += 1;
        continue;
      }
      const analysis = parsedAnalysis;
      const inserted = await queryWithRetry(
        `INSERT INTO telegram_message_analyses
          (chat_id,message_id,organization_id,restaurant_id,sender_id,analysis_json,
           source_message_text,source_message_date,source_sender_name,source_sender_username,source_chat_title,created_at)
         VALUES($1,$2,$3::uuid,$4::uuid,$5,$6::jsonb,$7,$8::timestamptz,$9,$10,$11,now())
         ON CONFLICT(chat_id,message_id) DO NOTHING
         RETURNING message_id`,
        [row.chat_id,row.message_id,row.organization_id,row.restaurant_id,row.sender_id,JSON.stringify(analysis),
         row.message_text,row.message_date,row.sender_name,row.sender_username,row.chat_title],
        { orgId: row.organization_id }
      );
      if (inserted.rows?.length) results.analyzed += 1;
      else results.skipped += 1;
    } catch {
      results.failed += 1;
    }
  }
  return results;
}

module.exports = { processTelegramMessageBatch };
