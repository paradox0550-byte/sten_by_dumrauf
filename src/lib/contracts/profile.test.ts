import { describe, expect, it } from 'vitest';
import { isValidTelegramChatId, normalizeProfileText } from './profile';

describe('profile contract helpers', () => {
  it('rejects Telegram IDs containing letters or too few digits', () => {
    expect(isValidTelegramChatId('123ab456')).toBe(false);
    expect(isValidTelegramChatId('1234')).toBe(false);
  });

  it('accepts signed group chat IDs with 5–20 digits', () => {
    expect(isValidTelegramChatId('-123456789')).toBe(true);
    expect(isValidTelegramChatId('12345')).toBe(true);
    expect(isValidTelegramChatId('12345678901234567890')).toBe(true);
  });

  it('rejects IDs longer than 20 digits and multiple signs', () => {
    expect(isValidTelegramChatId('123456789012345678901')).toBe(false);
    expect(isValidTelegramChatId('--12345')).toBe(false);
  });

  it('trims and normalizes text to NFC', () => {
    expect(normalizeProfileText('  Cafe\u0301  ')).toBe('Café');
  });
});
