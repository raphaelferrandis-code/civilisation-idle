import { useEffect, useRef, useState } from 'react';
import { fmt } from '../../game/core/utils.js';
import { toNum } from '../../game/core/num.js';

// ms — volontairement AU-DESSUS de la seconde du tick : l'anim d'un tick est
// encore en cours quand le suivant arrive, donc le nombre ne s'arrête jamais
// entre deux ticks (sinon on « sent » chaque seconde). Couplé à une interpolation
// LINÉAIRE : à débit constant, des segments de même pente s'enchaînent en une
// montée parfaitement continue. (Un easing qui décélère relancerait au contraire
// un à-coup à chaque tick.)
const DEFAULT_DURATION = 1100;

/**
 * Affiche un nombre qui « roule » (count-up) vers sa nouvelle valeur à chaque
 * changement, au lieu de sauter d'un coup. Purement cosmétique : la logique de
 * jeu (tick d'1 s) n'est pas touchée — on interpole seulement l'AFFICHAGE entre
 * deux valeurs successives.
 *
 * `value` accepte un Decimal ou un number (tout ce que `format` digère). On
 * interpole en number (toNum) car l'arithmétique native sur un Decimal est
 * piégée en dev (voir num.js). Au repos, on reformate la valeur d'origine pour
 * garder l'exactitude des très grands Decimal ; en cours d'anim, l'interpolation.
 */
export default function RollingNumber({ value, format = fmt, duration = DEFAULT_DURATION }) {
  const target = toNum(value);
  const [display, setDisplay] = useState(target);

  const fromRef = useRef(target);
  const targetRef = useRef(target);
  const displayRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // Cible inchangée (re-render parent sans variation) : rien à animer.
    if (target === targetRef.current) return undefined;

    // Hors domaine float (très grands nombres, ou retour depuis l'infini) :
    // pas d'interpolation possible → bascule directe sur la valeur finale.
    if (!Number.isFinite(target) || !Number.isFinite(displayRef.current)) {
      cancelAnimationFrame(rafRef.current);
      targetRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    // Baisse de la valeur (un achat déduit la somme, un coût se paie) : on ne
    // « roule » PAS vers le bas — la déduction doit être instantanée. Seules les
    // hausses (production) s'animent en count-up.
    if (target < displayRef.current) {
      cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
      targetRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return undefined;
    }

    fromRef.current = displayRef.current; // repart de la position courante (anim en cours incluse).
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

  // Au repos (anim terminée), on reformate la valeur d'origine — exacte pour les
  // très grands Decimal. En cours d'anim, on formate le number interpolé.
  return format(display === target ? value : display);
}
