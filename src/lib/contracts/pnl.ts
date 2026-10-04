import { z } from 'zod';

/* ═════════════════════════════════════════════════════════════════
   POST /api/pnl — запись P&L за период
   Соответствует PnlWriteSchema из backend/index.js (со strict()).
   ═════════════════════════════════════════════════════════════════ */

/** YYYY-MM, как на backend (YM_RE). */
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** YYYY-MM-DD (DATE_RE). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PnlRowInput {
  id?: string;
  article: string;
  key?: string;
  label?: string;
  plan?: number | null;
  fact?: number | null;
  source?: string | null;
  transaction_total?: number | null;
  transaction_count?: number | null;
  classification?: { confidence?: number; source?: string };
}

export interface PnlWriteRequest {
  period: string;
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
  rows: PnlRowInput[];
}

export const PnlRowSchema: z.ZodType<PnlRowInput> = z.object({
  id: z.string().max(120).optional(),
  article: z.string().min(1).max(240),
  key: z.string().max(240).optional(),
  label: z.string().max(240).optional(),
  plan: z.number().finite().nullable().optional(),
  fact: z.number().finite().nullable().optional(),
  source: z.string().max(500).nullable().optional(),
  transaction_total: z.number().finite().nullable().optional(),
  transaction_count: z.number().int().nonnegative().nullable().optional(),
  classification: z.object({
    confidence: z.number().finite().optional(),
    source: z.string().max(60).optional(),
  }).strict().optional(),
}).strict();

export const PnlWriteSchema: z.ZodType<PnlWriteRequest> = z.object({
  period: z.string().regex(PERIOD_RE, 'period должен быть YYYY-MM'),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
  rows: z.array(PnlRowSchema).min(1).max(2000),
}).strict();

/* ═════════════════════════════════════════════════════════════════
   POST /api/pnl/transactions — расход / доход
   ═════════════════════════════════════════════════════════════════ */

export interface PnlTransactionRequest {
  period: string;
  date: string;
  type: 'expense' | 'income';
  article: string;
  amount: number;
  comment?: string | null;
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
}

export const PnlTransactionSchema: z.ZodType<PnlTransactionRequest> = z.object({
  period: z.string().regex(PERIOD_RE, 'period должен быть YYYY-MM'),
  date: z.string().regex(DATE_RE, 'date должен быть YYYY-MM-DD'),
  type: z.enum(['expense', 'income']),
  article: z.string().trim().min(1).max(240),
  amount: z.number().finite().positive(),
  comment: z.string().trim().max(2000).nullable().optional(),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
}).strict();

/* ═════════════════════════════════════════════════════════════════
   POST /api/pnl/approve — утверждение плана P&L за период
   ═════════════════════════════════════════════════════════════════ */

export interface PnlApproveRequest {
  period: string;
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
}

export const PnlApproveSchema: z.ZodType<PnlApproveRequest> = z.object({
  period: z.string().regex(PERIOD_RE, 'period должен быть YYYY-MM'),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
}).strict();

/* ═════════════════════════════════════════════════════════════════
   POST /api/pnl/import — импорт P&L из Excel (base64)
   ═════════════════════════════════════════════════════════════════ */

export interface PnlImportRequest {
  period: string;
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
  name: string;
  mimeType?: string;
  dataBase64: string;
}

export const PnlImportSchema: z.ZodType<PnlImportRequest> = z.object({
  period: z.string().regex(PERIOD_RE, 'period должен быть YYYY-MM'),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
  name: z.string().min(1).max(300),
  mimeType: z.string().max(120).optional(),
  dataBase64: z.string().min(8).max(30 * 1024 * 1024),
}).strict();