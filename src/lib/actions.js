// Все записи в Firestore. Проверки здесь дают понятные сообщения; окончательно данные проверяют правила firestore.rules.
import {
  collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { emailKey } from './store.jsx';

export const OP_TYPES = ['income', 'payout', 'expense', 'tax', 'penalty', 'transfer'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (msg) => { throw new Error(msg); };

// Запись уходит в фон: без сети Firestore сохранит её локально и отправит позже.
// Ошибку сервера (например, нет прав) показываем уведомлением.
function fire(promise) {
  promise.catch((error) => window.dispatchEvent(new CustomEvent('plumit:write-error', { detail: error })));
  return promise;
}
const newRef = (name) => doc(collection(db, name));
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const ref = (v) => (v ? String(v) : null);
export function kop(rub, field = 'Сумма') {
  const n = Number(rub ?? 0);
  if (!Number.isFinite(n) || n < 0) fail(`Поле «${field}» должно быть неотрицательным числом`);
  return Math.round(n * 100);
}
const optDate = (v) => {
  if (!v) return null;
  if (!DATE_RE.test(v)) fail('Дата должна быть в формате ГГГГ-ММ-ДД');
  return v;
};

// ---------- Операции ----------
export function buildOperation(f, userEmail) {
  if (!OP_TYPES.includes(f.type)) fail('Укажите тип операции');
  if (!DATE_RE.test(f.date || '')) fail('Укажите дату');
  const op = {
    type: f.type,
    date: f.date,
    amount: kop(f.amount),
    project_id: ref(f.project_id),
    member_id: ref(f.member_id),
    from_member_id: ref(f.from_member_id),
    category: str(f.category, 100),
    comment: str(f.comment, 2000),
    is_advance: f.type === 'income' && !!f.is_advance,
  };
  if (op.amount <= 0) fail('Сумма должна быть больше нуля');
  if (['payout', 'penalty', 'transfer'].includes(op.type) && !op.member_id) fail('Укажите, кому');
  if (op.type === 'transfer' && !op.from_member_id) fail('Укажите, от кого перевод');
  if (!['payout', 'penalty', 'transfer'].includes(op.type)) op.member_id = null;
  if (op.type !== 'transfer') op.from_member_id = null;
  if (['income', 'payout', 'penalty'].includes(op.type) && !op.project_id) fail('Укажите проект');
  if (userEmail !== undefined) {
    op.created_by = emailKey(userEmail);
    op.created_ms = Date.now();
  }
  return op;
}
export const addOperation = (f, email) => { fire(setDoc(newRef('operations'), buildOperation(f, email))); };
export const updateOperation = (id, f) => { fire(updateDoc(doc(db, 'operations', id), buildOperation(f))); };
export const deleteOperation = (id) => { fire(deleteDoc(doc(db, 'operations', id))); };

// ---------- Команда ----------
export function saveMember(id, f) {
  const name = str(f.name, 100);
  if (!name) fail('Укажите имя');
  const data = { name, role: str(f.role, 100), active: f.active !== false };
  fire(id ? updateDoc(doc(db, 'members', id), data) : setDoc(newRef('members'), { ...data, created_ms: Date.now() }));
}
export function deleteMember(id, data) {
  const used = data.operations.some((o) => o.member_id === id || o.from_member_id === id)
    || data.iterations.some((it) => (it.shares?.[id] || 0) > 0);
  if (used) fail('У участника есть начисления или операции — его можно только сделать неактивным');
  const batch = writeBatch(db);
  for (const p of data.projects) {
    if (p.member_ids?.includes(id)) batch.update(doc(db, 'projects', p.id), { member_ids: p.member_ids.filter((x) => x !== id) });
  }
  batch.delete(doc(db, 'members', id));
  fire(batch.commit());
}

// ---------- Проекты ----------
const PROJECT_STATUSES = ['active', 'paused', 'done'];
export function saveProject(id, f) {
  const name = str(f.name, 200);
  if (!name) fail('Укажите название проекта');
  const data = {
    name,
    client: str(f.client, 200),
    budget: kop(f.budget, 'Стоимость проекта'),
    status: PROJECT_STATUSES.includes(f.status) ? f.status : 'active',
    start_date: optDate(f.start_date),
    notes: str(f.notes, 5000),
    member_ids: [...new Set((f.members || []).map(String))],
  };
  if (id) { fire(updateDoc(doc(db, 'projects', id), data)); return id; }
  const r = newRef('projects');
  fire(setDoc(r, { ...data, created_ms: Date.now() }));
  return r.id;
}

// Удаляет проект вместе с итерациями и операциями (пачками по 400 — лимит батча 500)
export function deleteProject(id) {
  fire(deleteProjectDeep(id));
}
async function deleteProjectDeep(id) {
  const refs = [];
  for (const name of ['iterations', 'operations']) {
    const snap = await getDocs(query(collection(db, name), where('project_id', '==', id)));
    refs.push(...snap.docs.map((d) => d.ref));
  }
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'projects', id));
}

// ---------- Итерации ----------
const ITERATION_STATUSES = ['planned', 'in_work', 'done', 'cancelled'];
export function saveIteration(id, projectId, f, nextSort) {
  const title = str(f.title, 1000);
  if (!title) fail('Укажите название итерации');
  const shares = {};
  for (const [mid, amount] of Object.entries(f.shares || {})) {
    const v = kop(amount, 'Доля');
    if (v > 0) shares[mid] = v;
  }
  const data = {
    title,
    price: kop(f.price, 'Стоимость'),
    status: ITERATION_STATUSES.includes(f.status) ? f.status : 'planned',
    date: optDate(f.date),
    notes: str(f.notes, 5000),
    shares,
  };
  fire(id
    ? updateDoc(doc(db, 'iterations', id), data)
    : setDoc(newRef('iterations'), { ...data, project_id: projectId, sort: nextSort, created_ms: Date.now() }));
}
export const deleteIteration = (id) => { fire(deleteDoc(doc(db, 'iterations', id))); };

// ---------- Доступ ----------
export function grantAccess(email, role, name) {
  const key = emailKey(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) fail('Введите корректный email');
  fire(setDoc(doc(db, 'access', key), { role: role === 'admin' ? 'admin' : 'viewer', name: str(name, 100), added_ms: Date.now() }));
}
export const revokeAccess = (email) => { fire(deleteDoc(doc(db, 'access', emailKey(email)))); };
