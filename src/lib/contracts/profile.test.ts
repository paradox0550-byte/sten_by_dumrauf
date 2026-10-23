import { describe, expect, it } from 'vitest';
import { normalizeProfileText, validateProfilePayload, type ProfileUpdatePayload } from './profile';
import { AskRequestSchema } from './ask';

const payload = (telegramChatId: string | null): ProfileUpdatePayload => ({
  firstName: 'Александр',
  lastName: 'Думрауф',
  position: 'Операционный директор',
  telegramChatId,
});

describe('profile contract validation', () => {
  it('rejects Telegram IDs containing letters', () => {
    expect(validateProfilePayload(payload('123ab456')).telegramChatId).toBeTruthy();
  });

  it('accepts negative Telegram group IDs with 5–20 digits', () => {
    expect(validateProfilePayload(payload('-123456789'))).toEqual({});
  });

  it('treats an empty Telegram ID as cleared/null', () => {
    expect(validateProfilePayload(payload(null))).toEqual({});
  });

  it('enforces profile field length limits', () => {
    expect(validateProfilePayload({
      firstName: 'a'.repeat(81),
      lastName: 'b'.repeat(81),
      position: 'c'.repeat(121),
      telegramChatId: null,
    })).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      position: expect.any(String),
    });
  });

  it('trims text and normalizes Unicode to NFC', () => {
    expect(normalizeProfileText('  e\u0301  ')).toBe('é');
  });
});

describe('AI request contract', () => {
  it('requires an explicit scope and restaurant_id field', () => {
    expect(AskRequestSchema.safeParse({ question: 'Проверь P&L' }).success).toBe(false);
    expect(AskRequestSchema.safeParse({
      question: 'Проверь P&L',
      scope: {
        period: '2026-10',
        project_id: null,
        branch_id: null,
        restaurant_id: 'restaurant-1',
        department_id: null,
      },
    }).success).toBe(true);
  });
});
