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

// ---------- Выписка сотрудника ----------
// То, что видит сам сотрудник: только его начисления, штрафы и выплаты. Суммы в копейках.
export function memberStatement(data, memberId) {
  const m = data.members.find((x) => x.id === memberId);
  if (!m) return null;
  const projects = new Map();
  const proj = (pid) => {
    if (!projects.has(pid)) {
      const p = data.projects.find((x) => x.id === pid);
      projects.set(pid, { project_id: pid, name: p?.name || 'Без проекта', status: p?.status || 'active', accrued: 0, penalties: 0, paid: 0, due: 0, items: [] });
    }
    return projects.get(pid);
  };

  for (const p of data.projects) if (p.member_ids?.includes(memberId)) proj(p.id);
  const sorted = [...data.iterations].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  for (const it of sorted) {
    const amount = it.shares?.[memberId] || 0;
    if (!amount) continue;
    const p = proj(it.project_id);
    p.items.push({ title: it.title, status: it.status, date: it.date || null, amount });
    if (it.status !== 'cancelled') p.accrued += amount;
  }

  const history = [];
  for (const o of data.operations) {
    const involved = o.member_id === memberId || o.from_member_id === memberId;
    if (!involved || !['payout', 'penalty', 'transfer'].includes(o.type)) continue;
    if (o.type === 'payout' && o.project_id) proj(o.project_id).paid += o.amount;
    if (o.type === 'penalty' && o.project_id) proj(o.project_id).penalties += o.amount;
    const other = o.type === 'transfer'
      ? data.members.find((x) => x.id === (o.member_id === memberId ? o.from_member_id : o.member_id))?.name || ''
      : '';
    history.push({
      date: o.date, type: o.type, amount: o.amount, comment: o.comment || '',
      project: data.projects.find((x) => x.id === o.project_id)?.name || '',
      direction: o.type === 'transfer' ? (o.member_id === memberId ? 'in' : 'out') : null, other,
    });
  }
  history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const list = [...projects.values()].map((p) => ({ ...p, due: p.accrued - p.penalties - p.paid }));
  const sum = (k) => list.reduce((a, p) => a + p[k], 0);
  return {
    member_id: memberId,
    name: m.name,
    role: m.role || '',
    totals: { accrued: sum('accrued'), penalties: sum('penalties'), paid: sum('paid'), due: sum('due') },
    projects: list,
    history,
  };
}

// ---------- Накопительные счета ----------
const DAY = 86400000;
const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fromDay = (t) => new Date(t).toISOString().slice(0, 10);

// Годовая доходность при ставке r% и капитализации
export function effectiveYield(rate, capitalization) {
  const r = Number(rate || 0) / 100;
  if (capitalization === 'daily') return (1 + r / 365) ** 365 - 1;
  if (capitalization === 'monthly') return (1 + r / 12) ** 12 - 1;
  return r;
}

// Сводка по счёту: остаток, начисленные банком проценты, расчётные проценты с последнего начисления, прогноз.
// ops — операции счёта: deposit / withdraw / interest (amount в копейках) и rate (новая ставка, % годовых).
export function accountSummary(account, ops, today) {
  const sorted = [...ops].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created_ms || 0) - (b.created_ms || 0)));
  let balance = 0;
  let deposited = 0;
  let withdrawn = 0;
  let interest = 0;
  let rate = Number(account.rate || 0);
  let lastInterest = null;
  for (const o of sorted) {
    if (o.date > today) continue;
    if (o.type === 'deposit') { balance += o.amount; deposited += o.amount; }
    else if (o.type === 'withdraw') { balance -= o.amount; withdrawn += o.amount; }
    else if (o.type === 'interest') { balance += o.amount; interest += o.amount; lastInterest = o.date; }
    else if (o.type === 'rate') rate = Number(o.rate || 0);
  }

  // Расчётные проценты: по дням с последнего начисления банком (или с первого пополнения) до сегодня
  const first = sorted.find((o) => o.type === 'deposit')?.date;
  let accrued = 0;
  if (first && first <= today) {
    const start = lastInterest || first;
    let bal = 0;
    let r = Number(account.rate || 0);
    let i = 0;
    for (let t = toDay(start); t < toDay(today); t += DAY) {
      const d = fromDay(t);
      while (i < sorted.length && sorted[i].date <= d) {
        const o = sorted[i++];
        if (o.type === 'deposit' || o.type === 'interest') bal += o.amount;
        else if (o.type === 'withdraw') bal -= o.amount;
        else if (o.type === 'rate') r = Number(o.rate || 0);
      }
      // До даты start операции уже учтены в bal — накапливаем только с неё
      accrued += (bal * r) / 100 / 365;
    }
  }

  const R = (k) => Math.round(k) / 100;
  return {
    balance: R(balance),
    deposited: R(deposited),
    withdrawn: R(withdrawn),
    interest: R(interest),
    rate,
    lastInterest,
    accrued: R(accrued),
    monthForecast: R((balance * rate) / 100 / 12),
    yearForecast: R(balance * effectiveYield(rate, account.capitalization)),
    effectiveYield: Math.round(effectiveYield(rate, account.capitalization) * 10000) / 100,
  };
}
