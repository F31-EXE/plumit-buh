// Тема оформления: 'auto' (как в системе) | 'light' | 'dark'.
// Хранится в localStorage, применяется атрибутом data-theme на <html>.
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let theme = read();

export const resolve = (t) => (t === 'auto' ? (media.matches ? 'dark' : 'light') : t);

function apply(t) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme;
  else root.dataset.theme = t;
  // Цвет строки состояния на телефоне — под фон
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolve(t) === 'dark' ? '#0f0d13' : '#f6f5f9');
}

function set(next) {
  theme = next;
  try { localStorage.setItem(KEY, next); } catch { /* приватный режим */ }
  apply(next);
  listeners.forEach((l) => l());
}

apply(theme);
media.addEventListener('change', () => { if (theme === 'auto') { apply(theme); listeners.forEach((l) => l()); } });

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => `${theme}:${resolve(theme)}`;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Смена темы с анимацией: круг новой темы расходится от точки (x, y) — обычно от кнопки.
export function setTheme(next, origin) {
  if (next === theme) return;
  if (resolve(next) === resolve(theme) || reducedMotion()) { set(next); return; }

  if (!document.startViewTransition) {
    // Запасной вариант: плавная смена цветов
    const root = document.documentElement;
    root.classList.add('theme-fade');
    set(next);
    setTimeout(() => root.classList.remove('theme-fade'), 500);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => { flushSync(() => set(next)); });
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.7, 0, .3, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

export function useTheme() {
  const snap = useSyncExternalStore(subscribe, snapshot);
  const [current, resolved] = snap.split(':');
  return {
    theme: current,
    resolved,
    setTheme,
    // Переключатель светлая ↔ тёмная от центра нажатой кнопки
    toggle: (event) => {
      const rect = event?.currentTarget?.getBoundingClientRect();
      setTheme(resolved === 'dark' ? 'light' : 'dark', rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    },
  };
}
