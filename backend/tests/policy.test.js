'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enforcePolicy } = require('../core/policy');

const org = '11111111-1111-4111-8111-111111111111';
const user = { id:'22222222-2222-4222-8222-222222222222', organizationId:org, role:'manager', organizationStatus:'active' };

test('requireAuth rejects null user with 401', async () => {
  await assert.rejects(() => enforcePolicy(null, { policy:['requireAuth'] }, {}, {}), error => error.status === 401);
});

test('requireOrg rejects missing organization with 403', async () => {
  await assert.rejects(() => enforcePolicy({id:user.id}, { policy:['requireOrg'] }, {}, {}), error => error.status === 403);
});

test('assertScopeAccess rejects a foreign scope', async () => {
  await assert.rejects(
    () => enforcePolicy(user, { policy:['assertScopeAccess'] }, { restaurant_id:'33333333-3333-4333-8333-333333333333' }, {
      assertScopeAccess: async () => { const error=new Error('foreign scope'); error.status=403; throw error; },
    }),
    error => error.status === 403 || error.status === 404,
  );
});

test('31st tool call in one minute is rate-limited with 429', async () => {
  const tool={policy:['rateLimit']};
  const rateUser = {...user,id:'rate-test-single'};
  for(let i=0;i<30;i++) await enforcePolicy(rateUser,tool,{},{});
  await assert.rejects(() => enforcePolicy(rateUser,tool,{},{}), error => error.status === 429);
});
