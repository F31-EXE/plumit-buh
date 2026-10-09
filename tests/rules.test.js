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
const client = () => env.authenticatedContext('cli', { email: 'ceo@client.ru', email_verified: true }).firestore();
const stranger = () => env.authenticatedContext('s', { email: 'other@mail.ru', email_verified: true }).firestore();

const op = (extra = {}) => ({
  type: 'income', date: '2026-05-01', amount: 100000, project_id: 'p1', member_id: null, from_member_id: null,
  category: '', comment: '', is_advance: true, created_by: 'boss@plumit.ru', created_ms: 1, ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-plumit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'access/boss@plumit.ru'), { role: 'admin' });
    await setDoc(doc(db, 'access/view@plumit.ru'), { role: 'viewer' });
    await setDoc(doc(db, 'access/dev@plumit.ru'), { role: 'employee', member_id: 'm1' });
    await setDoc(doc(db, 'access/ceo@client.ru'), { role: 'client', project_ids: ['p1'] });
    await setDoc(doc(db, 'client_views/p1'), { name: 'P', budget: 100 });
    await setDoc(doc(db, 'client_views/p2'), { name: 'Чужой', budget: 100 });
    await setDoc(doc(db, 'documents/c1'), { project_id: 'p1', title: 'Договор', kind: 'contract', url: 'https://x.ru/1', date: null, notes: '' });
    await setDoc(doc(db, 'documents/c2'), { project_id: 'p2', title: 'Договор', kind: 'contract', url: 'https://x.ru/2', date: null, notes: '' });
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

// ---------- Хранилище файлов (storage.rules) ----------
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
const storageOf = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).storage();
const sAdmin = () => storageOf('admin', 'Boss@Plumit.ru');
const sViewer = () => storageOf('viewer', 'view@plumit.ru');
const sEmployee = () => storageOf('emp', 'dev@plumit.ru');
const sStranger = () => storageOf('s', 'other@mail.ru');

async function seedFiles() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('documents/m1/d1/contract.pdf').put(pdf, { contentType: 'application/pdf' });
    await ctx.storage().ref('documents/m2/d2/contract.pdf').put(pdf, { contentType: 'application/pdf' });
  });
}

test('файлы: сотрудник открывает только свои, посторонний — ничего', async () => {
  await seedFiles();
  await assertSucceeds(sEmployee().ref('documents/m1/d1/contract.pdf').getMetadata());
  await assertFails(sEmployee().ref('documents/m2/d2/contract.pdf').getMetadata());
  await assertSucceeds(sViewer().ref('documents/m2/d2/contract.pdf').getMetadata());
  await assertFails(sStranger().ref('documents/m1/d1/contract.pdf').getMetadata());
  await assertFails(env.unauthenticatedContext().storage().ref('documents/m1/d1/contract.pdf').getMetadata());
  await assertFails(sEmployee().ref('other/secret.pdf').getMetadata());
});

test('файлы: загружает и удаляет только администратор, только документы до 25 МБ', async () => {
  await seedFiles();
  await assertSucceeds(sAdmin().ref('documents/m1/d3/act.pdf').put(pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(sAdmin().ref('documents/m1/d4/scan.jpg').put(pdf, { contentType: 'image/jpeg' }));
  await assertSucceeds(sAdmin().ref('documents/m1/d5/a.docx').put(pdf, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  await assertFails(sAdmin().ref('documents/m1/d6/x.html').put(pdf, { contentType: 'text/html' }));
  await assertFails(sAdmin().ref('documents/m1/d7/x.svg').put(pdf, { contentType: 'image/svg+xml' }));
  await assertFails(sAdmin().ref('documents/m1/d8/big.pdf').put(new Uint8Array(25 * 1024 * 1024 + 1), { contentType: 'application/pdf' }));
  await assertFails(sAdmin().ref('documents/m1/d1/contract.pdf').put(pdf, { contentType: 'application/pdf' })); // перезапись запрещена
  await assertFails(sAdmin().ref('elsewhere/x.pdf').put(pdf, { contentType: 'application/pdf' }));
  await assertFails(sEmployee().ref('documents/m1/d9/my.pdf').put(pdf, { contentType: 'application/pdf' }));
  await assertFails(sViewer().ref('documents/m1/d9/my.pdf').put(pdf, { contentType: 'application/pdf' }));
  await assertFails(sEmployee().ref('documents/m1/d1/contract.pdf').delete());
  await assertSucceeds(sAdmin().ref('documents/m1/d1/contract.pdf').delete());
});

test('документ-файл в базе: путь только в папке этого сотрудника, файл не перепривязывается', async () => {
  const db = admin();
  const fileDoc = { member_id: 'm1', title: 'Скан', kind: 'act', storage_path: 'documents/m1/f1/scan.pdf', file_name: 'scan.pdf',
    size: 100, content_type: 'application/pdf', date: null, notes: '', created_ms: 1 };
  await assertSucceeds(setDoc(doc(db, 'documents/f1'), fileDoc));
  await assertFails(setDoc(doc(db, 'documents/f2'), { ...fileDoc, storage_path: 'documents/m2/f2/scan.pdf' }));
  await assertFails(setDoc(doc(db, 'documents/f3'), { ...fileDoc, url: 'https://x.ru' }));
  await assertFails(updateDoc(doc(db, 'documents/f1'), { storage_path: 'documents/m1/f9/other.pdf' }));
  await assertFails(updateDoc(doc(db, 'documents/f1'), { member_id: 'm2' }));
  await assertSucceeds(updateDoc(doc(db, 'documents/f1'), { title: 'Скан акта' }));
});

test('заказчик видит только свои проекты и их документы', async () => {
  const db = client();
  await assertSucceeds(getDoc(doc(db, 'client_views/p1')));
  await assertFails(getDoc(doc(db, 'client_views/p2')));
  await assertSucceeds(getDocs(query(collection(db, 'documents'), where('project_id', '==', 'p1'))));
  await assertFails(getDocs(query(collection(db, 'documents'), where('project_id', '==', 'p2'))));
  await assertFails(getDocs(query(collection(db, 'documents'), where('member_id', '==', 'm1'))));
  await assertFails(getDocs(collection(db, 'documents')));
  for (const c of ['operations', 'projects', 'iterations', 'members', 'statements', 'accounts', 'audit', 'client_views']) {
    await assertFails(getDocs(collection(db, c)));
  }
  await assertFails(getDoc(doc(db, 'projects/p1')));
  await assertFails(setDoc(doc(db, 'client_views/p1'), { name: 'x' }));
  await assertFails(setDoc(doc(db, 'access/ceo@client.ru'), { role: 'client', project_ids: ['p1', 'p2'] }));
  // сотрудник не видит кабинет заказчика и документы проекта
  await assertFails(getDoc(doc(employee(), 'client_views/p1')));
  await assertFails(getDocs(query(collection(employee(), 'documents'), where('project_id', '==', 'p1'))));
});

test('документы проекта и доступ заказчика: проверки администратора', async () => {
  const db = admin();
  const d = { project_id: 'p1', title: 'Акт', kind: 'act', url: 'https://x.ru/a', date: null, notes: '', created_ms: 1 };
  await assertSucceeds(setDoc(doc(db, 'documents/c3'), d));
  await assertFails(setDoc(doc(db, 'documents/c4'), { ...d, member_id: 'm1' }));            // одновременно двум владельцам нельзя
  const f = { project_id: 'p1', title: 'Скан', kind: 'act', storage_path: 'client-docs/p1/c5/a.pdf', file_name: 'a.pdf', size: 1, content_type: 'application/pdf', date: null, notes: '' };
  await assertSucceeds(setDoc(doc(db, 'documents/c5'), f));
  await assertFails(setDoc(doc(db, 'documents/c6'), { ...f, storage_path: 'client-docs/p2/c6/a.pdf' }));
  await assertFails(setDoc(doc(db, 'documents/c7'), { ...f, storage_path: 'documents/p1/c7/a.pdf' }));
  await assertFails(updateDoc(doc(db, 'documents/c3'), { project_id: 'p2' }));
  await assertFails(setDoc(doc(db, 'access/new@client.ru'), { role: 'client', name: 'X', added_ms: 1 }));
  await assertFails(setDoc(doc(db, 'access/new@client.ru'), { role: 'client', name: 'X', added_ms: 1, project_ids: [] }));
  await assertSucceeds(setDoc(doc(db, 'access/new@client.ru'), { role: 'client', name: 'X', added_ms: 1, project_ids: ['p1', 'p2'] }));
  await assertSucceeds(getDoc(doc(viewer(), 'client_views/p2')));
});

test('файлы заказчика: только папки своих проектов', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('client-docs/p1/c1/contract.pdf').put(pdf, { contentType: 'application/pdf' });
    await ctx.storage().ref('client-docs/p2/c2/contract.pdf').put(pdf, { contentType: 'application/pdf' });
    await ctx.storage().ref('documents/m1/d1/contract.pdf').put(pdf, { contentType: 'application/pdf' });
  });
  const sClient = () => storageOf('cli', 'ceo@client.ru');
  await assertSucceeds(sClient().ref('client-docs/p1/c1/contract.pdf').getMetadata());
  await assertFails(sClient().ref('client-docs/p2/c2/contract.pdf').getMetadata());
  await assertFails(sClient().ref('documents/m1/d1/contract.pdf').getMetadata());
  await assertFails(sClient().ref('client-docs/p1/c9/my.pdf').put(pdf, { contentType: 'application/pdf' }));
  await assertFails(sEmployee().ref('client-docs/p1/c1/contract.pdf').getMetadata());
  await assertSucceeds(sAdmin().ref('client-docs/p1/c8/act.pdf').put(pdf, { contentType: 'application/pdf' }));
});
