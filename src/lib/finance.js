// Все расчёты. На входе — документы Firestore (суммы в копейках), на выходе — рубли.
const R = (kop) => Number(kop || 0) / 100;
const OUTFLOW = new Set(['payout', 'expense', 'tax']);

function sums(ops) {
  const s = { income: 0, advance: 0, payout: 0, expense: 0, tax: 0, penalty: 0, transfer: 0 };
  for (const o of ops) {
    s[o.type] += o.amount || 0;
    if (o.type === 'income' && o.is_advance) s.advance += o.amount || 0;
  }
  return s;
}

function flow(s) {
  return {
    income: R(s.income),
    advance: R(s.advance),
    payouts: R(s.payout),
    expenses: R(s.expense),
    taxes: R(s.tax),
    cash: R(s.income - s.payout - s.expense - s.tax),
  };
}

// Баланс по участникам: начислено по итерациям (кроме отменённых) − штрафы − выплачено.
export function teamBalances(data, projectId = null) {
  const accrued = new Map();
  const paid = new Map();
  const penalties = new Map();
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + (v || 0));

  for (const it of data.iterations) {
    if (it.status === 'cancelled' || (projectId && it.project_id !== projectId)) continue;
    for (const [mid, amount] of Object.entries(it.shares || {})) add(accrued, mid, amount);
  }
  for (const o of data.operations) {
    if (!o.member_id || (projectId && o.project_id !== projectId)) continue;
    if (o.type === 'payout') add(paid, o.member_id, o.amount);
    else if (o.type === 'penalty') add(penalties, o.member_id, o.amount);
  }

  const ids = new Set([...accrued.keys(), ...paid.keys(), ...penalties.keys()]);
  if (projectId) for (const mid of data.projects.find((p) => p.id === projectId)?.member_ids || []) ids.add(mid);

  return data.members
    .filter((m) => ids.has(m.id))
    .sort((x, y) => (x.created_ms || 0) - (y.created_ms || 0))
    .map((m) => {
      const a = accrued.get(m.id) || 0;
      const pen = penalties.get(m.id) || 0;
      const p = paid.get(m.id) || 0;
      return { member_id: m.id, name: m.name, role: m.role, accrued: R(a), penalties: R(pen), paid: R(p), due: R(a - pen - p) };
    });
}

export function projectSummary(data, project) {
  const ops = data.operations.filter((o) => o.project_id === project.id);
  let itTotal = 0;
  let itDone = 0;
  for (const it of data.iterations) {
    if (it.project_id !== project.id || it.status === 'cancelled') continue;
    itTotal += it.price || 0;
    if (it.status === 'done') itDone += it.price || 0;
  }
  const team = teamBalances(data, project.id);
  const teamNetKop = team.reduce((a, m) => a + Math.round((m.accrued - m.penalties) * 100), 0);
  const teamDueKop = team.reduce((a, m) => a + Math.round(m.due * 100), 0);
  const s = sums(ops);
  const budget = project.budget || 0;
  return {
    ...flow(s),
    budget: R(budget),
    iterationsTotal: R(itTotal),
    iterationsDone: R(itDone),
    receivable: R(budget - s.income),
    teamAccrued: R(teamNetKop),
    teamDue: R(teamDueKop),
    // «Чистые»: стоимость проекта за вычетом начисленного команде, расходов и налогов
    profitPlan: R(budget - teamNetKop - s.expense - s.tax),
    team,
  };
}

const sortProjects = (a, b) => (a.status === 'done') - (b.status === 'done') || (b.created_ms || 0) - (a.created_ms || 0);

export function projectsWithSummary(data) {
  return [...data.projects].sort(sortProjects).map((p) => ({ ...p, budget: R(p.budget), summary: projectSummary(data, p) }));
}

export function projectView(data, id) {
  const p = data.projects.find((x) => x.id === id);
  if (!p) return null;
  const byId = new Map(data.members.map((m) => [m.id, m]));
  return {
    ...p,
    budget: R(p.budget),
    members: (p.member_ids || []).map((mid) => byId.get(mid)).filter(Boolean),
    iterations: data.iterations
      .filter((it) => it.project_id === id)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || (a.created_ms || 0) - (b.created_ms || 0))
      .map((it) => ({ ...it, price: R(it.price), shares: Object.fromEntries(Object.entries(it.shares || {}).map(([k, v]) => [k, R(v)])) })),
    summary: projectSummary(data, p),
  };
}

export function membersWithBalance(data) {
  const balances = new Map(teamBalances(data).map((b) => [b.member_id, b]));
  return [...data.members]
    .sort((a, b) => (b.active !== false) - (a.active !== false) || (a.created_ms || 0) - (b.created_ms || 0))
    .map((m) => ({ ...m, active: m.active !== false, balance: balances.get(m.id) || { accrued: 0, penalties: 0, paid: 0, due: 0 } }));
}

// Операции с подставленными названиями, по убыванию даты
export function listOperations(data, { project_id, month, type, member_id, limit } = {}) {
  const projects = new Map(data.projects.map((p) => [p.id, p.name]));
  const members = new Map(data.members.map((m) => [m.id, m.name]));
  const out = data.operations
    .filter((o) => (!project_id || o.project_id === project_id)
      && (!month || o.date.startsWith(month))
      && (!type || o.type === type)
      && (!member_id || o.member_id === member_id || o.from_member_id === member_id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_ms || 0) - (a.created_ms || 0)))
    .map((o) => ({
      ...o,
      amount: R(o.amount),
      is_advance: !!o.is_advance,
      project_name: projects.get(o.project_id) || null,
      member_name: members.get(o.member_id) || null,
      from_member_name: members.get(o.from_member_id) || null,
    }));
  return limit ? out.slice(0, limit) : out;
}

export function categories(data) {
  const counts = new Map();
  for (const o of data.operations) if (o.category) counts.set(o.category, (counts.get(o.category) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([c]) => c);
}

export function dashboard(data, month) {
  const projects = [...data.projects].sort(sortProjects).map((p) => {
    const s = projectSummary(data, p);
    return { id: p.id, name: p.name, client: p.client, status: p.status, budget: s.budget, income: s.income, cash: s.cash, receivable: s.receivable, teamDue: s.teamDue, profitPlan: s.profitPlan };
  });

  // 12 месяцев, заканчивая выбранным
  const series = [];
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    series.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  const byMonth = new Map(series.map((ym) => [ym, { income: 0, outflow: 0 }]));
  for (const o of data.operations) {
    const b = byMonth.get(o.date.slice(0, 7));
    if (!b) continue;
    if (o.type === 'income') b.income += o.amount || 0;
    else if (OUTFLOW.has(o.type)) b.outflow += o.amount || 0;
  }

  return {
    month,
    total: flow(sums(data.operations)),
    monthFlow: flow(sums(data.operations.filter((o) => o.date.startsWith(month)))),
    teamDue: teamBalances(data).filter((t) => t.due !== 0),
    projects,
    series: series.map((ym) => ({ month: ym, income: R(byMonth.get(ym).income), outflow: R(byMonth.get(ym).outflow) })),
  };
}
