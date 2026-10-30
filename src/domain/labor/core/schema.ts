import { z } from 'zod';

export const PayModelSchema = z.enum(['hourly', 'per_shift', 'monthly_salary']);
export type PayModel = z.infer<typeof PayModelSchema>;
export const LaborRecordStatusSchema = z.enum(['budget', 'planned', 'actual']);
export type LaborRecordStatus = z.infer<typeof LaborRecordStatusSchema>;

export const PayTermsSchema = z.object({
  model: PayModelSchema,
  hourlyRate: z.number().finite().nonnegative().nullable().default(null),
  shiftRate: z.number().finite().nonnegative().nullable().default(null),
  monthlySalary: z.number().finite().nonnegative().nullable().default(null),
  approvedAllowances: z.number().finite().nonnegative().nullable().default(null),
  currency: z.string().trim().min(1).default('RUB'),
});
export type PayTerms = z.infer<typeof PayTermsSchema>;

export const LaborPlanRowSchema = z.object({
  id: z.string().min(1), businessDate: z.string().date(),
  employeeId: z.string().trim().min(1).nullable().default(null), employeeName: z.string().trim().min(1).nullable().default(null),
  positionName: z.string().trim().min(1), departmentId: z.string().trim().min(1).nullable().default(null), departmentName: z.string().trim().min(1).nullable().default(null),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().default(null), endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  hours: z.number().finite().nonnegative().nullable(), pay: PayTermsSchema, status: LaborRecordStatusSchema,
  source: z.string().trim().min(1), sourceRow: z.number().int().positive().nullable().default(null),
});
export type LaborPlanRow = z.infer<typeof LaborPlanRowSchema>;
export type MetricValue = { value: number | null; status: 'complete' | 'partial' | 'unavailable'; currency?: string; reasons: string[] };
export type LaborBudgetSummary = {
  periodStart: string; periodEnd: string; currency: string; plannedHours: MetricValue; actualHours: MetricValue; hoursVariance: MetricValue;
  plannedCost: MetricValue; actualCost: MetricValue; costVariance: MetricValue; includedRows: number; excludedRows: number;
  byPosition: Array<{ positionName: string; plannedHours: MetricValue; actualHours: MetricValue; plannedCost: MetricValue; actualCost: MetricValue }>;
};
