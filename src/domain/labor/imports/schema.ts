import { z } from 'zod';

export const ImportSourceSchema = z.enum(['iiko', 'xlsx', 'csv', 'manual']);
export type ImportSource = z.infer<typeof ImportSourceSchema>;

export const ImportBatchSchema = z.object({
  id: z.string().min(1),
  source: ImportSourceSchema,
  fileName: z.string().min(1),
  importedAt: z.string().datetime(),
  periodStart: z.string().date().nullable(),
  periodEnd: z.string().date().nullable(),
  rowCount: z.number().int().nonnegative(),
  acceptedRows: z.number().int().nonnegative(),
  rejectedRows: z.number().int().nonnegative(),
  fingerprint: z.string().min(1),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const SalesLineSchema = z.object({
  businessDate: z.string().date(),
  hour: z.number().int().min(0).max(23),
  itemName: z.string().trim().min(1),
  categoryName: z.string().trim().min(1),
  zoneId: z.string().trim().min(1).nullable(),
  quantity: z.number().finite().nonnegative(),
  revenue: z.number().finite(),
  effortUnits: z.number().finite().nonnegative().nullable().default(null),
  sourceRow: z.number().int().positive().optional(),
});
export type SalesLine = z.infer<typeof SalesLineSchema>;

export const ShiftLineSchema = z.object({
  businessDate: z.string().date(),
  employeeName: z.string().trim().min(1),
  positionName: z.string().trim().min(1),
  zoneId: z.string().trim().min(1).nullable().default(null),
  hours: z.number().finite().nonnegative(),
  hourlyRate: z.number().finite().nonnegative().nullable().default(null),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  sourceRow: z.number().int().positive().optional(),
});
export type ShiftLine = z.infer<typeof ShiftLineSchema>;

export type ImportIssue = { row: number; reason: string };
export type NormalizationReport = {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  skippedRows: number;
  issues: ImportIssue[];
};
