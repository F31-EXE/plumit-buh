import { useId } from 'react';
import { useTheme } from '../lib/theme.js';

// Солнце ⇄ луна: лучи прячутся с поворотом, тень «наезжает» на диск и делает полумесяц
export default function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme();
  const maskId = useId();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle${dark ? ' is-dark' : ''} ${className}`}
      onClick={toggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <mask id={maskId}>
          <rect width="24" height="24" fill="#fff" />
          <circle className="tt-cut" cx="24" cy="4" r="7" fill="#000" />
        </mask>
        <circle className="tt-core" cx="12" cy="12" r="5" fill="currentColor" mask={`url(#${maskId})`} />
        <g className="tt-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4 6 18M18 6l1.4-1.4" />
        </g>
      </svg>
    </button>
  );
}
