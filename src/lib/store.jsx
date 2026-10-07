import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const COLLECTIONS = ['members', 'projects', 'iterations', 'operations'];
const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

export const emailKey = (email) => String(email || '').trim().toLowerCase();

// Состояние входа: undefined — ещё не знаем, null — не вошёл, объект — пользователь
export function useAuthUser() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

// Роль из коллекции access/{email}: undefined — загрузка, null — доступа нет
export function useRole(user) {
  const [role, setRole] = useState(undefined);
  useEffect(() => {
    if (!user?.email || !user.emailVerified) { setRole(null); return undefined; }
    setRole(undefined);
    return onSnapshot(
      doc(db, 'access', emailKey(user.email)),
      (snap) => setRole(snap.exists() ? snap.data().role : null),
      () => setRole(null),
    );
  }, [user]);
  return role;
}

// Подписка на все коллекции. Данные студии небольшие, поэтому держим их в памяти целиком,
// а все суммы считаем на клиенте — так приложение работает и офлайн.
export function DataProvider({ children }) {
  const [state, setState] = useState({ ready: false, error: null, members: [], projects: [], iterations: [], operations: [] });

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
