import { z } from 'zod';

export interface ReportWrite {
  date: string;
  values: Record<string, number>;
  note?: string | null;
  project_id?: string | null;
  branch_id?: string | null;
  restaurant_id?: string | null;
  department_id?: string | null;
}

export const ReportWriteSchema: z.ZodType<ReportWrite> = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date должен быть YYYY-MM-DD'),
  values: z.record(z.string().max(120), z.number().finite()),
  note: z.string().max(4000).nullable().optional(),
  project_id: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().trim().max(120).optional().nullable(),
  restaurant_id: z.string().trim().max(120).optional().nullable(),
  department_id: z.string().trim().max(120).optional().nullable(),
}).strict();