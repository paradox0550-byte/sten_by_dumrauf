export interface ProfileUpdatePayload {
  firstName: string;
  lastName: string;
  position: string;
  telegramChatId: string | null;
}

export interface ProfileApiUser {
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  telegramChatId?: string | number | null;
}

export interface ProfileUpdateResponse {
  profile?: ProfileApiUser;
}

export interface MessengerSettings {
  send_time?: string | null;
  metrics?: Partial<Record<'revenue' | 'cashCard' | 'discounts' | 'avgCheck' | 'checks' | 'primeCost' | 'ebitda' | 'deviation', boolean>> | null;
  telegram_chat_id?: string | number | null;
}

export interface MessengerSettingsResponse {
  settings?: MessengerSettings | null;
}

export interface MessengerSettingsPayload {
  provider: 'telegram';
  send_time: string;
  scope: {
    period: string;
    project_id: string;
    branch_id: string;
    restaurant_id: string;
    department_id: string;
  };
  metrics: Record<string, boolean>;
  telegram_chat_id: string | null;
  whatsapp_phone: null;
}

export function normalizeProfileText(value: string): string {
  return value.trim().normalize('NFC');
}

export function isValidTelegramChatId(value: string): boolean {
  return /^-?\d{5,20}$/.test(value);
}
