import { useState } from 'react';
import { fmt } from '../../game/core/utils.js';
import { toNum } from '../../game/core/num.js';
import { useCountUp } from '../../hooks/useCountUp.js';

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
export default function RollingNumber({ value, format = fmt, duration = DEFAULT_DURATION, pulse = false }) {
  const target = toNum(value);
  const display = useCountUp(target, duration);
  // Pulsation : re-monter le span .roll-pulse à chaque HAUSSE pour rejouer le
  // micro-bump CSS. `pulseKey` (compteur) + `prevTarget` (dernière cible vue)
  // sont ajustés PENDANT le render (pattern React « dériver l'état d'une prop »)
  // — ni ref lue au render, ni setState dans un effet.
  const [pulseKey, setPulseKey] = useState(0);
  const [prevTarget, setPrevTarget] = useState(target);

  // Détection de hausse pendant le render (guardée par `target !== prevTarget`
  // → pas de boucle) : incrémente la key sur une vraie montée, met à jour la
  // cible mémorisée sur tout changement (baisse comprise).
  if (pulse && target !== prevTarget) {
    if (target > prevTarget) setPulseKey((k) => k + 1);
    setPrevTarget(target);
  }

  // Au repos (anim terminée), on reformate la valeur d'origine — exacte pour les
  // très grands Decimal. En cours d'anim, on formate le number interpolé.
  const text = format(display === target ? value : display);
  if (!pulse) return text;
  // key = n° de pulsation : le span est re-monté à chaque hausse → l'animation
  // CSS .roll-pulse (micro-bump) se rejoue, calée sur le rythme du jeu.
  return <span className="roll-pulse" key={pulseKey}>{text}</span>;
}
