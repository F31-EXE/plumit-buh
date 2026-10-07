import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

// ---------- Пасхалка: три быстрых нажатия на логотип открывают видео со звуком ----------
const EggCtx = createContext(() => {});
const TAP_GAP_MS = 700; // максимальная пауза между соседними нажатиями

export function EasterEggProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const videoRef = useRef(null);
  const taps = useRef([]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    // play() вызывается прямо в обработчике нажатия — так браузеры (и iOS) разрешают звук
    v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  }, []);

  const tap = useCallback(() => {
    const now = Date.now();
    const last = taps.current.at(-1);
    taps.current = last && now - last < TAP_GAP_MS ? [...taps.current, now] : [now];
    if (taps.current.length >= 3) {
      taps.current = [];
      flushSync(() => setOpen(true)); // видео должно оказаться в DOM синхронно, до play()
      play();
    }
  }, [play]);

  const close = useCallback(() => {
    videoRef.current?.pause();
    setOpen(false);
    setNeedsTap(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <EggCtx.Provider value={tap}>
      {children}
      {open && createPortal(
        <div className="egg" onClick={close} role="dialog" aria-label="Пасхалка">
          <div className="egg-card" onClick={(e) => e.stopPropagation()}>
            <video
              ref={videoRef}
              src="/media/egg.mp4"
              poster="/media/egg-poster.jpg"
              playsInline
              preload="auto"
              onEnded={close}
              onClick={needsTap ? play : undefined}
            />
            {needsTap && <button type="button" className="egg-play" onClick={play}>▶ Включить со звуком</button>}
            <button type="button" className="egg-close" onClick={close} aria-label="Закрыть">×</button>
          </div>
        </div>,
        document.body,
      )}
    </EggCtx.Provider>
  );
}

// ---------- Логотип ----------
export function Logo({ size = 40 }) {
  const tap = useContext(EggCtx);
  const onClick = (e) => {
    // Перезапуск анимации покачивания на каждое нажатие
    const el = e.currentTarget;
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    tap();
  };
  return <img src="/logo.png" alt="Plumit" width={size} height={size} className="logo" draggable={false} onClick={onClick} />;
}

export function Brand({ size = 40 }) {
  return (
    <div className="brand">
      <Logo size={size} />
      <div>Plumit<small>Бухгалтерия проектов</small></div>
    </div>
  );
}
