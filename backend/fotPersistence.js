'use strict';

const { z } = require('zod');

const PERIOD_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/u;

const FotScopeSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  restaurant_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
}).strict();

const NumericText = (max) => z.string().max(32).refine((value) => {
  if (value.trim() === '') return true;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= max;
}, 'Ожидается неотрицательное число в допустимом диапазоне');

const PositionPlanEntrySchema = z.object({
  headcount: NumericText(1000),
  hoursPerPerson: NumericText(744),
  hourlyRate: NumericText(10000000),
}).strict();

const PositionPlanSchema = z.record(z.string().min(1).max(300), PositionPlanEntrySchema).refine(
  (value) => Object.keys(value).length <= 500,
  'В плане слишком много должностей'
);

const CustomPositionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  department: z.string().trim().min(1).max(120),
  position: z.string().trim().min(1).max(160),
}).strict();

const FotScheduleHistorySchema = z.object({
  period: z.string().regex(PERIOD_RE),
  scope: FotScopeSchema,
  fileName: z.string().trim().min(1).max(300),
  normHours: z.number().finite().min(0).max(744),
  ndfl: z.number().finite().min(0).nullable(),
  calculations: z.array(z.record(z.unknown())).max(5000),
  totals: z.record(z.unknown()),
  savedAt: z.string().datetime().optional(),
}).strict();

const FotStaffingPlanSchema = z.object({
  period: z.string().regex(PERIOD_RE),
  scope: FotScopeSchema,
  plan: PositionPlanSchema,
  customPositions: z.array(CustomPositionSchema).max(300),
}).strict().superRefine((value, context) => {
  const seen = new Set();
  for (const item of value.customPositions) {
    const key = item.department.normalize('NFC').toLocaleLowerCase('ru-RU') + '::' +
      item.position.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru-RU');
    if (seen.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Повторяется пользовательская должность', path: ['customPositions'] });
      break;
    }
    seen.add(key);
  }
});

function normalizeFotScope(input = {}) {
  const parsed = FotScopeSchema.parse({
    project_id: input.project_id || null,
    branch_id: input.branch_id || null,
    restaurant_id: input.restaurant_id || null,
    department_id: input.department_id || null,
  });
  return {
    project_id: parsed.project_id || null,
    branch_id: parsed.branch_id || null,
    restaurant_id: parsed.restaurant_id || null,
    department_id: parsed.department_id || null,
  };
}

function fotScopeKey(scope) {
  const normalized = normalizeFotScope(scope);
  return JSON.stringify([
    normalized.project_id || '',
    normalized.branch_id || '',
    normalized.restaurant_id || '',
    normalized.department_id || '',
  ]);
}

function assertJsonPayloadSize(value, maxBytes = 4 * 1024 * 1024) {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > maxBytes) {
    const error = new Error('Объём данных ФОТ превышает допустимый размер.');
    error.status = 413;
    error.code = 'FOT_PAYLOAD_TOO_LARGE';
    throw error;
  }
  return bytes;
}

module.exports = {
  FotScopeSchema,
  FotScheduleHistorySchema,
  FotStaffingPlanSchema,
  normalizeFotScope,
  fotScopeKey,
  assertJsonPayloadSize,
};
