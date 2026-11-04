'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FotScheduleHistorySchema,
  FotStaffingPlanSchema,
  normalizeFotScope,
  fotScopeKey,
  assertJsonPayloadSize,
} = require('../fotPersistence');

const restaurant = '00000000-0000-4000-8000-000000000001';
const branch = '00000000-0000-4000-8000-000000000002';

test('FOT schedule history requires a valid period, scope and explicit calculation payload', () => {
  const valid = FotScheduleHistorySchema.safeParse({
    period: '2026-11',
    scope: { branch_id: branch, restaurant_id: restaurant },
    fileName: 'График.xlsx',
    normHours: 164,
    ndfl: null,
    calculations: [{ employee: 'Иванов', accrued: null, hours: 160 }],
    totals: { accrued: null, employeesWithErrors: 1 },
  });
  assert.equal(valid.success, true);
  assert.equal(FotScheduleHistorySchema.safeParse({
    period: '2026-13',
    scope: { restaurant_id: restaurant },
    fileName: 'bad.xlsx',
    normHours: 164,
    ndfl: null,
    calculations: [],
    totals: {},
  }).success, false);
});

test('staffing plan validates numeric strings and rejects duplicate custom positions', () => {
  const base = {
    period: '2026-11',
    scope: { restaurant_id: restaurant },
    plan: { 'Кухня::Повар': { headcount: '2,5', hoursPerPerson: '164', hourlyRate: '450' } },
    customPositions: [{ id: 'custom-1', department: 'Кухня', position: 'Су-шеф ночной смены' }],
  };
  assert.equal(FotStaffingPlanSchema.safeParse(base).success, true);
  assert.equal(FotStaffingPlanSchema.safeParse({
    ...base,
    customPositions: [...base.customPositions, { id: 'custom-2', department: 'кухня', position: 'СУ-ШЕФ НОЧНОЙ СМЕНЫ' }],
  }).success, false);
  assert.equal(FotStaffingPlanSchema.safeParse({
    ...base,
    plan: { 'Кухня::Повар': { headcount: '-1', hoursPerPerson: '164', hourlyRate: '450' } },
  }).success, false);
});

test('FOT scope keys are stable and never include the acting user', () => {
  const a = normalizeFotScope({ restaurant_id: restaurant });
  const b = normalizeFotScope({ restaurant_id: restaurant, project_id: null });
  assert.equal(fotScopeKey(a), fotScopeKey(b));
  assert.equal(fotScopeKey(a), JSON.stringify(['', '', restaurant, '']));
});

test('oversized history payloads are rejected before database writes', () => {
  assert.throws(() => assertJsonPayloadSize({ data: 'x'.repeat(1024) }, 100), (error) => error.code === 'FOT_PAYLOAD_TOO_LARGE' && error.status === 413);
});
