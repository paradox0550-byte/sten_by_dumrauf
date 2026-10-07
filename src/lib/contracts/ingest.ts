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

export interface IngestScope {
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
}

export interface IngestConfirmPayload {
  date: string;
  parsed: ParsedMessage;
  scope: IngestScope;
}
