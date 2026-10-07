import type { Scope } from '../scope';

export interface ParsedMessage {
  date: string | null;
  revenue: number | null;
  cash: number | null;
  card: number | null;
  discounts: number | null;
  checks: number | null;
  restaurant: string | null;
}

export interface IngestMessageResponse {
  ok: boolean;
  parsed: ParsedMessage;
  context: { restaurant_id: string; restaurant_name: string } | null;
  requiresConfirmation: boolean;
  requiresBinding: boolean;
}

export interface IngestConfirmPayload {
  date: string;
  parsed: ParsedMessage;
  scope: Scope & { restaurant_id: string };
}
