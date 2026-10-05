import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { uiMotionStill } from '../game/map/ambianceMode.js';

// Interpoler ne sert à rien quand personne ne doit voir le nombre rouler : cran
// « Mouvement : Aucune » des Options ou mouvement réduit du système
// (uiMotionStill — base.css ne coupe que le CSS, ce hook est du JS), et
// contemplation, où la barre du haut et le HUD de la Cité passent en
// display:none (views-city-hud.css) mais RESTENT montés : la boucle rAF
// tournait pour des chiffres que personne ne voyait (audit du 2026-10-05,
// PERF-39). Lu une fois par changement de cible (un tick), pas à chaque image.
function countUpStill() {
  if (uiMotionStill()) return true;
  return typeof document !== 'undefined'
    && document.querySelector('.app[data-contemplation="on"]') !== null;
}

// Moteur d'interpolation « count-up » partagé par OdometerNumber et RollingNumber
// (audit G-53/DUP-04) : interpole une valeur affichée de sa position courante vers
// `target` en rAF sur `duration` ms. Montée = animée (interpolation LINÉAIRE, pour
// que des segments de même pente s'enchaînent sans à-coup) ; baisse ou hors-domaine
// float = bascule instantanée. Renvoie la valeur affichée (number interpolé).
//
// `quantize(n)` (facultatif) : la CLÉ de ce que l'appelant affiche pour la valeur
// n (texte formaté, chiffres + pixel du roulis…). On ne re-rend que quand elle
// change. Sans elle, chaque image re-rendait le cadran — 60 rendus/s par compteur
// en permanence, puisque la durée (1100 ms) déborde le tick et que la boucle ne
// s'arrête donc jamais (PERF-39) — alors que l'écran, lui, ne bougeait qu'à
// quelques images par seconde. displayRef avance quand même à chaque image : une
// cible qui arrive en cours de route repart bien de la position réelle.
export function useCountUp(target, duration, quantize) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const targetRef = useRef(target);
  const displayRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  // Clé de la dernière valeur RENDUE par la boucle, et la fonction de clé du
  // dernier rendu (elle dépend d'un état de l'appelant : précision, régime…).
  const shownRef = useRef(undefined);
  const quantizeRef = useRef(quantize);
  useLayoutEffect(() => { quantizeRef.current = quantize; });

  useEffect(() => {
    if (target === targetRef.current) return undefined;

    // Baisse (achat/coût), hors domaine float, ou personne pour voir rouler :
    // bascule directe, pas d'anim.
    if (!Number.isFinite(target) || !Number.isFinite(displayRef.current) || target < displayRef.current || countUpStill()) {
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
    // Le rendu de la nouvelle cible a pu changer l'écran : la première image
    // re-rend toujours (un rendu par tick, rien à côté des 60 d'avant).
    shownRef.current = undefined;

    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const current = t >= 1
        ? targetRef.current
        : fromRef.current + (targetRef.current - fromRef.current) * t;
      displayRef.current = current;
      if (t >= 1) {
        // La dernière image rend TOUJOURS la cible exacte : c'est elle qui
        // déclenche l'état de repos des appelants (display === target).
        setDisplay(current);
      } else {
        const q = quantizeRef.current;
        const key = q ? q(current) : current;
        if (key !== shownRef.current) {
          shownRef.current = key;
          setDisplay(current);
        }
      }
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return display;
}
