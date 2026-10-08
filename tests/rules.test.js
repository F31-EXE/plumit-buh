// Тесты правил безопасности. Запуск: npm run test:rules (поднимает эмулятор Firestore)
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

let env;
const admin = () => env.authenticatedContext('admin', { email: 'Boss@Plumit.ru', email_verified: true }).firestore();
const viewer = () => env.authenticatedContext('viewer', { email: 'view@plumit.ru', email_verified: true }).firestore();
const unverified = () => env.authenticatedContext('x', { email: 'view@plumit.ru', email_verified: false }).firestore();
const employee = () => env.authenticatedContext('emp', { email: 'dev@plumit.ru', email_verified: true }).firestore();
const stranger = () => env.authenticatedContext('s', { email: 'other@mail.ru', email_verified: true }).firestore();

const op = (extra = {}) => ({
  type: 'income', date: '2026-05-01', amount: 100000, project_id: 'p1', member_id: null, from_member_id: null,
  category: '', comment: '', is_advance: true, created_by: 'boss@plumit.ru', created_ms: 1, ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-plumit', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'access/boss@plumit.ru'), { role: 'admin' });
    await setDoc(doc(db, 'access/view@plumit.ru'), { role: 'viewer' });
    await setDoc(doc(db, 'access/dev@plumit.ru'), { role: 'employee', member_id: 'm1' });
    await setDoc(doc(db, 'statements/m1'), { name: 'Денис' });
    await setDoc(doc(db, 'statements/m2'), { name: 'Анна' });
    await setDoc(doc(db, 'documents/d1'), { member_id: 'm1', title: 'Договор', kind: 'contract', url: 'https://disk.yandex.ru/d/1', date: null, notes: '' });
    await setDoc(doc(db, 'documents/d2'), { member_id: 'm2', title: 'Договор', kind: 'contract', url: 'https://disk.yandex.ru/d/2', date: null, notes: '' });
    await setDoc(doc(db, 'accounts/a1'), { name: 'Резерв', bank: 'Точка', rate: 16, capitalization: 'monthly', opened: null, notes: '', archived: false });
    await setDoc(doc(db, 'projects/p1'), { name: 'P', client: '', budget: 0, status: 'active', start_date: null, notes: '', member_ids: [] });
    await setDoc(doc(db, 'operations/o1'), op());
  });
});

test('чтение: только пользователи из access с подтверждённой почтой', async () => {
  await assertSucceeds(getDocs(collection(admin(), 'operations')));
  await assertSucceeds(getDocs(collection(viewer(), 'operations')));
  await assertFails(getDocs(collection(stranger(), 'operations')));
  await assertFails(getDocs(collection(unverified(), 'operations')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'projects')));
});

test('запись: только администратор', async () => {
  await assertSucceeds(addDoc(collection(admin(), 'operations'), op()));
  await assertFails(addDoc(collection(viewer(), 'operations'), op({ created_by: 'view@plumit.ru' })));
  await assertFails(deleteDoc(doc(viewer(), 'operations/o1')));
  await assertSucceeds(deleteDoc(doc(admin(), 'operations/o1')));
});

test('валидация операций', async () => {
  const db = admin();
  await assertFails(addDoc(collection(db, 'operations'), op({ amount: -5 })));
  await assertFails(addDoc(collection(db, 'operations'), op({ amount: 10.5 })));
  await assertFails(addDoc(collection(db, 'operations'), op({ type: 'gift' })));
  await assertFails(addDoc(collection(db, 'operations'), op({ date: '01.05.2026' })));
  await assertFails(addDoc(collection(db, 'operations'), op({ project_id: null })));
  await assertFails(addDoc(collection(db, 'operations'), op({ type: 'payout', is_advance: false })));
  await assertFails(addDoc(collection(db, 'operations'), op({ created_by: 'someone@else.ru' })));
  await assertFails(addDoc(collection(db, 'operations'), op({ hacked: true })));
  await assertSucceeds(addDoc(collection(db, 'operations'), op({ type: 'expense', project_id: null, is_advance: false, category: 'Сервера' })));
  await assertSucceeds(addDoc(collection(db, 'operations'), op({ type: 'transfer', member_id: 'm1', from_member_id: 'm2', is_advance: false })));
  await assertSucceeds(updateDoc(doc(db, 'operations/o1'), { amount: 5000 }));
  await assertFails(updateDoc(doc(db, 'operations/o1'), { created_by: 'x@y.ru' }));
});

test('доступ: управляет только администратор и не может удалить себя', async () => {
  await assertSucceeds(getDoc(doc(viewer(), 'access/view@plumit.ru')));
  await assertFails(getDoc(doc(viewer(), 'access/boss@plumit.ru')));
  await assertFails(setDoc(doc(viewer(), 'access/view@plumit.ru'), { role: 'admin' }));
  await assertFails(setDoc(doc(stranger(), 'access/other@mail.ru'), { role: 'admin' }));
  await assertSucceeds(setDoc(doc(admin(), 'access/new@plumit.ru'), { role: 'viewer', name: 'Новый', added_ms: 1 }));
  await assertFails(setDoc(doc(admin(), 'access/new@plumit.ru'), { role: 'owner' }));
  await assertFails(deleteDoc(doc(admin(), 'access/boss@plumit.ru')));
  await assertFails(setDoc(doc(admin(), 'access/boss@plumit.ru'), { role: 'viewer' }));
});

test('итерации и проекты', async () => {
  const db = admin();
  const it = { project_id: 'p1', title: '1', price: 100, status: 'done', date: null, notes: '', shares: { m1: 50 }, sort: 1, created_ms: 1 };
  await assertSucceeds(setDoc(doc(db, 'iterations/i1'), it));
  await assertFails(updateDoc(doc(db, 'iterations/i1'), { project_id: 'p2' }));
  await assertFails(setDoc(doc(db, 'iterations/i2'), { ...it, status: 'weird' }));
  await assertFails(setDoc(doc(db, 'projects/p2'), { name: '', client: '', budget: 0, status: 'active', start_date: null, notes: '', member_ids: [] }));
  await assertSucceeds(setDoc(doc(db, 'members/m1'), { name: 'Анна', role: 'PM', active: true, created_ms: 1 }));
  await assertFails(setDoc(doc(viewer(), 'members/m2'), { name: 'X', role: '', active: true }));
});

test('сотрудник видит только свою выписку и свои документы', async () => {
  const db = employee();
  await assertSucceeds(getDoc(doc(db, 'statements/m1')));
  await assertFails(getDoc(doc(db, 'statements/m2')));
  await assertSucceeds(getDocs(query(collection(db, 'documents'), where('member_id', '==', 'm1'))));
  await assertFails(getDocs(collection(db, 'documents')));
  await assertFails(getDoc(doc(db, 'documents/d2')));
  for (const c of ['operations', 'projects', 'iterations', 'members', 'accounts', 'account_ops']) {
    await assertFails(getDocs(collection(db, c)));
  }
  await assertFails(setDoc(doc(db, 'statements/m1'), { name: 'Взлом' }));
  await assertFails(setDoc(doc(db, 'access/dev@plumit.ru'), { role: 'admin' }));
  await assertSucceeds(getDoc(doc(db, 'access/dev@plumit.ru')));
});

test('документы и выписки: пишет только администратор, данные проверяются', async () => {
  await assertSucceeds(getDocs(collection(viewer(), 'documents')));
  await assertSucceeds(getDoc(doc(viewer(), 'statements/m2')));
  await assertFails(setDoc(doc(viewer(), 'statements/m2'), { name: 'x' }));
  await assertSucceeds(setDoc(doc(admin(), 'statements/m2'), { name: 'Анна' }));
  const d = { member_id: 'm1', title: 'Акт', kind: 'act', url: 'https://drive.google.com/x', date: '2026-10-01', notes: '', created_ms: 1 };
  await assertSucceeds(setDoc(doc(admin(), 'documents/d3'), d));
  await assertFails(setDoc(doc(admin(), 'documents/d4'), { ...d, url: 'javascript:alert(1)' }));
  await assertFails(setDoc(doc(admin(), 'documents/d4'), { ...d, kind: 'secret' }));
  await assertFails(setDoc(doc(employee(), 'documents/d4'), d));
  // сотруднику доступ выдаётся только с привязкой к участнику
  await assertFails(setDoc(doc(admin(), 'access/new@plumit.ru'), { role: 'employee', name: 'X', added_ms: 1 }));
  await assertSucceeds(setDoc(doc(admin(), 'access/new@plumit.ru'), { role: 'employee', name: 'X', added_ms: 1, member_id: 'm2' }));
});

test('накопительные счета', async () => {
  const db = admin();
  await assertSucceeds(addDoc(collection(db, 'account_ops'), { account_id: 'a1', type: 'deposit', date: '2026-01-01', amount: 100, comment: '', created_ms: 1 }));
  await assertSucceeds(addDoc(collection(db, 'account_ops'), { account_id: 'a1', type: 'rate', date: '2026-02-01', rate: 15.5, comment: '', created_ms: 1 }));
  await assertFails(addDoc(collection(db, 'account_ops'), { account_id: 'a1', type: 'deposit', date: '2026-01-01', amount: 0, comment: '' }));
  await assertFails(addDoc(collection(db, 'account_ops'), { account_id: 'a1', type: 'rate', date: '2026-01-01', rate: 500, comment: '' }));
  await assertFails(setDoc(doc(db, 'accounts/a2'), { name: 'X', bank: '', rate: 16, capitalization: 'weekly', opened: null, notes: '', archived: false }));
  await assertFails(addDoc(collection(viewer(), 'account_ops'), { account_id: 'a1', type: 'deposit', date: '2026-01-01', amount: 100, comment: '' }));
  await assertSucceeds(getDocs(collection(viewer(), 'accounts')));
});

test('журнал изменений: только администратор, от своего имени, со временем сервера, без правок', async () => {
  const entry = (extra = {}) => ({ at: serverTimestamp(), at_ms: 1, user: 'boss@plumit.ru', action: 'update', entity: 'operation',
    entity_id: 'o1', label: 'Поступление', changes: [{ field: 'amount', from: 1, to: 2 }], snapshot: null, ...extra });
  const db = admin();
  // изменение и запись в журнал одним батчем
  const batch = writeBatch(db);
  batch.update(doc(db, 'operations/o1'), { amount: 200000 });
  batch.set(doc(db, 'audit/a1'), entry());
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(db, 'audit/a2'), entry({ user: 'view@plumit.ru' })));          // чужое имя
  await assertFails(setDoc(doc(db, 'audit/a3'), entry({ at: new Date('2020-01-01') })));      // своё время
  await assertFails(setDoc(doc(db, 'audit/a4'), entry({ entity: 'secret' })));
  await assertFails(setDoc(doc(viewer(), 'audit/a5'), entry({ user: 'view@plumit.ru' })));
  await assertFails(updateDoc(doc(db, 'audit/a1'), { label: 'подмена' }));
  await assertFails(deleteDoc(doc(db, 'audit/a1')));
  await assertSucceeds(getDocs(collection(viewer(), 'audit')));
  await assertFails(getDocs(collection(employee(), 'audit')));
});
