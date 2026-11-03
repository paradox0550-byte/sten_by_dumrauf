'use strict';

const TELEGRAM_GROUP_TYPES = new Set(['group', 'supergroup']);
const CALLBACK_DATA_MAX_BYTES = 64;

function normalizeTelegramUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return { kind: 'invalid' };

  const callback = update.callback_query;
  if (callback) {
    const message = callback.message;
    const sender = callback.from;
    const data = typeof callback.data === 'string' ? callback.data : '';
    if (!callback.id || !message?.chat || !sender || sender.is_bot) {
      return { kind: 'unsupported', updateId: update.update_id };
    }
    if (!TELEGRAM_GROUP_TYPES.has(message.chat.type)) {
      return { kind: 'unsupported', updateId: update.update_id };
    }
    if (Buffer.byteLength(data, 'utf8') > CALLBACK_DATA_MAX_BYTES) {
      return { kind: 'unsupported', updateId: update.update_id, reason: 'callback_data_too_long' };
    }
    return {
      kind: 'callback_query',
      updateId: update.update_id,
      callbackQueryId: String(callback.id),
      chatId: String(message.chat.id),
      chatType: message.chat.type,
      chatTitle: String(message.chat.title || ''),
      messageId: String(message.message_id),
      senderId: String(sender.id),
      senderName: [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim(),
      senderUsername: sender.username ? String(sender.username) : null,
      data,
      raw: update,
    };
  }

  const edited = Boolean(update.edited_message);
  const message = edited ? update.edited_message : update.message;
  if (!message || !message.chat || !message.from) return { kind: 'unsupported', updateId: update.update_id };
  if (!TELEGRAM_GROUP_TYPES.has(message.chat.type)) return { kind: 'unsupported', updateId: update.update_id };
  if (message.from.is_bot) return { kind: 'unsupported', updateId: update.update_id };
  const text = typeof message.text === 'string' ? message.text : (typeof message.caption === 'string' ? message.caption : '');
  return {
    kind: 'message',
    updateId: update.update_id,
    chatId: String(message.chat.id),
    chatType: message.chat.type,
    chatTitle: String(message.chat.title || ''),
    messageId: String(message.message_id),
    senderId: String(message.from.id),
    senderName: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim(),
    senderUsername: message.from.username ? String(message.from.username) : null,
    text,
    messageDate: Number.isInteger(message.date) ? new Date(message.date * 1000) : null,
    editedAt: Number.isInteger(message.edit_date) ? new Date(message.edit_date * 1000) : null,
    edited,
    raw: update,
  };
}

async function claimTelegramUpdate(query, updateId, leaseSeconds = 45) {
  if (!Number.isSafeInteger(updateId)) throw new TypeError('Invalid Telegram update id');
  const claimed = await query(
    `UPDATE telegram_updates
     SET processing_status='processing', processing_attempts=processing_attempts+1,
         processing_started_at=now(), next_attempt_at=now(), last_error=NULL
     WHERE update_id=$1 AND (
       (processing_status='pending' AND next_attempt_at <= now())
       OR (processing_status='processing' AND processing_started_at < now() - ($2::int * interval '1 second'))
     ) RETURNING update_id, processing_attempts`,
    [updateId, leaseSeconds]
  );
  if (claimed.rows?.[0]) return { claimed: true, attempts: claimed.rows[0].processing_attempts };
  const rows = await query('SELECT processing_status FROM telegram_updates WHERE update_id=$1 LIMIT 1', [updateId]);
  const status = rows.rows?.[0]?.processing_status || 'missing';
  return { claimed: false, processed: status === 'processed', busy: status === 'processing', status };
}

async function completeTelegramUpdate(query, updateId, attempts) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new TypeError('Invalid Telegram processing lease');
  const result = await query(
    `UPDATE telegram_updates SET processing_status='processed', processed_at=now(),
       processing_started_at=NULL, last_error=NULL
     WHERE update_id=$1 AND processing_status='processing' AND processing_attempts=$2 RETURNING update_id`,
    [updateId, attempts]
  );
  if (!result.rows?.length) throw new Error('Telegram update lease was lost before completion');
  return { processed: true };
}

async function failTelegramUpdate(query, updateId, attempts, error) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new TypeError('Invalid Telegram processing lease');
  const message = String(error?.code || error?.message || error || 'processing_failed').slice(0, 500);
  await query(
    `UPDATE telegram_updates SET processing_status='pending', processing_started_at=NULL,
       next_attempt_at=now(), last_error=$2
     WHERE update_id=$1 AND processing_status='processing' AND processing_attempts=$3`,
    [updateId, message, attempts]
  );
}
async function persistTelegramUpdate(query, update) {
  const normalized = normalizeTelegramUpdate(update);
  if (normalized.kind === 'invalid') throw new Error('Invalid Telegram update');
  if (normalized.kind === 'unsupported') {
    return { accepted: true, stored: false, reason: normalized.reason || normalized.kind };
  }

  if (normalized.kind === 'callback_query') {
    const result = await query(
      `INSERT INTO telegram_updates (update_id, received_at, update_json)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (update_id) DO NOTHING
       RETURNING update_id`,
      [normalized.updateId, JSON.stringify(normalized.raw)]
    );
    const inserted = Boolean(result.rows?.length);
    return {
      accepted: true,
      stored: inserted,
      duplicate: !inserted,
      kind: 'callback_query',
      callback: inserted ? {
        callbackQueryId: normalized.callbackQueryId,
        chatId: normalized.chatId,
        chatType: normalized.chatType,
        chatTitle: normalized.chatTitle,
        messageId: normalized.messageId,
        senderId: normalized.senderId,
        senderName: normalized.senderName,
        senderUsername: normalized.senderUsername,
        data: normalized.data,
      } : null,
    };
  }

  const result = await query(
    `WITH inserted_update AS (
       INSERT INTO telegram_updates (update_id, received_at, update_json)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (update_id) DO NOTHING
       RETURNING update_id
     ), upserted_chat AS (
       INSERT INTO telegram_chats (chat_id, chat_type, title, first_seen_at, last_seen_at)
       SELECT $3, $4, NULLIF($5, ''), now(), now()
       FROM inserted_update
       ON CONFLICT (chat_id) DO UPDATE SET
         chat_type = EXCLUDED.chat_type,
         title = COALESCE(EXCLUDED.title, telegram_chats.title),
         last_seen_at = now()
       RETURNING chat_id
     ), upserted_message AS (
       INSERT INTO telegram_messages
         (chat_id, message_id, update_id, sender_id, sender_name, sender_username,
          message_text, message_date, edited_at, raw_json, received_at)
       SELECT $3, $6, $1, $7, NULLIF($8, ''), $9, $10, $11, $12, $2::jsonb, now()
       FROM inserted_update CROSS JOIN upserted_chat
       ON CONFLICT (chat_id, message_id) DO UPDATE SET
         update_id = EXCLUDED.update_id,
         sender_id = EXCLUDED.sender_id,
         sender_name = EXCLUDED.sender_name,
         sender_username = EXCLUDED.sender_username,
         message_text = EXCLUDED.message_text,
         edited_at = EXCLUDED.edited_at,
         raw_json = EXCLUDED.raw_json
       RETURNING message_id
     ), invalidated_analysis AS (
       DELETE FROM telegram_message_analyses a
        USING upserted_message m
        WHERE a.chat_id=$3 AND a.message_id=m.message_id
        RETURNING a.message_id
     )
     SELECT EXISTS(SELECT 1 FROM inserted_update) AS is_new,
            EXISTS(SELECT 1 FROM upserted_message) AS message_stored`,
    [normalized.updateId, JSON.stringify(normalized.raw), normalized.chatId,
     normalized.chatType, normalized.chatTitle, normalized.messageId,
     normalized.senderId, normalized.senderName, normalized.senderUsername,
     normalized.text, normalized.messageDate, normalized.editedAt]
  );
  const row = result.rows?.[0] || {};
  return { accepted: true, stored: Boolean(row.message_stored), duplicate: !row.is_new, kind: 'message', updateId: normalized.updateId };
}

module.exports = { normalizeTelegramUpdate, persistTelegramUpdate, claimTelegramUpdate, completeTelegramUpdate, failTelegramUpdate };
