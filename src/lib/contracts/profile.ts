export interface ProfileUpdatePayload {
  firstName: string;
  lastName: string;
  position: string;
  telegramChatId: string | null;
}

export interface ProfileResponse {
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    position?: string | null;
    telegramChatId?: string | null;
  };
}

export type ProfileField = keyof ProfileUpdatePayload;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export const normalizeProfileText = (value: string): string =>
  value.trim().normalize('NFC');

export const TELEGRAM_ID_RE = /^-?\d{5,20}$/;

export function validateProfilePayload(payload: ProfileUpdatePayload): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  if (payload.firstName.length > 80) errors.firstName = 'Имя — не более 80 символов.';
  if (payload.lastName.length > 80) errors.lastName = 'Фамилия — не более 80 символов.';
  if (payload.position.length > 120) errors.position = 'Должность — не более 120 символов.';
  if (payload.telegramChatId !== null && !TELEGRAM_ID_RE.test(payload.telegramChatId)) {
    errors.telegramChatId = 'Введите Telegram ID: от 5 до 20 цифр, знак «−» допустим для групп.';
  }
  return errors;
}

export interface MessengerSettings {
  settings?: {
    provider?: 'telegram' | 'whatsapp' | string;
    send_time?: string;
    metrics?: Partial<Record<'revenue' | 'cashCard' | 'discounts' | 'avgCheck' | 'checks' | 'primeCost' | 'ebitda' | 'deviation', boolean>>;
    telegram_chat_id?: string | null;
    whatsapp_phone?: string | null;
  } | null;
}
