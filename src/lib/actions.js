// Все записи в Firestore. Проверки здесь дают понятные сообщения; окончательно данные проверяют правила firestore.rules.
import {
  collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { emailKey } from './util.js';

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
    || data.iterations.some((it) => (it.shares?.[id] || 0) > 0)
    || data.documents.some((d) => d.member_id === id);
  if (used) fail('У участника есть начисления, операции или документы — его можно только сделать неактивным');
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
export function grantAccess(email, role, name, memberId) {
  const key = emailKey(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) fail('Введите корректный email');
  const r = ['admin', 'viewer', 'employee'].includes(role) ? role : 'viewer';
  const data = { role: r, name: str(name, 100), added_ms: Date.now() };
  if (r === 'employee') {
    if (!memberId) fail('Выберите, какой участник команды — этот сотрудник');
    data.member_id = String(memberId);
  }
  fire(setDoc(doc(db, 'access', key), data));
}
export const revokeAccess = (email) => { fire(deleteDoc(doc(db, 'access', emailKey(email)))); };

// ---------- Документы сотрудников (ссылки на файлы) ----------
export const DOC_KINDS = { contract: 'Договор', act: 'Акт', nda: 'NDA', invoice: 'Счёт', other: 'Другое' };
export function saveDocument(id, f) {
  const title = str(f.title, 300);
  if (!title) fail('Укажите название документа');
  const url = str(f.url, 2000);
  if (!/^https:\/\/\S+$/.test(url)) fail('Ссылка должна начинаться с https:// — например, на Google Диск или Яндекс Диск');
  if (!ref(f.member_id)) fail('Выберите сотрудника');
  const data = {
    member_id: String(f.member_id),
    title,
    kind: DOC_KINDS[f.kind] ? f.kind : 'other',
    url,
    date: optDate(f.date),
    notes: str(f.notes, 2000),
  };
  fire(id ? updateDoc(doc(db, 'documents', id), data) : setDoc(newRef('documents'), { ...data, created_ms: Date.now() }));
}
export const deleteDocument = (id) => { fire(deleteDoc(doc(db, 'documents', id))); };

// ---------- Накопительные счета ----------
export const CAPITALIZATION = { monthly: 'Ежемесячная', daily: 'Ежедневная', none: 'Без капитализации' };
function rateValue(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) fail('Ставка — число от 0 до 100 (% годовых)');
  return Math.round(n * 100) / 100;
}
export function saveAccount(id, f) {
  const name = str(f.name, 200);
  if (!name) fail('Укажите название счёта');
  const data = {
    name,
    bank: str(f.bank, 200),
    rate: rateValue(f.rate),
    capitalization: CAPITALIZATION[f.capitalization] ? f.capitalization : 'monthly',
    opened: optDate(f.opened),
    notes: str(f.notes, 2000),
    archived: !!f.archived,
  };
  if (id) { fire(updateDoc(doc(db, 'accounts', id), data)); return id; }
  const r = newRef('accounts');
  fire(setDoc(r, { ...data, created_ms: Date.now() }));
  return r.id;
}
export async function deleteAccount(id) {
  const snap = await getDocs(query(collection(db, 'account_ops'), where('account_id', '==', id)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'accounts', id));
}

export const ACCOUNT_OPS = { deposit: 'Пополнение', withdraw: 'Снятие', interest: 'Проценты от банка', rate: 'Новая ставка' };
export function saveAccountOp(id, f) {
  if (!ACCOUNT_OPS[f.type]) fail('Выберите тип');
  if (!DATE_RE.test(f.date || '')) fail('Укажите дату');
  const data = { account_id: String(f.account_id), type: f.type, date: f.date, comment: str(f.comment, 1000) };
  if (f.type === 'rate') data.rate = rateValue(f.rate);
  else {
    data.amount = kop(f.amount);
    if (data.amount <= 0) fail('Сумма должна быть больше нуля');
  }
  fire(id ? setDoc(doc(db, 'account_ops', id), { ...data, created_ms: f.created_ms || Date.now() })
    : setDoc(newRef('account_ops'), { ...data, created_ms: Date.now() }));
}
export const deleteAccountOp = (id) => { fire(deleteDoc(doc(db, 'account_ops', id))); };

// ---------- Выписки сотрудников ----------
// Канонический JSON (ключи по алфавиту) — чтобы сравнивать с тем, что вернул Firestore
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
// Записывает только изменившиеся выписки и удаляет выписки удалённых участников
export function writeStatements(desired, existing) {
  const batch = writeBatch(db);
  let n = 0;
  for (const [mid, st] of desired) {
    if (existing.get(mid) !== stableJson(st)) { batch.set(doc(db, 'statements', mid), st); n++; }
  }
  for (const mid of existing.keys()) {
    if (!desired.has(mid)) { batch.delete(doc(db, 'statements', mid)); n++; }
  }
  if (n) fire(batch.commit());
  return n;
}
