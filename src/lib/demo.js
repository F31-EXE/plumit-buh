// Вымышленные демо-данные, чтобы посмотреть приложение в работе. Загружаются в пустую базу из «Настроек».
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';

export async function loadDemo(email) {
  const batch = writeBatch(db);
  const now = Date.now();
  let seq = 0;
  const put = (name, data) => {
    const ref = doc(collection(db, name));
    batch.set(ref, { ...data, created_ms: now + seq++ });
    return ref.id;
  };
  const k = (rub) => rub * 100;

  const m = {};
  for (const [key, name, role] of [
    ['pm1', 'Анна', 'PM'], ['pm2', 'Олег', 'PM'], ['fe', 'Кирилл', 'Frontend'],
    ['be', 'Денис', 'Backend'], ['mob', 'Вера', 'Mobile'], ['fe2', 'Пётр', 'Frontend'],
  ]) m[key] = put('members', { name, role, active: true });

  const project = (name, client, budget, team, items) => {
    const pid = put('projects', { name, client, budget: k(budget), status: 'active', start_date: '2026-03-01', notes: '', member_ids: team.map((t) => m[t]) });
    items.forEach(([title, price, status, shares], i) => put('iterations', {
      project_id: pid, title, price: k(price), status, date: null, notes: '', sort: i + 1,
      shares: Object.fromEntries(Object.entries(shares).map(([t, v]) => [m[t], k(v)])),
    }));
    return pid;
  };
  const op = (project_id, date, type, amount, extra = {}) => put('operations', {
    project_id, date, type, amount: k(amount), member_id: null, from_member_id: null,
    category: '', comment: '', is_advance: false, created_by: email, ...extra,
  });

  const s1 = { mob: 9000, be: 9000, fe: 9000, pm1: 15000, pm2: 15000 };
  const p1 = project('Маркетплейс «Ягода»', 'ООО «Ягода»', 600000, ['pm1', 'pm2', 'fe', 'be', 'mob'], [
    ['1. Модерация контента администратором', 60000, 'done', s1],
    ['2. Жалобы и уведомления администраторов', 65000, 'done', s1],
    ['3. Скрытие контента после жалобы', 65000, 'done', s1],
    ['4. Блокировка пользователя', 65000, 'done', s1],
    ['5. Аватары пользователей', 45000, 'in_work', s1],
    ['6. Удаление и редактирование сообщений', 90000, 'in_work', s1],
    ['7. Колокольчик уведомлений', 0, 'planned', {}],
    ['8. База данных отраслей', 100000, 'planned', s1],
    ['9. Мультиязычность', 30000, 'planned', s1],
    ['Аванс (доля PM)', 0, 'done', { pm1: 60000, pm2: 60000 }],
  ]);
  op(p1, '2026-03-20', 'income', 150000, { is_advance: true, comment: 'Аванс по договору' });
  op(p1, '2026-06-22', 'income', 160000, { comment: 'Оплата этапа 1' });
  op(p1, '2026-07-16', 'income', 260000, { comment: 'Оплата этапа 2' });
  op(p1, '2026-06-11', 'payout', 20000, { member_id: m.fe, comment: 'С авансовых денег' });
  for (const [t, amt] of [['pm2', 30000], ['fe', 16000], ['mob', 36000], ['be', 36000]]) op(p1, '2026-06-22', 'payout', amt, { member_id: m[t] });
  op(p1, '2026-07-17', 'payout', 95000, { member_id: m.pm1, comment: 'За июль' });
  op(p1, '2026-07-17', 'payout', 95000, { member_id: m.pm2, comment: 'За июль' });
  op(p1, '2026-06-30', 'expense', 1900, { category: 'Банк', comment: 'Обслуживание счёта' });
  op(p1, '2026-06-30', 'expense', 3500, { category: 'Сервера' });
  op(p1, '2026-07-01', 'tax', 16500, { category: 'Взносы' });
  op(p1, '2026-03-20', 'transfer', 90000, { member_id: m.pm2, from_member_id: m.pm1, comment: 'Передал долю с аванса' });

  const s2 = { be: 6000, fe2: 6000, pm1: 2000, pm2: 2000 };
  const p2 = project('Платформа опросов', 'АО «Индекс»', 170000, ['pm1', 'pm2', 'fe2', 'be'], [
    ['1. Ограничение отображения статистики', 0, 'done', s2],
    ['2. Удаление данных', 30000, 'done', s2],
    ['3. Варианты ответов в вопросах', 0, 'done', s2],
    ['4. Выбор всех вопросов в шаблоне', 25000, 'done', s2],
    ['5. Разделы с сортировкой вопросов', 20000, 'in_work', s2],
    ['6. График уровня зрелости', 25000, 'in_work', s2],
    ['7. Сохранение ответов', 10000, 'planned', s2],
    ['Аванс (доля PM)', 0, 'done', { pm1: 30000, pm2: 30000 }],
  ]);
  op(p2, '2026-03-20', 'income', 60000, { is_advance: true, comment: 'Аванс' });
  op(p2, '2026-05-10', 'income', 110000, { comment: 'Оплата' });
  op(p2, '2026-05-12', 'payout', 32000, { member_id: m.fe2 });
  op(p2, '2026-05-12', 'payout', 42000, { member_id: m.be });
  op(p2, '2026-05-31', 'expense', 950, { category: 'Банк', comment: 'За май' });
  op(p2, '2026-05-20', 'penalty', 10000, { member_id: m.fe2, comment: 'Срыв срока' });

  await batch.commit();
}
