import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { emailKey } from './util.js';

const COLLECTIONS = ['members', 'projects', 'iterations', 'operations', 'accounts', 'account_ops', 'documents'];
const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export { emailKey } from './util.js';

// Состояние входа: undefined — ещё не знаем, null — не вошёл, объект — пользователь
export function useAuthUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

// Доступ из коллекции access/{email}: undefined — загрузка, null — доступа нет,
// иначе { role: 'admin' | 'viewer' | 'employee', member_id }
export function useAccess(user) {
  const [access, setAccess] = useState(undefined);
  useEffect(() => {
    if (!user?.email || !user.emailVerified) { setAccess(null); return undefined; }
    setAccess(undefined);
    return onSnapshot(
      doc(db, 'access', emailKey(user.email)),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        const ok = d && (['admin', 'viewer'].includes(d.role) || (d.role === 'employee' && d.member_id)
          || (d.role === 'client' && d.project_ids?.length));
        setAccess(ok ? { role: d.role, member_id: d.member_id || null, project_ids: d.project_ids || [] } : null);
      },
      () => setAccess(null),
    );
  }, [user]);
  return access;
}

// Подписка на все коллекции. Данные студии небольшие, поэтому держим их в памяти целиком,
// а все суммы считаем на клиенте — так приложение работает и офлайн.
export function DataProvider({ children }) {
  const [state, setState] = useState({
    ready: false, error: null, members: [], projects: [], iterations: [], operations: [], accounts: [], account_ops: [], documents: [],
  });

  useEffect(() => {
    const loaded = new Set();
    const unsubs = COLLECTIONS.map((name) => onSnapshot(
      collection(db, name),
      (snap) => {
        loaded.add(name);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setState((s) => ({ ...s, [name]: rows, ready: loaded.size === COLLECTIONS.length }));
      },
      (error) => setState((s) => ({ ...s, error })),
    ));
    return () => unsubs.forEach((u) => u());
  }, []);

  return <DataCtx.Provider value={state}>{children}</DataCtx.Provider>;
}

// Данные сотрудника: только его выписка и его документы (больше правила ему ничего не отдают)
export function useEmployeeData(memberId) {
  const [state, setState] = useState({ ready: false, error: null, statement: null, documents: [] });
  useEffect(() => {
    const loaded = new Set();
    const done = (k, patch) => { loaded.add(k); setState((s) => ({ ...s, ...patch, ready: loaded.size === 2 })); };
    const fail = (error) => setState((s) => ({ ...s, error, ready: true }));
    const u1 = onSnapshot(doc(db, 'statements', memberId), (snap) => done('s', { statement: snap.exists() ? snap.data() : null }), fail);
    const u2 = onSnapshot(
      query(collection(db, 'documents'), where('member_id', '==', memberId)),
      (snap) => done('d', { documents: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }),
      fail,
    );
    return () => { u1(); u2(); };
  }, [memberId]);
  return state;
}

// Данные заказчика: кабинеты его проектов и документы этих проектов
export function useClientData(projectIds) {
  const key = projectIds.join(',');
  const [state, setState] = useState({ ready: false, error: null, views: {}, documents: {} });
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const loaded = new Set();
    const mark = (k) => { loaded.add(k); return loaded.size === ids.length * 2; };
    const fail = (error) => setState((s) => ({ ...s, error, ready: true }));
    const unsubs = ids.flatMap((pid) => [
      onSnapshot(doc(db, 'client_views', pid), (snap) => {
        const ready = mark(`v${pid}`);
        setState((s) => ({ ...s, ready: s.ready || ready, views: { ...s.views, [pid]: snap.exists() ? snap.data() : null } }));
      }, fail),
      onSnapshot(query(collection(db, 'documents'), where('project_id', '==', pid)), (snap) => {
        const ready = mark(`d${pid}`);
        setState((s) => ({ ...s, ready: s.ready || ready, documents: { ...s.documents, [pid]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) } }));
      }, fail),
    ]);
    if (!ids.length) setState((s) => ({ ...s, ready: true }));
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}
