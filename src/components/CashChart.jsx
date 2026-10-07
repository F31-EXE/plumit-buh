import { useEffect, useRef, useState } from 'react';
import { compact, money, monthLabel, monthShort } from '../format.js';

// Поступления и выплаты/расходы по месяцам: сгруппированные столбцы, одна ось.
export default function CashChart({ series }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const height = 220;
  const pad = { top: 12, right: 4, bottom: 26, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.outflow]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const y = (v) => pad.top + innerH - (v / top) * innerH;
  const band = innerW / series.length;
  const barW = Math.max(3, Math.min(18, (band - 8) / 2 - 1));
  const narrow = width < 480;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Поступления и выплаты по месяцам">
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={pad.left - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>)}
          {series.map((s, i) => (narrow && i % 2 ? null : (
            <text key={s.month} x={pad.left + band * i + band / 2} y={height - 6} textAnchor="middle">{monthShort(s.month)}</text>
          )))}
        </g>
        {series.map((s, i) => {
          const cx = pad.left + band * i + band / 2;
          return (
            <g key={s.month}>
              {hover === i && <rect x={cx - band / 2} y={pad.top} width={band} height={innerH} fill="var(--surface-2)" />}
              <Bar x={cx - barW - 1} w={barW} top={y(s.income)} base={y(0)} fill="var(--chart-income)" />
              <Bar x={cx + 1} w={barW} top={y(s.outflow)} base={y(0)} fill="var(--chart-outflow)" />
              <rect
                x={cx - band / 2} y={pad.top} width={band} height={innerH + pad.bottom} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: Math.min(Math.max(pad.left + band * hover + band / 2, 90), width - 90), top: pad.top + 10 }}>
          <strong>{monthLabel(series[hover].month)}</strong>
          <div><span className="legend-dot" style={{ color: 'var(--chart-income)' }}>■</span> Поступления: {money(series[hover].income)}</div>
          <div><span style={{ color: 'var(--chart-outflow)' }}>■</span> Выплаты и расходы: {money(series[hover].outflow)}</div>
        </div>
      )}
    </div>
  );
}

// Столбец со скруглённым верхом, прижатый к базовой линии
function Bar({ x, w, top, base, fill }) {
  const h = base - top;
  if (h <= 0.5) return null;
  const r = Math.min(4, w / 2, h);
  return <path d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`} fill={fill} />;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
