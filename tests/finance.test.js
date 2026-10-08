import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountSummary, dashboard, listOperations, memberStatement, projectView, teamBalances } from '../src/lib/finance.js';

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

test('выписка сотрудника: только свои начисления и выплаты', () => {
  const s = memberStatement(data, 'b');
  assert.equal(s.name, 'Денис');
  assert.deepEqual(s.totals, { accrued: 2000000, penalties: 100000, paid: 1500050, due: 399950 });
  assert.equal(s.projects.length, 1);
  assert.deepEqual(s.projects[0].items.map((i) => i.amount), [2000000, 500000]); // отменённая видна, но не начисляется
  assert.deepEqual(s.history.map((h) => h.type), ['transfer', 'penalty', 'payout']);
  assert.equal(s.history[0].direction, 'out');
  assert.equal(s.history[0].other, 'Анна');
  assert.equal(JSON.stringify(s).includes('1000000'), false); // доля Анны не попадает в выписку Дениса
});

test('накопительный счёт: остаток, проценты, прогноз', () => {
  const acc = { rate: 18.25, capitalization: 'monthly' };
  const ops = [
    { type: 'deposit', date: '2026-01-01', amount: 10000000 },  // 100 000 ₽
    { type: 'interest', date: '2026-02-01', amount: 150000 },   // 1 500 ₽
    { type: 'withdraw', date: '2026-02-10', amount: 1000000 },  // 10 000 ₽
  ];
  const s = accountSummary(acc, ops, '2026-02-11');
  assert.equal(s.balance, 91500);
  assert.equal(s.interest, 1500);
  // с 1 по 9 февраля — 101 500 ₽, 10 февраля — 91 500 ₽ (снятие в этот день)
  const expected = (10150000 * 9 + 9150000) * 0.1825 / 365 / 100;
  assert.equal(s.accrued, Math.round(expected * 100) / 100);
  assert.equal(s.monthForecast, Math.round(9150000 * 0.1825 / 12) / 100);
  assert.ok(s.effectiveYield > 18.25 && s.effectiveYield < 20);
  // смена ставки учитывается с её даты
  const s2 = accountSummary({ rate: 10 }, [{ type: 'deposit', date: '2026-01-01', amount: 3650000 }, { type: 'rate', date: '2026-01-11', rate: 20 }], '2026-01-21');
  assert.equal(s2.rate, 20);
  assert.equal(s2.accrued, Math.round(3650000 * (10 * 0.1 + 10 * 0.2) / 365) / 100);
});

test('импорт: проверка файла и связи между записями', async () => {
  const { planImport } = await import('../src/lib/importer.js');
  const plan = planImport({
    members: [{ key: 'a', name: 'Анна', role: 'PM' }, { key: 'b', name: 'Денис', role: 'Backend' }],
    projects: [{ key: 'p', name: 'Новый', budget: 1000, members: ['a', 'b'] }],
    iterations: [{ project: 'p', title: '1', price: 1000, status: 'done', shares: { a: 100, b: 200.5, x: 1 } }],
    operations: [
      { project: 'p', date: '2026-01-01', type: 'income', amount: 500, is_advance: true },
      { project: 'p', date: '2026-01-02', type: 'payout', amount: 100, member: 'b' },
      { date: '2026-01-03', type: 'payout', amount: 100, member: 'b' },
    ],
  }, { members: [{ id: 'existing-anna', name: 'анна' }], projects: [{ id: 'q', name: 'Новый' }] });
  assert.equal(plan.counts.members, 1); // Анна уже есть
  assert.equal(plan.counts.operations, 2);
  assert.equal(plan.errors.length, 2); // неизвестный участник x и выплата без проекта
  assert.ok(plan.warnings.some((w) => w.includes('Новый')));
  const it = plan.docs.find((d) => d.col === 'iterations').data;
  assert.equal(it.shares['existing-anna'], 10000);
  assert.equal(Object.values(it.shares).includes(20050), true);
  const proj = plan.docs.find((d) => d.col === 'projects').data;
  assert.equal(proj.budget, 100000);
  assert.equal(proj.member_ids[0], 'existing-anna');
});

test('демо-данные: находятся только демо-проекты и незанятые демо-участники', async () => {
  const { findDemo } = await import('../src/lib/demo.js');
  const data = {
    projects: [
      { id: 'd1', name: 'Маркетплейс «Ягода»', client: 'ООО «Ягода»', member_ids: ['anna', 'oleg'] },
      { id: 'real', name: 'CLOKWISE', client: '', member_ids: ['ilya'] },
      { id: 'same-name', name: 'Платформа опросов', client: 'Настоящий клиент', member_ids: [] },
    ],
    members: [{ id: 'anna', name: 'Анна' }, { id: 'oleg', name: 'Олег' }, { id: 'ilya', name: 'Илья' }, { id: 'vera', name: 'Вера' }],
    iterations: [
      { id: 'i1', project_id: 'd1', shares: { anna: 100 } },
      { id: 'i2', project_id: 'real', shares: { vera: 100 } }, // «Вера» участвует в настоящем проекте — не трогаем
    ],
    operations: [{ id: 'o1', project_id: 'd1', member_id: 'oleg' }, { id: 'o2', project_id: 'real', member_id: 'ilya' }],
    documents: [],
  };
  const f = findDemo(data);
  assert.deepEqual(f.projects.map((p) => p.id), ['d1']);
  assert.deepEqual(f.members.map((m) => m.id), ['anna', 'oleg']);
  assert.deepEqual(f.iterations.map((i) => i.id), ['i1']);
  assert.deepEqual(f.operations.map((o) => o.id), ['o1']);
});
