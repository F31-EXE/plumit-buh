import { toRub } from './db.js';

const OUTFLOW = ['payout', 'expense', 'tax'];

function sumsByType(db, where, params) {
  const rows = db.prepare(
    `SELECT type, SUM(amount) AS total, SUM(CASE WHEN is_advance = 1 THEN amount ELSE 0 END) AS advance
     FROM operations WHERE ${where} GROUP BY type`,
  ).all(...params);
  const out = { income: 0, advance: 0, payout: 0, expense: 0, tax: 0, penalty: 0, transfer: 0 };
  for (const r of rows) {
    out[r.type] = r.total;
    if (r.type === 'income') out.advance = r.advance;
  }
  return out;
}

function flow(s) {
  return {
    income: toRub(s.income),
    advance: toRub(s.advance),
    payouts: toRub(s.payout),
    expenses: toRub(s.expense),
    taxes: toRub(s.tax),
    cash: toRub(s.income - s.payout - s.expense - s.tax),
  };
}

// Баланс по каждому участнику: начислено по итерациям − штрафы − выплачено.
export function teamBalances(db, projectId = null) {
  const pFilter = projectId == null ? '' : 'AND i.project_id = ?';
  const oFilter = projectId == null ? '' : 'AND o.project_id = ?';
  const pArgs = projectId == null ? [] : [projectId];

  const accrued = new Map(db.prepare(
    `SELECT s.member_id, SUM(s.amount) AS total FROM iteration_shares s
     JOIN iterations i ON i.id = s.iteration_id
     WHERE i.status != 'cancelled' ${pFilter} GROUP BY s.member_id`,
  ).all(...pArgs).map((r) => [r.member_id, r.total]));

  const ops = db.prepare(
    `SELECT o.member_id, o.type, SUM(o.amount) AS total FROM operations o
     WHERE o.type IN ('payout', 'penalty') AND o.member_id IS NOT NULL ${oFilter}
     GROUP BY o.member_id, o.type`,
  ).all(...pArgs);
  const paid = new Map();
  const penalties = new Map();
  for (const r of ops) (r.type === 'payout' ? paid : penalties).set(r.member_id, r.total);

  const ids = new Set([...accrued.keys(), ...paid.keys(), ...penalties.keys()]);
  if (projectId != null) {
    for (const r of db.prepare('SELECT member_id FROM project_members WHERE project_id = ?').all(projectId)) ids.add(r.member_id);
  }
  if (ids.size === 0) return [];

  const members = db.prepare(
    `SELECT id, name, role FROM members WHERE id IN (${[...ids].map(() => '?').join(',')}) ORDER BY id`,
  ).all(...ids);

  return members.map((m) => {
    const a = accrued.get(m.id) || 0;
    const pen = penalties.get(m.id) || 0;
    const p = paid.get(m.id) || 0;
    return {
      member_id: m.id,
      name: m.name,
      role: m.role,
      accrued: toRub(a),
      penalties: toRub(pen),
      paid: toRub(p),
      due: toRub(a - pen - p),
    };
  });
}

export function projectSummary(db, projectId) {
  const project = db.prepare('SELECT budget FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const s = sumsByType(db, 'project_id = ?', [projectId]);
  const it = db.prepare(
    `SELECT COALESCE(SUM(price), 0) AS total,
            COALESCE(SUM(CASE WHEN status = 'done' THEN price ELSE 0 END), 0) AS done
     FROM iterations WHERE project_id = ? AND status != 'cancelled'`,
  ).get(projectId);
  const team = teamBalances(db, projectId);
  const teamNet = team.reduce((acc, m) => acc + m.accrued - m.penalties, 0);
  const teamDue = team.reduce((acc, m) => acc + m.due, 0);
  const f = flow(s);
  const budget = toRub(project.budget);
  return {
    ...f,
    budget,
    iterationsTotal: toRub(it.total),
    iterationsDone: toRub(it.done),
    receivable: budget - f.income,
    teamAccrued: teamNet,
    teamDue,
    // «Чистые»: стоимость проекта за вычетом начисленного команде, расходов и налогов
    profitPlan: budget - teamNet - f.expenses - f.taxes,
    team,
  };
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

export function dashboard(db, month) {
  const [from, to] = monthBounds(month);
  const total = flow(sumsByType(db, '1 = 1', []));
  const monthFlow = flow(sumsByType(db, 'date >= ? AND date < ?', [from, to]));

  const projects = db.prepare(`SELECT id, name, client, status FROM projects ORDER BY status = 'done', id DESC`).all()
    .map((p) => {
      const s = projectSummary(db, p.id);
      return { ...p, budget: s.budget, income: s.income, cash: s.cash, receivable: s.receivable, teamDue: s.teamDue, profitPlan: s.profitPlan };
    });

  // 12 месяцев, заканчивая выбранным
  const series = [];
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    series.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  const byMonth = new Map(db.prepare(
    `SELECT substr(date, 1, 7) AS ym,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN type IN (${OUTFLOW.map(() => '?').join(',')}) THEN amount ELSE 0 END) AS outflow
     FROM operations WHERE substr(date, 1, 7) BETWEEN ? AND ? GROUP BY ym`,
  ).all(...OUTFLOW, series[0], series[11]).map((r) => [r.ym, r]));

  return {
    month,
    total,
    monthFlow,
    teamDue: teamBalances(db).filter((m) => m.due !== 0),
    projects,
    series: series.map((ym) => ({ month: ym, income: toRub(byMonth.get(ym)?.income), outflow: toRub(byMonth.get(ym)?.outflow) })),
  };
}
