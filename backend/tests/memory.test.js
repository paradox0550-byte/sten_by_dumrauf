'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMemory,
  listMemory,
  updateMemoryConfidence,
  loadMemoryContext,
} = require('../core/memory');

const user = { id:'22222222-2222-4222-8222-222222222222', organizationId:'11111111-1111-4111-8111-111111111111' };
const restaurant = '33333333-3333-4333-8333-333333333333';

function fakeDb(initial=[]) {
  const rows = [...initial];
  return {
    rows,
    async queryWithRetry(sql, params) {
      if (sql.startsWith('INSERT INTO ai_memory')) {
        const row = {
          id: params[0], organization_id: params[1], project_id: params[2], branch_id: params[3],
          restaurant_id: params[4], department_id: params[5], kind: params[6], title: params[7], content: params[8],
          evidence_json: JSON.parse(params[9]), confidence:'unconfirmed', confirmed_by_user_id:null, confirmed_at:null,
          source_message_id:null, created_by:params[11], created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
        };
        rows.push(row);
        return {rows:[row]};
      }
      if (sql.startsWith('SELECT id, organization_id') && sql.includes('FROM ai_memory WHERE id=')) {
        return {rows: rows.filter(row=>row.id===params[0] && row.organization_id===params[1])};
      }
      if (sql.startsWith('SELECT id, organization_id') && sql.includes('FROM ai_memory WHERE')) {
        const org=params[0];
        let out=rows.filter(row=>row.organization_id===org);
        if (sql.includes("confidence='confirmed'")) out=out.filter(row=>row.confidence==='confirmed');
        if (sql.includes("confidence='unconfirmed'")) out=out.filter(row=>row.confidence==='unconfirmed');
        if (sql.includes('confidence=$')) {
          const confidence=params.find(p=>['confirmed','unconfirmed','rejected'].includes(p));
          if (confidence) out=out.filter(row=>row.confidence===confidence);
        }
        return {rows:out.slice(0, Number(params[params.length-1]))};
      }
      if (sql.startsWith('UPDATE ai_memory')) {
        const row=rows.find(r=>r.id===params[1] && r.organization_id===params[3] && r.confidence==='unconfirmed');
        if (!row) return {rows:[]};
        row.confidence=params[0];
        if(params[0]==='confirmed'){row.confirmed_by_user_id=params[2];row.confirmed_at=new Date().toISOString();}
        return {rows:[row]};
      }
      if (sql.startsWith('SELECT confidence')) {
        const row=rows.find(r=>r.id===params[0] && r.organization_id===params[1]);
        return {rows:row?[{confidence:row.confidence}]:[]};
      }
      if (sql.startsWith('DELETE FROM ai_memory')) {
        const index=rows.findIndex(r=>r.id===params[0] && r.organization_id===params[1]);
        if(index<0)return {rows:[]};
        const [deleted]=rows.splice(index,1);
        return {rows:[{id:deleted.id}]};
      }
      if (sql.startsWith('SELECT 1 FROM ai_memory')) {
        return {rows: rows.some(r=>r.id===params[0] && r.organization_id===params[1])?[{exists:1}]:[]};
      }
      throw new Error(`Unhandled SQL: ${sql.slice(0,80)}`);
    },
    async audit(){},
  };
}

test('createMemory writes valid payload and rejects invalid kind', async () => {
  const db=fakeDb();
  const memory=await createMemory(user,{scope:{restaurant_id:restaurant},kind:'fact',title:'ФОТ',content:'ФОТ подтверждён',evidence:{source:'pnl'}},db);
  assert.equal(memory.kind,'fact');
  await assert.rejects(
    () => createMemory(user,{scope:{},kind:'invalid',title:'x',content:'y'},db),
    error => error.status === 400,
  );
});

test('listMemory is organization-scoped', async () => {
  const db=fakeDb([{id:'other',organization_id:'99999999-9999-4999-8999-999999999999',kind:'fact',confidence:'confirmed'}]);
  const result=await listMemory(user,{confidence:'confirmed'},db);
  assert.ok(result.memories.every(row=>row.organization_id===user.organizationId));
});

test('updateMemoryConfidence transitions unconfirmed to confirmed only', async () => {
  const db=fakeDb();
  const memory=await createMemory(user,{scope:{},kind:'fact',title:'x',content:'y'},db);
  const updated=await updateMemoryConfidence(user,memory.id,'confirmed',db);
  assert.equal(updated.confidence,'confirmed');
  await assert.rejects(() => updateMemoryConfidence(user,memory.id,'unconfirmed',db), error => error.status===400);
});

test('loadMemoryContext returns 10 confirmed + 5 unconfirmed', async () => {
  const db=fakeDb();
  for(let i=0;i<12;i++){
    const m=await createMemory(user,{scope:{restaurant_id:restaurant},kind:'fact',title:`c${i}`,content:'confirmed'},db);
    await updateMemoryConfidence(user,m.id,'confirmed',db);
  }
  for(let i=0;i<8;i++) await createMemory(user,{scope:{restaurant_id:restaurant},kind:'action',title:`u${i}`,content:'unconfirmed'},db);
  const context=await loadMemoryContext(user,{restaurant_id:restaurant},15,db);
  assert.equal(context.confirmed.length,10);
  assert.equal(context.unconfirmed.length,5);
});
