// Демо-данные (вымышленные) — чтобы посмотреть приложение в работе.
// Запуск: npm run seed  (только в пустую базу)
import { openDb, tx, toKop } from './db.js';
import { ensureAdmin } from './auth.js';

const db = openDb();
ensureAdmin(db);

if (db.prepare('SELECT COUNT(*) AS n FROM projects').get().n > 0) {
  console.log('В базе уже есть проекты — демо-данные не добавлены.');
  process.exit(0);
}

tx(db, () => {
  const member = db.prepare('INSERT INTO members (name, role) VALUES (?, ?)');
  const m = {};
  for (const [key, name, role] of [
    ['pm1', 'Анна', 'PM'], ['pm2', 'Олег', 'PM'], ['fe', 'Кирилл', 'Frontend'],
    ['be', 'Денис', 'Backend'], ['mob', 'Вера', 'Mobile'], ['fe2', 'Пётр', 'Frontend'],
  ]) m[key] = Number(member.run(name, role).lastInsertRowid);

  const project = db.prepare('INSERT INTO projects (name, client, budget, status, start_date) VALUES (?, ?, ?, ?, ?)');
  const pm = db.prepare('INSERT INTO project_members (project_id, member_id) VALUES (?, ?)');
  const iteration = db.prepare('INSERT INTO iterations (project_id, title, price, status, sort) VALUES (?, ?, ?, ?, ?)');
  const share = db.prepare('INSERT INTO iteration_shares (iteration_id, member_id, amount) VALUES (?, ?, ?)');
  const op = db.prepare(`INSERT INTO operations (project_id, date, type, amount, member_id, from_member_id, category, comment, is_advance)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  function addProject(name, client, budget, start, team, items) {
    const pid = Number(project.run(name, client, toKop(budget), 'active', start).lastInsertRowid);
    for (const id of Object.values(team)) pm.run(pid, id);
    items.forEach(([title, price, status, shares], i) => {
      const iid = Number(iteration.run(pid, title, toKop(price), status, i + 1).lastInsertRowid);
      for (const [key, amount] of Object.entries(shares)) if (amount) share.run(iid, m[key], toKop(amount));
    });
    return pid;
  }

  const s1 = { mob: 9000, be: 9000, fe: 9000, pm1: 15000, pm2: 15000 };
  const p1 = addProject('Маркетплейс «Ягода»', 'ООО «Ягода»', 600000, '2026-03-01', { a: m.pm1, b: m.pm2, c: m.fe, d: m.be, e: m.mob }, [
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
  op.run(p1, '2026-03-20', 'income', toKop(150000), null, null, '', 'Аванс по договору', 1);
  op.run(p1, '2026-06-22', 'income', toKop(160000), null, null, '', 'Оплата этапа 1', 0);
  op.run(p1, '2026-07-16', 'income', toKop(260000), null, null, '', 'Оплата этапа 2', 0);
  op.run(p1, '2026-06-11', 'payout', toKop(20000), m.fe, null, '', 'С авансовых денег', 0);
  for (const [k, amt] of [['pm2', 30000], ['fe', 16000], ['mob', 36000], ['be', 36000]]) {
    op.run(p1, '2026-06-22', 'payout', toKop(amt), m[k], null, '', '', 0);
  }
  op.run(p1, '2026-07-17', 'payout', toKop(95000), m.pm1, null, '', 'За июль', 0);
  op.run(p1, '2026-07-17', 'payout', toKop(95000), m.pm2, null, '', 'За июль', 0);
  op.run(p1, '2026-06-30', 'expense', toKop(1900), null, null, 'Банк', 'Обслуживание счёта', 0);
  op.run(p1, '2026-06-30', 'expense', toKop(3500), null, null, 'Сервера', '', 0);
  op.run(p1, '2026-07-01', 'tax', toKop(16500), null, null, 'Взносы', '', 0);
  op.run(p1, '2026-03-20', 'transfer', toKop(90000), m.pm2, m.pm1, '', 'Передал долю с аванса', 0);

  const s2 = { be: 6000, fe2: 6000, pm1: 2000, pm2: 2000 };
  const p2 = addProject('Платформа опросов', 'АО «Индекс»', 170000, '2026-03-01', { a: m.pm1, b: m.pm2, c: m.fe2, d: m.be }, [
    ['1. Ограничение отображения статистики', 0, 'done', s2],
    ['2. Удаление данных', 30000, 'done', s2],
    ['3. Варианты ответов в вопросах', 0, 'done', s2],
    ['4. Выбор всех вопросов в шаблоне', 25000, 'done', s2],
    ['5. Разделы с сортировкой вопросов', 20000, 'in_work', s2],
    ['6. График уровня зрелости', 25000, 'in_work', s2],
    ['7. Сохранение ответов', 10000, 'planned', s2],
    ['Аванс (доля PM)', 0, 'done', { pm1: 30000, pm2: 30000 }],
  ]);
  op.run(p2, '2026-03-20', 'income', toKop(60000), null, null, '', 'Аванс', 1);
  op.run(p2, '2026-05-10', 'income', toKop(110000), null, null, '', 'Оплата', 0);
  op.run(p2, '2026-05-12', 'payout', toKop(32000), m.fe2, null, '', '', 0);
  op.run(p2, '2026-05-12', 'payout', toKop(42000), m.be, null, '', '', 0);
  op.run(p2, '2026-05-31', 'expense', toKop(950), null, null, 'Банк', 'За май', 0);
  op.run(p2, '2026-05-20', 'penalty', toKop(10000), m.fe2, null, '', 'Срыв срока', 0);
});

console.log('Демо-данные добавлены.');
