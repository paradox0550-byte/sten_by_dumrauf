'use strict';

function profileError(message, code) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

/**
 * Normalize and validate the public profile update payload.
 * Kept pure so this contract can be tested without a database.
 */
function normalizeProfilePayload(body) {
  const input = body && typeof body === 'object' ? body : {};
  const firstName = String(input.firstName ?? '').trim().normalize('NFC');
  const lastName = String(input.lastName ?? '').trim().normalize('NFC');
  const position = String(input.position ?? '').trim().normalize('NFC');
  const telegramChatId = String(input.telegramChatId ?? '').trim();

  if (firstName.length > 80 || lastName.length > 80 || position.length > 120 || telegramChatId.length > 80) {
    throw profileError('Проверьте данные профиля', 'PROFILE_INVALID');
  }

  // Telegram chat IDs may be negative for groups/supergroups; accept digits only.
  if (telegramChatId && !/^-?\d{5,20}$/u.test(telegramChatId)) {
    throw profileError('Telegram ID должен содержать только цифры, можно с минусом', 'TELEGRAM_ID_INVALID');
  }

  return { firstName, lastName, position, telegramChatId };
}

module.exports = { normalizeProfilePayload };
