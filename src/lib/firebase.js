import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signOut } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  terminate, clearIndexedDbPersistence,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

// Конфигурация веб-приложения Firebase (Консоль → Настройки проекта → Ваши приложения).
// Эти значения не секретные: доступ к данным защищают правила firestore.rules.
const env = import.meta.env || {}; // вне Vite (тесты в Node) переменных нет
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const configured = Boolean(config.apiKey && config.projectId);

export const app = configured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
// Локальный кэш: приложение открывается без сети, операции, внесённые офлайн, отправятся при появлении связи
export const db = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;

// Хранилище файлов (документы сотрудников) — нужен тариф Blaze и созданный bucket
export const storage = app && config.storageBucket ? getStorage(app) : null;

if (app && env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// Выход: кроме сессии стираем локальную копию данных (офлайн-кэш Firestore в IndexedDB),
// чтобы на общем компьютере после выхода ничего не оставалось.
export async function logout() {
  try { await signOut(auth); } catch { /* уже вышли */ }
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch { /* кэш занят другой вкладкой — очистится при следующем выходе */ }
  window.location.replace('/');
}
