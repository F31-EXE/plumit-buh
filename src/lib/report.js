// Отчёт за период и выгрузка в Excel. Входные данные — документы Firestore (суммы в копейках).
import { projectSummary } from './finance.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const R = (k) => Math.round(k) / 100;

export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (out.length > 600) break;
  }
  return out;
}

// Месяцы, в которых есть хоть одна операция (для выбора периода «всё время»)
export function dataMonthRange(data) {
  const months = data.operations.map((o) => o.date.slice(0, 7)).sort();
  return months.length ? [months[0], months.at(-1)] : null;
}

const empty = () => ({ income: 0, payouts: 0, expenses: 0, taxes: 0 });
function addOp(row, o) {
  if (o.type === 'income') row.income += o.amount;
  else if (o.type === 'payout') row.payouts += o.amount;
  else if (o.type === 'expense') row.expenses += o.amount;
  else if (o.type === 'tax') row.taxes += o.amount;
}
const finish = (row) => ({
  income: R(row.income), payouts: R(row.payouts), expenses: R(row.expenses), taxes: R(row.taxes),
  outflow: R(row.payouts + row.expenses + row.taxes),
  profit: R(row.income - row.payouts - row.expenses - row.taxes),
});

// Денежный отчёт за период: поступления, выплаты, расходы, налоги и прибыль (поступления − всё остальное)
export function buildReport(data, { from, to, projectId = null }) {
  const inPeriod = (o) => o.date.slice(0, 7) >= from && o.date.slice(0, 7) <= to && (!projectId || o.project_id === projectId);
  const ops = data.operations.filter(inPeriod);
  const months = monthsBetween(from, to);

  const byMonth = new Map(months.map((m) => [m, empty()]));
  const byProject = new Map();
  const byCategory = new Map();
  const byPerson = new Map();
  const total = empty();
  for (const o of ops) {
    addOp(total, o);
    addOp(byMonth.get(o.date.slice(0, 7)), o);
    const pk = o.project_id || '';
    if (!byProject.has(pk)) byProject.set(pk, empty());
    addOp(byProject.get(pk), o);
    if (o.type === 'expense' || o.type === 'tax') {
      const key = `${o.type}:${o.category || ''}`;
      byCategory.set(key, (byCategory.get(key) || 0) + o.amount);
    }
    if ((o.type === 'payout' || o.type === 'penalty') && o.member_id) {
      const p = byPerson.get(o.member_id) || { paid: 0, penalties: 0 };
      if (o.type === 'payout') p.paid += o.amount; else p.penalties += o.amount;
      byPerson.set(o.member_id, p);
    }
  }

  const projectName = (id) => (id ? data.projects.find((p) => p.id === id)?.name || 'Удалённый проект' : 'Без проекта (общие)');
  const memberName = (id) => data.members.find((m) => m.id === id)?.name || 'Удалённый участник';
  return {
    from, to, projectId, months,
    total: finish(total),
    byMonth: months.map((m) => ({ month: m, ...finish(byMonth.get(m)) })),
    byProject: [...byProject].map(([id, row]) => ({ project_id: id || null, name: projectName(id), ...finish(row) }))
      .filter((r) => r.income || r.outflow) // переводы между людьми в денежный отчёт не входят
      .sort((a, b) => b.income - a.income || a.name.localeCompare(b.name)),
    byCategory: [...byCategory].map(([key, amount]) => {
      const [type, category] = key.split(/:(.*)/s);
      return { type, category: category || (type === 'tax' ? 'Налоги и взносы' : 'Прочее'), amount: R(amount) };
    }).sort((a, b) => b.amount - a.amount),
    byPerson: [...byPerson].map(([id, p]) => ({ member_id: id, name: memberName(id), paid: R(p.paid), penalties: R(p.penalties) }))
      .sort((a, b) => b.paid - a.paid),
    operationsCount: ops.length,
  };
}

// ---------------- Excel ----------------
const TYPE_LABELS = { income: 'Поступление', payout: 'Выплата', expense: 'Расход', tax: 'Налоги/взносы', penalty: 'Штраф', transfer: 'Перевод' };
const STATUS = { planned: 'В плане', in_work: 'В работе', done: 'Сдано', cancelled: 'Отменено', active: 'В работе', paused: 'На паузе' };
const GRAY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEBF3' } };
const ACCENT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6DEFF' } };
const THIN = { style: 'thin', color: { argb: 'FFD9D5E3' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const sheetName = (name, used) => {
  let base = String(name).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Проект';
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 26)} ${i}`;
  used.add(n.toLowerCase());
  return n;
};
const daysIn = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function moneyCell(cell, rub) {
  cell.value = rub;
  cell.numFmt = Number.isInteger(rub) ? '#,##0' : '#,##0.00';
}
function header(row, fill = GRAY) {
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = fill; c.border = BORDER; });
}
function title(ws, text, size = 13) {
  const r = ws.addRow([text]);
  r.font = { bold: true, size };
  return r;
}

// Табличка с колонками сумм и строкой «Итого» с формулами SUM
function moneyTable(ws, columns, rows, { totalLabel = 'Итого' } = {}) {
  header(ws.addRow(columns.map((c) => c.label)));
  const first = ws.rowCount + 1;
  for (const r of rows) {
    const row = ws.addRow(columns.map((c) => (c.money ? null : r[c.key])));
    columns.forEach((c, i) => { if (c.money) moneyCell(row.getCell(i + 1), r[c.key]); row.getCell(i + 1).border = BORDER; });
  }
  if (totalLabel && rows.length) {
    const last = ws.rowCount;
    const row = ws.addRow(columns.map((c, i) => (i === 0 ? totalLabel : null)));
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.money) {
        const L = colLetter(i + 1);
        const sum = rows.reduce((a, r) => a + r[c.key], 0);
        cell.value = { formula: `SUM(${L}${first}:${L}${last})`, result: Math.round(sum * 100) / 100 };
        cell.numFmt = '#,##0.##';
      }
      cell.border = BORDER;
    });
    header(row, ACCENT);
  }
  ws.addRow([]);
}

const CASH_COLUMNS = [
  { key: 'income', label: 'Поступления', money: true },
  { key: 'payouts', label: 'Выплаты команде', money: true },
  { key: 'expenses', label: 'Расходы', money: true },
  { key: 'taxes', label: 'Налоги / взносы', money: true },
  { key: 'profit', label: 'Прибыль', money: true },
];

function summarySheet(wb, data, report) {
  const ws = wb.addWorksheet('Сводка', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, ...Array(6).fill({ width: 18 })];
  title(ws, 'Plumit · Бухгалтерия — отчёт', 15);
  const period = report.from === report.to ? monthName(report.from) : `${monthName(report.from)} — ${monthName(report.to)}`;
  ws.addRow([`Период: ${period}${report.projectId ? ` · проект «${data.projects.find((p) => p.id === report.projectId)?.name}»` : ''}`]);
  ws.addRow([`Сформирован: ${new Date().toLocaleString('ru-RU')}`]).font = { color: { argb: 'FF8D899A' } };
  ws.addRow([]);

  title(ws, 'По месяцам');
  moneyTable(ws, [{ key: 'name', label: 'Месяц' }, ...CASH_COLUMNS], report.byMonth.map((m) => ({ ...m, name: monthName(m.month) })));
  title(ws, 'По проектам');
  moneyTable(ws, [{ key: 'name', label: 'Проект' }, ...CASH_COLUMNS], report.byProject);
  if (report.byCategory.length) {
    title(ws, 'Расходы и налоги по статьям');
    moneyTable(ws, [{ key: 'name', label: 'Статья' }, { key: 'amount', label: 'Сумма', money: true }],
      report.byCategory.map((c) => ({ ...c, name: `${c.category}${c.type === 'tax' ? ' (налоги)' : ''}` })));
  }
  if (report.byPerson.length) {
    title(ws, 'Выплаты по людям');
    moneyTable(ws, [{ key: 'name', label: 'Участник' }, { key: 'paid', label: 'Выплачено', money: true }, { key: 'penalties', label: 'Штрафы', money: true }], report.byPerson);
  }
}

// Лист проекта «как в Excel»: сводка выплат, итерации с долями, помесячные сетки по дням, журнал
function projectSheet(wb, data, project, report, used) {
  const ws = wb.addWorksheet(sheetName(project.name, used), { views: [{ showGridLines: false }] });
  const s = projectSummary(data, project);
  const memberIds = [...new Set([...(project.member_ids || []), ...s.team.map((t) => t.member_id)])];
  const members = memberIds.map((id) => data.members.find((m) => m.id === id)).filter(Boolean);
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
  for (let c = 3; c <= 33; c++) ws.getColumn(c).width = 11;

  title(ws, project.name, 15);
  ws.addRow([[project.client, STATUS[project.status]].filter(Boolean).join(' · ')]);
  ws.addRow([]);

  title(ws, 'Общие подсчёты выплат');
  moneyTable(ws, [
    { key: 'name', label: 'Сотрудник' },
    { key: 'accrued', label: 'Стоимость работ', money: true },
    { key: 'penalties', label: 'Штрафы', money: true },
    { key: 'paid', label: 'Выплачено всего', money: true },
    { key: 'due', label: 'Осталось выплатить', money: true },
  ], s.team.map((t) => ({ ...t, name: `${t.name}${t.role ? ` (${t.role})` : ''}` })), { totalLabel: 'Всего на команду' });
  for (const [label, v] of [['Стоимость проекта', s.budget], ['Получено от клиента', s.income], ['Осталось получить', s.receivable],
    ['Расходы', s.expenses], ['Налоги / взносы', s.taxes], ['Чистые (план)', s.profitPlan]]) {
    const r = ws.addRow([label]);
    moneyCell(r.getCell(2), v);
    r.getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  const iterations = data.iterations.filter((it) => it.project_id === project.id).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  if (iterations.length) {
    title(ws, 'Итерации');
    moneyTable(ws, [
      { key: 'title', label: 'Итерация' },
      { key: 'price', label: 'Стоимость', money: true },
      ...members.map((m) => ({ key: m.id, label: m.name, money: true })),
      { key: 'status', label: 'Статус' },
    ], iterations.map((it) => ({
      title: it.title, price: R(it.price || 0), status: STATUS[it.status] || it.status,
      ...Object.fromEntries(members.map((m) => [m.id, R(it.shares?.[m.id] || 0)])),
    })));
  }

  // Помесячные сетки по дням — только месяцы периода, где по проекту были операции
  const ops = data.operations.filter((o) => o.project_id === project.id);
  for (const ym of report.months) {
    const monthOps = ops.filter((o) => o.date.startsWith(ym));
    if (!monthOps.length) continue;
    const days = daysIn(ym);
    title(ws, monthName(ym));
    header(ws.addRow(['Число', 'ВСЕГО', ...Array.from({ length: days }, (_, i) => i + 1)]));
    const line = (label, match, section = false) => {
      const values = Array(days).fill(0);
      for (const o of monthOps) if (match(o)) values[Number(o.date.slice(8, 10)) - 1] += o.amount;
      const row = ws.addRow([label, null, ...values.map((v) => (v ? R(v) : null))]);
      const r = row.number;
      const sum = values.reduce((a, v) => a + v, 0);
      row.getCell(2).value = { formula: `SUM(C${r}:${colLetter(days + 2)}${r})`, result: R(sum) };
      row.getCell(2).numFmt = '#,##0.##';
      row.getCell(2).font = { bold: true };
      for (let c = 3; c <= days + 2; c++) if (row.getCell(c).value) row.getCell(c).numFmt = '#,##0.##';
      row.eachCell({ includeEmpty: true }, (cell) => { cell.border = BORDER; });
      if (section) header(row);
    };
    const sectionRow = (text) => { const r = ws.addRow([text]); r.font = { bold: true, color: { argb: 'FF5C5869' } }; r.getCell(1).fill = GRAY; };
    sectionRow('ПОСТУПЛЕНИЯ');
    line('Поступления', (o) => o.type === 'income');
    sectionRow('ПЛАТЕЖИ');
    for (const m of members) line(`${m.name}${m.role ? ` (${m.role})` : ''}`, (o) => o.type === 'payout' && o.member_id === m.id);
    line('Расходы', (o) => o.type === 'expense');
    line('Налоги / взносы', (o) => o.type === 'tax');
    ws.addRow([]);
  }

  // Журнал операций за период
  const journal = ops.filter((o) => report.months.includes(o.date.slice(0, 7)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created_ms || 0) - (b.created_ms || 0)));
  if (journal.length) {
    title(ws, 'Журнал операций');
    const name = (id) => data.members.find((m) => m.id === id)?.name || '';
    header(ws.addRow(['Дата', 'Тип', 'Сумма', 'Кому', 'От кого', 'Статья', 'Комментарий']));
    for (const o of journal) {
      const [y, m, d] = o.date.split('-');
      const row = ws.addRow([`${d}.${m}.${y}`, TYPE_LABELS[o.type], null, name(o.member_id), name(o.from_member_id), o.category || '', o.comment || '']);
      moneyCell(row.getCell(3), R(o.amount));
    }
  }
}

// Собирает книгу Excel. ExcelJS передаётся снаружи: в браузере он загружается только при выгрузке.
export function buildWorkbook(ExcelJS, data, report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plumit · Бухгалтерия';
  wb.created = new Date();
  summarySheet(wb, data, report);
  const used = new Set(['сводка']);
  const projects = report.projectId ? data.projects.filter((p) => p.id === report.projectId)
    : [...data.projects].sort((a, b) => (a.created_ms || 0) - (b.created_ms || 0));
  for (const p of projects) projectSheet(wb, data, p, report, used);
  return wb;
}
