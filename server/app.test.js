import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { hashPassword } from './auth.js';
import { createApp } from './app.js';

async function setup() {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO users (login, name, password_hash, role) VALUES (?, ?, ?, ?)').run('admin', 'A', hashPassword('password1'), 'admin');
  db.prepare('INSERT INTO users (login, name, password_hash, role) VALUES (?, ?, ?, ?)').run('view', 'V', hashPassword('password2'), 'viewer');
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function login(login, password) {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) });
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    return async (path, { method = 'GET', body } = {}) => {
      const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie || '' }, body: body && JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
  }
  return { server, login };
}

test('расчёт баланса проекта и команды', async (t) => {
  const { server, login } = await setup();
  t.after(() => { server.closeAllConnections(); server.close(); });
  const call = await login('admin', 'password1');

  const a = (await call('/members', { method: 'POST', body: { name: 'Анна', role: 'PM' } })).body.id;
  const b = (await call('/members', { method: 'POST', body: { name: 'Денис', role: 'Backend' } })).body.id;
  const pid = (await call('/projects', { method: 'POST', body: { name: 'P', budget: 100000, members: [a, b] } })).body.id;

  await call(`/projects/${pid}/iterations`, { method: 'POST', body: { title: '1', price: 50000, status: 'done', shares: { [a]: 10000, [b]: 20000 } } });
  await call(`/projects/${pid}/iterations`, { method: 'POST', body: { title: '2', price: 9999, status: 'cancelled', shares: { [b]: 5000 } } });
  for (const body of [
    { type: 'income', amount: 60000, date: '2026-05-01', is_advance: true },
    { type: 'payout', amount: 15000.5, date: '2026-05-02', member_id: b },
    { type: 'penalty', amount: 1000, date: '2026-05-03', member_id: b },
    { type: 'expense', amount: 500, date: '2026-05-04', category: 'Сервера' },
    { type: 'tax', amount: 2000, date: '2026-06-01' },
    { type: 'transfer', amount: 7000, date: '2026-06-02', member_id: a, from_member_id: b },
  ]) {
    const r = await call('/operations', { method: 'POST', body: { project_id: pid, ...body } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }

  const s = (await call(`/projects/${pid}`)).body.summary;
  assert.equal(s.income, 60000);
  assert.equal(s.advance, 60000);
  assert.equal(s.cash, 60000 - 15000.5 - 500 - 2000);
  assert.equal(s.receivable, 40000);
  assert.equal(s.iterationsTotal, 50000);
  const denis = s.team.find((m) => m.member_id === b);
  assert.deepEqual([denis.accrued, denis.penalties, denis.paid, denis.due], [20000, 1000, 15000.5, 3999.5]);
  assert.equal(s.teamAccrued, 29000);
  assert.equal(s.profitPlan, 100000 - 29000 - 500 - 2000);

  const d = (await call('/dashboard?month=2026-05')).body;
  assert.equal(d.monthFlow.income, 60000);
  assert.equal(d.monthFlow.taxes, 0);
  assert.equal(d.series.at(-1).month, '2026-05');

  assert.equal((await call('/operations', { method: 'POST', body: { type: 'payout', amount: 10, date: '2026-01-01', project_id: pid } })).status, 400);
  assert.equal((await call('/operations', { method: 'POST', body: { type: 'income', amount: -5, date: '2026-01-01', project_id: pid } })).status, 400);
});

test('доступ: без входа и наблюдатель', async (t) => {
  const { server, login } = await setup();
  t.after(() => { server.closeAllConnections(); server.close(); });
  const anon = await login('admin', 'wrong');
  assert.equal((await anon('/projects')).status, 401);
  const viewer = await login('view', 'password2');
  assert.equal((await viewer('/projects')).status, 200);
  assert.equal((await viewer('/projects', { method: 'POST', body: { name: 'x' } })).status, 403);
});
