const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const gateway = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'API_GATEWAY_SPEC_2026-09-29.yaml'), 'utf8');

test('analytics settings backend contract exposes protected GET and PUT routes', () => {
  assert.match(backend, /app\.get\('\/api\/analytics\/settings',requireAuth,requireOrg/);
  assert.match(backend, /app\.put\('\/api\/analytics\/settings',requireAuth,requireOrg/);
  assert.match(backend, /const AnalyticsSettingsSchema = z\.object\(\{/);
  assert.match(backend, /INSERT INTO analytics_settings\(organization_id,config_json,updated_at,updated_by\)/);
  assert.match(backend, /ok\(res,\{saved:true,confirmed:true,settings:config\}\)/);
});

test('API Gateway contract exposes GET/PUT/OPTIONS for analytics settings', () => {
  const start = gateway.indexOf('  /api/analytics/settings:');
  assert.notEqual(start, -1, 'analytics settings path missing from gateway spec');
  const next = gateway.indexOf('\n  /', start + 3);
  const block = gateway.slice(start, next === -1 ? gateway.length : next);
  assert.match(block, /    get:/);
  assert.match(block, /    put:/);
  assert.match(block, /    options:/);
  assert.equal((block.match(/function_id: d4epijnhj7h9sd5ppa66/g) || []).length, 3);
  assert.equal((block.match(/service_account_id: '\$\{var\.gateway_service_account_id\}'/g) || []).length, 2);
});
