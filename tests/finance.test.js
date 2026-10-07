import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboard, listOperations, projectView, teamBalances } from '../src/lib/finance.js';

// Суммы в копейках, как в Firestore
const data = {
  members: [{ id: 'a', name: 'Анна', role: 'PM' }, { id: 'b', name: 'Денис', role: 'Backend' }],
  projects: [{ id: 'p', name: 'P', budget: 10000000, status: 'active', member_ids: ['a', 'b'] }],
  iterations: [
    { id: 'i1', project_id: 'p', title: '1', price: 5000000, status: 'done', shares: { a: 1000000, b: 2000000 } },
    { id: 'i2', project_id: 'p', title: '2', price: 999900, status: 'cancelled', shares: { b: 500000 } },
  ],
  operations: [
    { id: 'o1', project_id: 'p', type: 'income', amount: 6000000, date: '2026-05-01', is_advance: true },
    { id: 'o2', project_id: 'p', type: 'payout', amount: 1500050, date: '2026-05-02', member_id: 'b' },
    { id: 'o3', project_id: 'p', type: 'penalty', amount: 100000, date: '2026-05-03', member_id: 'b' },
    { id: 'o4', project_id: 'p', type: 'expense', amount: 50000, date: '2026-05-04', category: 'Сервера' },
    { id: 'o5', project_id: 'p', type: 'tax', amount: 200000, date: '2026-06-01' },
    { id: 'o6', project_id: 'p', type: 'transfer', amount: 700000, date: '2026-06-02', member_id: 'a', from_member_id: 'b' },
  ],
};

test('сводка по проекту', () => {
  const s = projectView(data, 'p').summary;
  assert.equal(s.income, 60000);
  assert.equal(s.advance, 60000);
  assert.equal(s.cash, 60000 - 15000.5 - 500 - 2000);
  assert.equal(s.receivable, 40000);
  assert.equal(s.iterationsTotal, 50000);
  assert.equal(s.teamAccrued, 29000);
  assert.equal(s.teamDue, 29000 - 15000.5);
  assert.equal(s.profitPlan, 100000 - 29000 - 500 - 2000);
});

test('баланс участника: начислено − штрафы − выплачено, отменённые итерации не считаются', () => {
  const denis = teamBalances(data, 'p').find((m) => m.member_id === 'b');
  assert.deepEqual([denis.accrued, denis.penalties, denis.paid, denis.due], [20000, 1000, 15000.5, 3999.5]);
});

test('сводка за месяц и список операций', () => {
  const d = dashboard(data, '2026-05');
  assert.equal(d.monthFlow.income, 60000);
  assert.equal(d.monthFlow.taxes, 0);
  assert.equal(d.series.at(-1).month, '2026-05');
  assert.equal(d.series.at(-1).outflow, 15500.5);
  const ops = listOperations(data, { month: '2026-06' });
  assert.deepEqual(ops.map((o) => o.id), ['o6', 'o5']);
  assert.equal(ops[0].from_member_name, 'Денис');
});
