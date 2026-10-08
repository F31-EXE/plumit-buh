import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { accountSummary } from '../lib/finance.js';
import {
  ACCOUNT_OPS, CAPITALIZATION, deleteAccount, deleteAccountOp, saveAccount, saveAccountOp,
} from '../lib/actions.js';
import { dateLabel, money, today } from '../format.js';
import { Empty, ErrorBox, Field, Icon, Modal, MoneyInput, Segmented, Stat, parseMoney, useToast } from '../ui.jsx';

const pct = (v) => `${String(v).replace('.', ',')} %`;
const opsOf = (data, id) => data.account_ops.filter((o) => o.account_id === id);

export default function Savings() {
  const { data, isAdmin } = useApp();
  const [form, setForm] = useState(null);
  const navigate = useNavigate();
  const accounts = useMemo(() => [...data.accounts]
    .sort((a, b) => a.archived - b.archived || (a.created_ms || 0) - (b.created_ms || 0))
    .map((a) => ({ ...a, s: accountSummary(a, opsOf(data, a.id), today()) })), [data]);
  const active = accounts.filter((a) => !a.archived);
  const total = active.reduce((acc, a) => acc + a.s.balance, 0);
  const accrued = active.reduce((acc, a) => acc + a.s.accrued, 0);
  const month = active.reduce((acc, a) => acc + a.s.monthForecast, 0);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow"><h1>Накопительные счета</h1><div className="sub">Резерв студии под проценты</div></div>
        {isAdmin && <button type="button" className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Счёт</button>}
      </div>

      {active.length > 0 && (
        <div className="stats">
          <Stat accent label="На счетах" value={total} />
          <Stat label="Набежало с последнего начисления" value={accrued} hint="Расчётно, по ставке и остатку по дням" tone="pos" />
          <Stat label="Прогноз процентов в месяц" value={month} hint="При текущем остатке и ставке" />
        </div>
      )}

      {!accounts.length && (
        <div className="card"><Empty title="Счетов пока нет">Добавьте накопительный счёт или вклад — приложение посчитает проценты и прогноз.</Empty></div>
      )}

      <div className="projects-grid">
        {accounts.map((a) => (
          <Link key={a.id} to={`/savings/${a.id}`} className="card project-card" style={a.archived ? { opacity: 0.6 } : undefined}>
            <div className="spread">
              <div className="grow">
                <h2 className="ellipsis">{a.name}</h2>
                <div className="faint small ellipsis">{[a.bank, CAPITALIZATION[a.capitalization], a.archived && 'закрыт'].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="badge active">{pct(a.s.rate)}</span>
            </div>
            <div className="kv">
              <div><span>Остаток</span><strong>{money(a.s.balance)}</strong></div>
              <div><span>Получено процентов</span><strong>{money(a.s.interest)}</strong></div>
              <div><span>Набежало ≈</span><strong className="pos">+{money(a.s.accrued)}</strong></div>
              <div><span>В месяц ≈</span><strong>{money(a.s.monthForecast)}</strong></div>
            </div>
          </Link>
        ))}
      </div>

      {form && <AccountForm account={null} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); navigate(`/savings/${id}`); }} />}
    </div>
  );
}

export function SavingsAccount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isAdmin } = useApp();
  const [edit, setEdit] = useState(false);
  const [opForm, setOpForm] = useState(null);
  const account = data.accounts.find((a) => a.id === id);
  const ops = useMemo(() => opsOf(data, id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_ms || 0) - (a.created_ms || 0))), [data, id]);
  const s = useMemo(() => account && accountSummary(account, ops, today()), [account, ops]);

  if (!account) return <Empty title="Счёт не найден"><Link to="/savings" className="btn sm" style={{ marginTop: 10 }}>К счетам</Link></Empty>;

  return (
    <div className="stack">
      <div>
        <Link to="/savings" className="back"><Icon name="left" width={16} />Счета</Link>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="grow">
            <h1>{account.name}</h1>
            <div className="sub">{[account.bank, `${pct(s.rate)} годовых`, CAPITALIZATION[account.capitalization]].filter(Boolean).join(' · ')}</div>
          </div>
          {isAdmin && <button type="button" className="btn icon" onClick={() => setEdit(true)} aria-label="Настройки счёта"><Icon name="edit" /></button>}
        </div>
      </div>

      <div className="stats">
        <Stat accent label="Остаток" value={s.balance} hint={`Пополнено ${money(s.deposited)} · снято ${money(s.withdrawn)}`} />
        <Stat label="Проценты получено" value={s.interest} tone="pos" />
        <Stat label="Набежало ≈" value={s.accrued} hint={s.lastInterest ? `с ${dateLabel(s.lastInterest)}` : 'с первого пополнения'} tone="pos" />
        <Stat label="Прогноз в месяц" value={s.monthForecast} />
        <Stat label="Прогноз за год" value={s.yearForecast} hint={`Эффективно ${pct(s.effectiveYield)} с капитализацией`} />
        <Stat label="Ставка" value={pct(s.rate)} hint={CAPITALIZATION[account.capitalization]} />
      </div>

      {isAdmin && (
        <div className="row wrap">
          <button type="button" className="btn primary" onClick={() => setOpForm({ type: 'deposit' })}><Icon name="in" />Пополнить</button>
          <button type="button" className="btn" onClick={() => setOpForm({ type: 'withdraw' })}><Icon name="out" />Снять</button>
          <button type="button" className="btn" onClick={() => setOpForm({ type: 'interest', amount: s.accrued || '' })}><Icon name="percent" />Проценты от банка</button>
          <button type="button" className="btn ghost" onClick={() => setOpForm({ type: 'rate', rate: s.rate })}>Сменить ставку</button>
        </div>
      )}

      <div className="card flush">
        <div className="card-head"><h2>История</h2></div>
        {ops.length ? (
          <div className="list">
            {ops.map((o) => (
              <div key={o.id} className="list-item" role="button" tabIndex={0} onClick={() => isAdmin && setOpForm(o)}>
                <span className={`op-icon ${o.type === 'withdraw' ? 'expense' : 'income'}`}>
                  <Icon name={{ deposit: 'in', withdraw: 'out', interest: 'percent', rate: 'edit' }[o.type]} />
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{ACCOUNT_OPS[o.type]}</div>
                  <div className="faint small ellipsis">{[dateLabel(o.date), o.comment].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={`op-amount ${o.type === 'withdraw' ? 'neg' : o.type === 'rate' ? '' : 'pos'}`}>
                  {o.type === 'rate' ? pct(o.rate) : `${o.type === 'withdraw' ? '−' : '+'}${money(o.amount / 100)}`}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title="Операций пока нет">Нажмите «Пополнить», чтобы внести первую сумму.</Empty>}
      </div>
      <p className="faint small">
        «Набежало» — расчёт по дням: остаток × ставка ÷ 365 с даты последнего начисления процентов банком.
        Когда банк начислит проценты, запишите их кнопкой «Проценты от банка» — расчёт начнётся заново.
      </p>

      {edit && <AccountForm account={account} onClose={() => setEdit(false)} onSaved={(rid) => { setEdit(false); if (!rid) navigate('/savings'); }} />}
      {opForm && <AccountOpForm accountId={id} initial={opForm} onClose={() => setOpForm(null)} />}
    </div>
  );
}

function AccountForm({ account, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    name: account?.name || '', bank: account?.bank || '', rate: account ? String(account.rate) : '',
    capitalization: account?.capitalization || 'monthly', opened: account?.opened || '', notes: account?.notes || '', archived: !!account?.archived,
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  function submit(e) {
    e.preventDefault();
    try { const id = saveAccount(account?.id, f); toast('Сохранено'); onSaved(id); } catch (err) { setError(err); }
  }
  async function remove() {
    if (!confirm(`Удалить счёт «${account.name}» со всей историей?`)) return;
    try { await deleteAccount(account.id); onSaved(null); } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={account ? 'Настройки счёта' : 'Новый накопительный счёт'}
      onClose={onClose}
      footer={(
        <>
          {account && <button type="button" className="btn danger left" onClick={remove}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="acc-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="acc-form" className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Название" className="full"><input className="input" value={f.name} onChange={set('name')} required placeholder="Например, Резерв" /></Field>
          <Field label="Банк"><input className="input" value={f.bank} onChange={set('bank')} placeholder="Точка, Т-Банк…" /></Field>
          <Field label="Ставка, % годовых"><input className="input" inputMode="decimal" value={f.rate} onChange={set('rate')} required placeholder="16" /></Field>
          <Field label="Капитализация">
            <select className="input" value={f.capitalization} onChange={set('capitalization')}>
              {Object.entries(CAPITALIZATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Открыт"><input type="date" className="input" value={f.opened} onChange={set('opened')} /></Field>
        </div>
        <Field label="Заметки"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
        {account && <label className="check"><input type="checkbox" checked={f.archived} onChange={set('archived')} />Счёт закрыт (не учитывать в сумме)</label>}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function AccountOpForm({ accountId, initial, onClose }) {
  const toast = useToast();
  const editing = Boolean(initial.id);
  const [f, setF] = useState(() => ({
    type: initial.type || 'deposit', date: initial.date || today(), comment: initial.comment || '',
    amount: initial.amount ? String(editing ? initial.amount / 100 : initial.amount) : '', rate: initial.rate != null ? String(initial.rate) : '',
  }));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  function submit(e) {
    e.preventDefault();
    try {
      saveAccountOp(initial.id, { ...f, account_id: accountId, amount: parseMoney(f.amount), created_ms: initial.created_ms });
      toast('Сохранено');
      onClose();
    } catch (err) { setError(err); }
  }

  return (
    <Modal
      title={editing ? ACCOUNT_OPS[f.type] : 'Операция по счёту'}
      onClose={onClose}
      footer={(
        <>
          {editing && <button type="button" className="btn danger left" onClick={() => { if (confirm('Удалить запись?')) { deleteAccountOp(initial.id); onClose(); } }}>Удалить</button>}
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" form="accop-form" className="btn primary">Сохранить</button>
        </>
      )}
    >
      <form id="accop-form" className="stack" onSubmit={submit}>
        <Segmented className="fit" value={f.type} onChange={set('type')} options={[['deposit', 'Пополнение'], ['withdraw', 'Снятие'], ['interest', 'Проценты'], ['rate', 'Ставка']]} />
        <div className="form-grid">
          {f.type === 'rate' ? (
            <Field label="Новая ставка, % годовых" className="full"><input className="input big" inputMode="decimal" value={f.rate} onChange={set('rate')} required /></Field>
          ) : (
            <Field label="Сумма, ₽" className="full"><MoneyInput big value={f.amount} onChange={set('amount')} required autoFocus={!editing} /></Field>
          )}
          <Field label={f.type === 'rate' ? 'Действует с' : 'Дата'}><input type="date" className="input" value={f.date} onChange={set('date')} required /></Field>
          <Field label="Комментарий"><input className="input" value={f.comment} onChange={set('comment')} /></Field>
        </div>
        {f.type === 'interest' && !editing && <div className="faint small">Подставлена расчётная сумма — поправьте на ту, что реально начислил банк.</div>}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
