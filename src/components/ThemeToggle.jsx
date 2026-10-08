import { useTheme } from '../lib/theme.js';

// Солнце ⇄ луна: две иконки сменяют друг друга поворотом и масштабом.
// Анимируются только transform/opacity самих <svg> — это одинаково работает во всех браузерах, включая Safari на iOS.
export default function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle${dark ? ' is-dark' : ''} ${className}`}
      onClick={toggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
    >
      <svg className="tt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className="tt-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" />
      </svg>
    </button>
  );
}
