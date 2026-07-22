import { useEffect, useRef, useState } from 'react';

// Moteur d'interpolation « count-up » partagé par OdometerNumber et RollingNumber
// (audit G-53/DUP-04) : interpole une valeur affichée de sa position courante vers
// `target` en rAF sur `duration` ms. Montée = animée (interpolation LINÉAIRE, pour
// que des segments de même pente s'enchaînent sans à-coup) ; baisse ou hors-domaine
// float = bascule instantanée. Renvoie la valeur affichée (number interpolé).
export function useCountUp(target, duration) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const targetRef = useRef(target);
  const displayRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target === targetRef.current) return undefined;

    // Baisse (achat/coût) ou hors domaine float : bascule directe, pas d'anim.
    if (!Number.isFinite(target) || !Number.isFinite(displayRef.current) || target < displayRef.current) {
      cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
      targetRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    // Montée : count-up animé depuis la position courante (anim en cours incluse).
    fromRef.current = displayRef.current;
    targetRef.current = target;
    startRef.current = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const current = t >= 1
        ? targetRef.current
        : fromRef.current + (targetRef.current - fromRef.current) * t;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return display;
}
