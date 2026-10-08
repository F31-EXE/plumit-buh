// Импорт данных из файла (например, перенесённых из Excel). Формат — JSON:
// {
//   "members":    [{ "key": "ilya", "name": "Илья", "role": "PM" }],
//   "projects":   [{ "key": "p1", "name": "…", "client": "", "budget": 705000, "status": "active", "start_date": "2026-03-01", "members": ["ilya"] }],
//   "iterations": [{ "project": "p1", "title": "…", "price": 65000, "status": "done", "date": null, "shares": { "ilya": 15727 } }],
//   "operations": [{ "project": "p1", "date": "2026-03-20", "type": "income", "amount": 160000, "member": null, "from_member": null,
//                    "category": "", "comment": "", "is_advance": true }]
// }
// Суммы — в рублях. Ссылки между записями — через key.
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { buildOperation, kop } from './actions.js';

const PROJECT_STATUSES = ['active', 'paused', 'done'];
const ITERATION_STATUSES = ['planned', 'in_work', 'done', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Проверяет файл и превращает его в готовые к записи документы. Ничего не пишет.
// existing — текущие данные (для предупреждения о дублях).
export function planImport(json, existing = { members: [], projects: [] }, newId = (() => { let i = 0; return () => `tmp${++i}`; })()) {
  const errors = [];
  const warnings = [];
  if (!json || typeof json !== 'object') return { errors: ['Файл не похож на данные для импорта'], warnings, docs: [] };
  const now = Date.now();
  let seq = 0;
  const docs = [];
  const add = (col, data) => { const id = newId(col); docs.push({ col, id, data: { ...data, created_ms: now + seq++ } }); return id; };

  // Участники: если такой уже есть (по имени), используем его
  const memberIds = new Map();
  for (const m of json.members || []) {
    if (!m?.key || !m?.name) { errors.push(`Участник без key или имени: ${JSON.stringify(m)}`); continue; }
    const found = existing.members.find((x) => x.name.trim().toLowerCase() === String(m.name).trim().toLowerCase());
    if (found) { memberIds.set(m.key, found.id); warnings.push(`Участник «${m.name}» уже есть — используем существующего`); continue; }
    memberIds.set(m.key, add('members', { name: String(m.name).trim().slice(0, 100), role: String(m.role || '').slice(0, 100), active: m.active !== false }));
  }
  const mid = (key, where) => {
    if (key == null || key === '') return null;
    if (!memberIds.has(key)) { errors.push(`${where}: неизвестный участник «${key}»`); return null; }
    return memberIds.get(key);
  };

  const projectIds = new Map();
  for (const p of json.projects || []) {
    if (!p?.key || !p?.name) { errors.push(`Проект без key или названия: ${JSON.stringify(p)}`); continue; }
    if (existing.projects.some((x) => x.name.trim().toLowerCase() === String(p.name).trim().toLowerCase())) {
      warnings.push(`Проект «${p.name}» уже есть в базе — будет создан ещё один с таким же названием`);
    }
    projectIds.set(p.key, add('projects', {
      name: String(p.name).slice(0, 200),
      client: String(p.client || '').slice(0, 200),
      budget: kop(p.budget, `Стоимость проекта «${p.name}»`),
      status: PROJECT_STATUSES.includes(p.status) ? p.status : 'active',
      start_date: DATE_RE.test(p.start_date || '') ? p.start_date : null,
      notes: String(p.notes || '').slice(0, 5000),
      member_ids: [...new Set((p.members || []).map((k) => mid(k, `Проект «${p.name}»`)).filter(Boolean))],
    }));
  }
  const pid = (key, where) => {
    if (key == null || key === '') return null;
    if (!projectIds.has(key)) { errors.push(`${where}: неизвестный проект «${key}»`); return null; }
    return projectIds.get(key);
  };

  const sortBy = new Map();
  for (const it of json.iterations || []) {
    const projectId = pid(it?.project, `Итерация «${it?.title}»`);
    if (!projectId || !it.title) { if (!it?.title) errors.push('Итерация без названия'); continue; }
    const shares = {};
    for (const [k, v] of Object.entries(it.shares || {})) {
      const m = mid(k, `Итерация «${it.title}»`);
      const amount = kop(v, `Доля в «${it.title}»`);
      if (m && amount > 0) shares[m] = amount;
    }
    const sort = (sortBy.get(projectId) || 0) + 1;
    sortBy.set(projectId, sort);
    add('iterations', {
      project_id: projectId,
      title: String(it.title).slice(0, 1000),
      price: kop(it.price, `Стоимость «${it.title}»`),
      status: ITERATION_STATUSES.includes(it.status) ? it.status : 'planned',
      date: DATE_RE.test(it.date || '') ? it.date : null,
      notes: String(it.notes || '').slice(0, 5000),
      shares,
      sort,
    });
  }

  (json.operations || []).forEach((o, i) => {
    const where = `Операция №${i + 1} (${o?.date || 'без даты'}, ${o?.amount ?? '?'} ₽)`;
    try {
      const op = buildOperation({
        ...o,
        project_id: pid(o.project, where),
        member_id: mid(o.member, where),
        from_member_id: mid(o.from_member, where),
      }, json.created_by || 'import');
      const { created_ms: _c, ...rest } = op;
      add('operations', rest);
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
    }
  });

  const count = (col) => docs.filter((d) => d.col === col).length;
  return {
    errors,
    warnings,
    docs,
    counts: { members: count('members'), projects: count('projects'), iterations: count('iterations'), operations: count('operations') },
  };
}

// Записывает план в Firestore пачками. Ссылки tmp-id заменяются на настоящие id документов.
export async function runImport(plan, createdBy) {
  const real = new Map(plan.docs.map((d) => [d.id, doc(collection(db, d.col)).id]));
  const fix = (v) => (typeof v === 'string' && real.has(v) ? real.get(v) : v);
  const resolve = (data) => {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'member_ids') out[k] = v.map(fix);
      else if (k === 'shares') out[k] = Object.fromEntries(Object.entries(v).map(([mk, amount]) => [fix(mk), amount]));
      else out[k] = fix(v);
    }
    if (out.created_by === 'import' && createdBy) out.created_by = createdBy;
    return out;
  };
  for (let i = 0; i < plan.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of plan.docs.slice(i, i + 400)) batch.set(doc(db, d.col, real.get(d.id)), resolve(d.data));
    await batch.commit();
  }
}
