'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('FOT migration creates isolated stores without changing payroll facts', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261104_fot_shared_persistence.sql'), 'utf8');
  for (const table of ['fot_schedule_history', 'fot_staffing_plans', 'fot_custom_position_sets']) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
    assert.match(migration, new RegExp('organization_id UUID NOT NULL'));
    assert.match(migration, new RegExp('scope_key TEXT NOT NULL'));
  }
  assert.match(migration, /UNIQUE \(organization_id, scope_key, period\)/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE TABLE/iu);
  assert.doesNotMatch(migration, /payroll_records/iu);
});

test('FOT API handlers enforce organization, workspace access and management-role writes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const start = source.indexOf("app.get('/api/fot/schedule-history'");
  const end = source.indexOf('/* ---- 404 / error handler ---- */', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal((block.match(/requireOrg/g) || []).length, 4);
  assert.equal((block.match(/assertScopeAccess\(req.user, scope\)/g) || []).length, 4);
  assert.equal((block.match(/requireRole\(\.\.\.WRITE_ROLES\)/g) || []).length, 2);
  assert.match(block, /WHERE organization_id=\$1::uuid AND scope_key=\$2/u);
  assert.match(block, /await audit\(req.user, 'fot\.schedule_history\.saved'/u);
  assert.match(block, /await audit\(req.user, 'fot\.staffing_plan\.saved'/u);
  assert.doesNotMatch(block, /payroll_records/u);
});
