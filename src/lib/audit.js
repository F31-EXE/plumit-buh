// Журнал изменений: каждая запись в базу сопровождается документом audit/{id} в том же батче.
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { emailKey } from './util.js';

// Актуальные данные — чтобы подписать запись именами («Выплата · Роман · CLOKWISE»).
// Подпись сохраняется в журнале и остаётся понятной, даже если проект или человека потом удалят.
let current = null;
export function setAuditData(data) { current = data; }
export const find = (col, id) => (id ? current?.[col]?.find((x) => x.id === id) || null : null);

export const ENTITIES = {
  operation: 'операцию', project: 'проект', iteration: 'итерацию', member: 'участника', document: 'документ',
  account: 'накопительный счёт', account_op: 'операцию по счёту', access: 'доступ', import: 'импорт', demo: 'демо-данные',
};

const SKIP = new Set(['created_ms', 'created_by']);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Список изменившихся полей: [{ field, from, to }]. Вложенные объекты (доли) — по ключам: shares.<memberId>
export function diff(before = {}, after = {}) {
  const out = [];
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (SKIP.has(k)) continue;
    const a = before?.[k] ?? null;
    const b = after?.[k] ?? null;
    if (isMap(a) || isMap(b)) {
      for (const s of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        if (!same(a?.[s], b?.[s])) out.push({ field: `${k}.${s}`, from: a?.[s] ?? null, to: b?.[s] ?? null });
      }
    } else if (!same(a, b)) out.push({ field: k, from: a, to: b });
  }
  return out;
}

const ddmm = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('.') : d);
const rub = (k) => `${(Number(k || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
const OP = { income: 'Поступление', payout: 'Выплата', expense: 'Расход', tax: 'Налоги/взносы', penalty: 'Штраф', transfer: 'Перевод' };
const ACC = { deposit: 'Пополнение', withdraw: 'Снятие', interest: 'Проценты', rate: 'Ставка' };

export function labelFor(entity, d = {}) {
  const name = (col, id) => find(col, id)?.name || '';
  switch (entity) {
    case 'operation': {
      const who = d.type === 'transfer' ? `${name('members', d.from_member_id)} → ${name('members', d.member_id)}` : name('members', d.member_id) || d.category;
      return [`${OP[d.type] || d.type} ${rub(d.amount)}`, who, name('projects', d.project_id), ddmm(d.date)].filter(Boolean).join(' · ');
    }
    case 'project': return d.name || '';
    case 'iteration': return [d.title, name('projects', d.project_id)].filter(Boolean).join(' · ');
    case 'member': return [d.name, d.role].filter(Boolean).join(' · ');
    case 'document': return [d.title, name('members', d.member_id)].filter(Boolean).join(' · ');
    case 'account': return d.name || '';
    case 'account_op': return [`${ACC[d.type] || d.type} ${d.type === 'rate' ? `${d.rate} %` : rub(d.amount)}`, name('accounts', d.account_id), ddmm(d.date)].filter(Boolean).join(' · ');
    default: return '';
  }
}

// Firestore не принимает undefined — чистим снимок
const clean = (v) => (v == null ? null : JSON.parse(JSON.stringify(v, (k, x) => (k === 'id' ? undefined : x))));

// Документ журнала для батча
export function auditEntry(action, entity, entityId, { before = null, after = null, label } = {}) {
  return {
    ref: doc(collection(db, 'audit')),
    data: {
      at: serverTimestamp(),
      at_ms: Date.now(),
      user: emailKey(auth?.currentUser?.email),
      action,
      entity,
      entity_id: entityId || '',
      label: String(label ?? labelFor(entity, after || before || {})).slice(0, 500),
      changes: action === 'update' ? diff(before || {}, after || {}).slice(0, 100) : [],
      snapshot: action === 'delete' ? clean(before) : null,
    },
  };
}
