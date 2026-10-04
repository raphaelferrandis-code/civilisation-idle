import { useEffect, useRef } from 'react';
import { fmt } from '../../game/core/utils.js';

/**
 * LE GAIN QUI MONTE (2026-10-04, « la sensation de gagner ») : un montant qui défile
 * de 0 à sa valeur, vite puis lentement, comme le compteur d'une machine. Sert au
 * bandeau des grands gains et au gain de chaque coup gagnant des tables. Écrit le
 * texte directement (pas d'état React par image) ; `format` : fmt par défaut.
 */
export default function Monte({ value, dur = 900, format = fmt }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const v = Number(value) || 0;
    if (dur <= 0 || v <= 0) { el.textContent = format(v); return undefined; }
    let raf = 0, t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / dur);
      el.textContent = format(u >= 1 ? v : Math.round(v * (1 - Math.pow(1 - u, 3))));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur, format]);
  return <span ref={ref} className="monte">{format(0)}</span>;
}
