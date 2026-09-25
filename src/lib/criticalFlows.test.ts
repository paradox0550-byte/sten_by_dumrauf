import { describe, expect, it, vi, afterEach } from 'vitest';
import { calculateFinance } from './financeCalculator';
import { formatMoneyInput, parseMoneyInput, percent, variance } from './pnl';
import { rowsMatch, writePnlAndVerify } from './saveVerify';
import { scopeQuery } from './scope';

describe('финансовый контур', () => {
  it('считает EBITDA без статьи «Прочее», а чистую прибыль — с ней', () => {
    const r = calculateFinance({
      revenue: 1000000, cogs: 300000, payroll: 200000, opex: 100000,
      depreciation: 50000, interest: 20000, tax: 30000, other: 10000,
    });
    expect(r.grossProfit).toBe(700000);
    expect(r.ebitda).toBe(400000);
    expect(r.netProfit).toBe(290000);
  });

  it('не превращает неполные данные в ноль', () => {
    expect(calculateFinance({ revenue: 1000000, cogs: 300000 }).ebitda).toBeUndefined();
    expect(percent(undefined, 1000000)).toBeUndefined();
    expect(variance(100, undefined)).toBeUndefined();
  });
});

describe('масштаб P&L', () => {
  it('хранит исходные рубли независимо от масштаба ввода', () => {
    expect(parseMoneyInput('10 000', 'RUB')).toBe(10000);
    expect(parseMoneyInput('10,0', 'THOUSAND')).toBe(10000);
    expect(parseMoneyInput('1,5', 'MILLION')).toBe(1500000);
    expect(formatMoneyInput(10000, 'THOUSAND')).toBe('10');
  });
});

describe('Scope', () => {
  it('передаёт период и выбранные уровни в API', () => {
    const q = scopeQuery({ period:'2026-09', projectId:'p1', branchId:'b1', restaurantId:'r1', departmentId:'d1' });
    expect(q).toContain('period=2026-09');
    expect(q).toContain('project_id=p1');
    expect(q).toContain('branch_id=b1');
    expect(q).toContain('restaurant_id=r1');
    expect(q).toContain('department_id=d1');
  });
});

describe('P&L save/readback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('подтверждает запись только после повторного чтения и совпадения', async () => {
    const rows = [{ article:'Выручка', plan:1000000, fact:900000 }];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data:{ saved:true, confirmed:true } }), { status:200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data:{ rows } }), { status:200 })));
    const result = await writePnlAndVerify({ period:'2026-09', projectId:'p1' }, rows);
    expect(result).toEqual({ ok:true, confirmed:true, message:'Сохранено сервером и подтверждено повторным чтением выбранной области.' });
  });

  it('отклоняет подтверждение при несовпадении readback', () => {
    expect(rowsMatch(
      [{ article:'Выручка', plan:100, fact:90 }],
      [{ article:'Выручка', plan:100, fact:80 }],
    )).toBe(false);
  });
});
