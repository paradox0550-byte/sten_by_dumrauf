'use strict';

const TELEGRAM_GROUP_TYPES = new Set(['group', 'supergroup']);

function normalizeTelegramUpdate(update) {
  if (!update || !Number.isSafeInteger(update.update_id)) return { kind: 'invalid' };
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

async function persistTelegramUpdate(query, update) {
  const normalized = normalizeTelegramUpdate(update);
  if (normalized.kind === 'invalid') throw new Error('Invalid Telegram update');
  if (normalized.kind !== 'message') return { accepted: true, stored: false, reason: normalized.kind };

  const result = await query(
    `WITH inserted_update AS (
       INSERT INTO telegram_updates (update_id, received_at, update_json)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (update_id) DO NOTHING
       RETURNING update_id
     ), upserted_chat AS (
       INSERT INTO telegram_chats (chat_id, chat_type, title, first_seen_at, last_seen_at)
       VALUES ($3, $4, NULLIF($5, ''), now(), now())
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
     )
     SELECT EXISTS(SELECT 1 FROM inserted_update) AS is_new,
            EXISTS(SELECT 1 FROM upserted_message) AS message_stored`,
    [normalized.updateId, JSON.stringify(normalized.raw), normalized.chatId,
     normalized.chatType, normalized.chatTitle, normalized.messageId,
     normalized.senderId, normalized.senderName, normalized.senderUsername,
     normalized.text, normalized.messageDate, normalized.editedAt]
  );
  const row = result.rows?.[0] || {};
  return { accepted: true, stored: Boolean(row.message_stored), duplicate: !row.is_new };
}

module.exports = { normalizeTelegramUpdate, persistTelegramUpdate };
