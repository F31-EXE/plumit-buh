import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tx, toKop, toRub } from './db.js';
import {
  createSession, destroySession, hashPassword, loginRateLimit,
  requireAdmin, requireUser, sessionMiddleware, verifyPassword,
} from './auth.js';
import { dashboard, projectSummary, teamBalances } from './finance.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

const OP_TYPES = ['income', 'payout', 'expense', 'tax', 'penalty', 'transfer'];
const PROJECT_STATUSES = ['active', 'paused', 'done'];
const ITERATION_STATUSES = ['planned', 'in_work', 'done', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const id = (v) => (v === null || v === undefined || v === '' ? null : Number.parseInt(v, 10) || null);
function money(v, field) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) throw bad(`Поле «${field}» должно быть неотрицательным числом`);
  return toKop(n);
}
function oneOf(v, list, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (!list.includes(v)) throw bad(`Недопустимое значение: ${v}`);
  return v;
}
function date(v, { required = false } = {}) {
  if (!v) {
    if (required) throw bad('Укажите дату');
    return null;
  }
  if (!DATE_RE.test(v)) throw bad('Дата должна быть в формате ГГГГ-ММ-ДД');
  return v;
}

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) { next(e); }
};

export function createApp(db) {
  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY === '1');
  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware(db));

  const api = express.Router();

  // ---------- Авторизация ----------
  api.post('/auth/login', loginRateLimit, wrap((req, res) => {
    const login = str(req.body?.login, 100);
    const password = String(req.body?.password ?? '');
    const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Неверный логин или пароль');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    createSession(db, res, user.id);
    return { id: user.id, login: user.login, name: user.name, role: user.role };
  }));
  api.post('/auth/logout', wrap((req, res) => { destroySession(db, req, res); return { ok: true }; }));
  api.get('/auth/me', requireUser, wrap((req) => req.user));
  api.post('/auth/password', requireUser, wrap((req) => {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(req.body?.current ?? ''), user.password_hash)) throw bad('Текущий пароль неверен');
    const next = String(req.body?.next ?? '');
    if (next.length < 8) throw bad('Новый пароль — минимум 8 символов');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    return { ok: true };
  }));

  api.use(requireUser);
  // Наблюдатели (viewer) могут только читать
  api.use((req, res, next) => (req.method === 'GET' || req.user.role === 'admin' ? next() : requireAdmin(req, res, next)));

  // ---------- Пользователи ----------
  api.get('/users', requireAdmin, wrap(() => db.prepare('SELECT id, login, name, role, created_at FROM users ORDER BY id').all()));
  api.post('/users', wrap((req) => {
    const login = str(req.body?.login, 100);
    const password = String(req.body?.password ?? '');
    if (!login) throw bad('Укажите логин');
    if (password.length < 8) throw bad('Пароль — минимум 8 символов');
    if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(login)) throw bad('Такой логин уже есть');
    const r = db.prepare('INSERT INTO users (login, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
      login, str(req.body?.name, 100) || login, hashPassword(password), oneOf(req.body?.role, ['admin', 'viewer'], 'viewer'),
    );
    return { id: Number(r.lastInsertRowid) };
  }));
  api.delete('/users/:id', wrap((req) => {
    if (id(req.params.id) === req.user.id) throw bad('Нельзя удалить самого себя');
    db.prepare('DELETE FROM users WHERE id = ?').run(id(req.params.id));
    return { ok: true };
  }));

  // ---------- Команда ----------
  api.get('/members', wrap(() => {
    const balances = new Map(teamBalances(db).map((b) => [b.member_id, b]));
    return db.prepare('SELECT * FROM members ORDER BY active DESC, id').all().map((m) => ({
      ...m,
      active: !!m.active,
      balance: balances.get(m.id) || { accrued: 0, penalties: 0, paid: 0, due: 0 },
    }));
  }));
  api.post('/members', wrap((req) => {
    const name = str(req.body?.name, 100);
    if (!name) throw bad('Укажите имя');
    const r = db.prepare('INSERT INTO members (name, role) VALUES (?, ?)').run(name, str(req.body?.role, 100));
    return { id: Number(r.lastInsertRowid) };
  }));
  api.put('/members/:id', wrap((req) => {
    const name = str(req.body?.name, 100);
    if (!name) throw bad('Укажите имя');
    db.prepare('UPDATE members SET name = ?, role = ?, active = ? WHERE id = ?').run(
      name, str(req.body?.role, 100), req.body?.active === false ? 0 : 1, id(req.params.id),
    );
    return { ok: true };
  }));
  api.delete('/members/:id', wrap((req) => {
    const mid = id(req.params.id);
    const used = db.prepare(
      `SELECT (SELECT COUNT(*) FROM operations WHERE member_id = ? OR from_member_id = ?) +
              (SELECT COUNT(*) FROM iteration_shares WHERE member_id = ? AND amount > 0) AS n`,
    ).get(mid, mid, mid).n;
    if (used > 0) throw bad('У участника есть начисления или операции — его можно только сделать неактивным');
    db.prepare('DELETE FROM members WHERE id = ?').run(mid);
    return { ok: true };
  }));

  // ---------- Проекты ----------
  function readProject(body) {
    const name = str(body?.name, 200);
    if (!name) throw bad('Укажите название проекта');
    return {
      name,
      client: str(body?.client, 200),
      budget: money(body?.budget, 'Стоимость проекта'),
      status: oneOf(body?.status, PROJECT_STATUSES, 'active'),
      start_date: date(body?.start_date),
      notes: str(body?.notes, 5000),
      members: Array.isArray(body?.members) ? body.members.map(id).filter(Boolean) : null,
    };
  }
  function setProjectMembers(projectId, members) {
    if (!members) return;
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
    const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, member_id) VALUES (?, ?)');
    for (const m of members) ins.run(projectId, m);
  }

  api.get('/projects', wrap(() => db.prepare(`SELECT * FROM projects ORDER BY status = 'done', id DESC`).all()
    .map((p) => ({ ...p, budget: toRub(p.budget), summary: projectSummary(db, p.id) }))));

  api.get('/projects/:id', wrap((req) => {
    const pid = id(req.params.id);
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!p) throw new HttpError(404, 'Проект не найден');
    const members = db.prepare(
      'SELECT m.id, m.name, m.role FROM project_members pm JOIN members m ON m.id = pm.member_id WHERE pm.project_id = ? ORDER BY m.id',
    ).all(pid);
    const shares = db.prepare(
      'SELECT s.* FROM iteration_shares s JOIN iterations i ON i.id = s.iteration_id WHERE i.project_id = ?',
    ).all(pid);
    const iterations = db.prepare('SELECT * FROM iterations WHERE project_id = ? ORDER BY sort, id').all(pid).map((it) => ({
      ...it,
      price: toRub(it.price),
      shares: Object.fromEntries(shares.filter((s) => s.iteration_id === it.id).map((s) => [s.member_id, toRub(s.amount)])),
    }));
    return { ...p, budget: toRub(p.budget), members, iterations, summary: projectSummary(db, pid) };
  }));

  api.post('/projects', wrap((req) => {
    const p = readProject(req.body);
    return tx(db, () => {
      const r = db.prepare('INSERT INTO projects (name, client, budget, status, start_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.name, p.client, p.budget, p.status, p.start_date, p.notes);
      const pid = Number(r.lastInsertRowid);
      setProjectMembers(pid, p.members);
      return { id: pid };
    });
  }));

  api.put('/projects/:id', wrap((req) => {
    const pid = id(req.params.id);
    const p = readProject(req.body);
    tx(db, () => {
      db.prepare('UPDATE projects SET name = ?, client = ?, budget = ?, status = ?, start_date = ?, notes = ? WHERE id = ?')
        .run(p.name, p.client, p.budget, p.status, p.start_date, p.notes, pid);
      setProjectMembers(pid, p.members);
    });
    return { ok: true };
  }));

  api.delete('/projects/:id', wrap((req) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id(req.params.id));
    return { ok: true };
  }));

  // ---------- Итерации (пункты работ) ----------
  function readIteration(body) {
    const title = str(body?.title, 1000);
    if (!title) throw bad('Укажите название итерации');
    const shares = Object.entries(body?.shares || {})
      .map(([mid, amount]) => [id(mid), money(amount, 'Доля')])
      .filter(([mid, amount]) => mid && amount > 0);
    return {
      title,
      price: money(body?.price, 'Стоимость'),
      status: oneOf(body?.status, ITERATION_STATUSES, 'planned'),
      date: date(body?.date),
      notes: str(body?.notes, 5000),
      shares,
    };
  }
  function setShares(iterationId, shares) {
    db.prepare('DELETE FROM iteration_shares WHERE iteration_id = ?').run(iterationId);
    const ins = db.prepare('INSERT INTO iteration_shares (iteration_id, member_id, amount) VALUES (?, ?, ?)');
    for (const [mid, amount] of shares) ins.run(iterationId, mid, amount);
  }

  api.post('/projects/:id/iterations', wrap((req) => {
    const pid = id(req.params.id);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw new HttpError(404, 'Проект не найден');
    const it = readIteration(req.body);
    return tx(db, () => {
      const { next } = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM iterations WHERE project_id = ?').get(pid);
      const r = db.prepare('INSERT INTO iterations (project_id, title, price, status, date, sort, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(pid, it.title, it.price, it.status, it.date, next, it.notes);
      const iid = Number(r.lastInsertRowid);
      setShares(iid, it.shares);
      return { id: iid };
    });
  }));

  api.put('/iterations/:id', wrap((req) => {
    const iid = id(req.params.id);
    const it = readIteration(req.body);
    tx(db, () => {
      db.prepare('UPDATE iterations SET title = ?, price = ?, status = ?, date = ?, notes = ? WHERE id = ?')
        .run(it.title, it.price, it.status, it.date, it.notes, iid);
      setShares(iid, it.shares);
    });
    return { ok: true };
  }));

  api.delete('/iterations/:id', wrap((req) => {
    db.prepare('DELETE FROM iterations WHERE id = ?').run(id(req.params.id));
    return { ok: true };
  }));

  // ---------- Операции ----------
  function readOperation(body) {
    const type = oneOf(body?.type, OP_TYPES, null);
    if (!type) throw bad('Укажите тип операции');
    const op = {
      project_id: id(body?.project_id),
      date: date(body?.date, { required: true }),
      type,
      amount: money(body?.amount, 'Сумма'),
      member_id: id(body?.member_id),
      from_member_id: id(body?.from_member_id),
      category: str(body?.category, 100),
      comment: str(body?.comment, 2000),
      is_advance: type === 'income' && body?.is_advance ? 1 : 0,
    };
    if (op.amount <= 0) throw bad('Сумма должна быть больше нуля');
    if (['payout', 'penalty', 'transfer'].includes(type) && !op.member_id) throw bad('Укажите, кому');
    if (type === 'transfer' && !op.from_member_id) throw bad('Укажите, от кого перевод');
    if (!['payout', 'penalty', 'transfer'].includes(type)) op.member_id = null;
    if (type !== 'transfer') op.from_member_id = null;
    if (['income', 'payout', 'penalty'].includes(type) && !op.project_id) throw bad('Укажите проект');
    return op;
  }

  const OP_SELECT = `
    SELECT o.*, p.name AS project_name, m.name AS member_name, fm.name AS from_member_name
    FROM operations o
    LEFT JOIN projects p ON p.id = o.project_id
    LEFT JOIN members m ON m.id = o.member_id
    LEFT JOIN members fm ON fm.id = o.from_member_id`;

  function listOperations(q) {
    const where = [];
    const args = [];
    if (q.project_id) { where.push('o.project_id = ?'); args.push(id(q.project_id)); }
    if (q.month) {
      if (!MONTH_RE.test(q.month)) throw bad('Месяц в формате ГГГГ-ММ');
      where.push('substr(o.date, 1, 7) = ?'); args.push(q.month);
    }
    if (q.type) { where.push('o.type = ?'); args.push(oneOf(q.type, OP_TYPES)); }
    if (q.member_id) { where.push('(o.member_id = ? OR o.from_member_id = ?)'); args.push(id(q.member_id), id(q.member_id)); }
    if (q.q) { where.push('(o.comment LIKE ? OR o.category LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
    const limit = Math.min(Number.parseInt(q.limit, 10) || 1000, 5000);
    return db.prepare(`${OP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.date DESC, o.id DESC LIMIT ${limit}`)
      .all(...args).map((o) => ({ ...o, amount: toRub(o.amount), is_advance: !!o.is_advance }));
  }

  api.get('/operations', wrap((req) => listOperations(req.query)));

  api.post('/operations', wrap((req) => {
    const o = readOperation(req.body);
    const r = db.prepare(
      `INSERT INTO operations (project_id, date, type, amount, member_id, from_member_id, category, comment, is_advance, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(o.project_id, o.date, o.type, o.amount, o.member_id, o.from_member_id, o.category, o.comment, o.is_advance, req.user.id);
    return { id: Number(r.lastInsertRowid) };
  }));

  api.put('/operations/:id', wrap((req) => {
    const o = readOperation(req.body);
    db.prepare(
      `UPDATE operations SET project_id = ?, date = ?, type = ?, amount = ?, member_id = ?, from_member_id = ?,
       category = ?, comment = ?, is_advance = ? WHERE id = ?`,
    ).run(o.project_id, o.date, o.type, o.amount, o.member_id, o.from_member_id, o.category, o.comment, o.is_advance, id(req.params.id));
    return { ok: true };
  }));

  api.delete('/operations/:id', wrap((req) => {
    db.prepare('DELETE FROM operations WHERE id = ?').run(id(req.params.id));
    return { ok: true };
  }));

  api.get('/categories', wrap(() => db.prepare(
    `SELECT category, COUNT(*) AS n FROM operations WHERE category != '' GROUP BY category ORDER BY n DESC LIMIT 30`,
  ).all().map((r) => r.category)));

  // ---------- Сводка ----------
  api.get('/dashboard', wrap((req) => {
    const month = req.query.month && MONTH_RE.test(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
    return dashboard(db, month);
  }));

  // ---------- Экспорт ----------
  const TYPE_LABELS = { income: 'Поступление', payout: 'Выплата', expense: 'Расход', tax: 'Налоги/взносы', penalty: 'Штраф', transfer: 'Перевод' };
  api.get('/export/operations.csv', (req, res, next) => {
    try {
      const rows = listOperations({ ...req.query, limit: 5000 });
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Дата', 'Тип', 'Проект', 'Сумма', 'Кому', 'От кого', 'Категория', 'Аванс', 'Комментарий'].map(esc).join(';')];
      for (const o of rows) {
        lines.push([o.date, TYPE_LABELS[o.type], o.project_name, String(o.amount).replace('.', ','), o.member_name, o.from_member_name,
          o.category, o.is_advance ? 'да' : '', o.comment].map(esc).join(';'));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="plumit-operations.csv"');
      res.send(`﻿${lines.join('\r\n')}`); // BOM, чтобы Excel открыл кириллицу
    } catch (e) { next(e); }
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

  // ---------- Клиент (собранный Vite) ----------
  const dist = join(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
    if (String(err?.message).includes('FOREIGN KEY')) return res.status(400).json({ error: 'Связанная запись не найдена' });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
