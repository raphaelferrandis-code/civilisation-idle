import { useEffect, useState } from 'react';
import { isCoarsePointer } from '../game/core/pointerMode.js';

/**
 * Le régime de pointage, en valeur RÉACTIVE.
 *
 * `isCoarsePointer()` suffit pour une décision prise une fois (l'état par défaut
 * d'un encart au montage). Il ne suffit PAS quand la disposition elle-même en
 * dépend : la barre basse ne porte pas les mêmes onglets au doigt et au curseur,
 * et le régime change en cours de partie plus souvent qu'on ne croit — tablette
 * qu'on pose sur son clavier, souris branchée en Bluetooth, fenêtre déplacée sur
 * un autre écran. `watchPointerMode()` met alors `data-pointer` à jour ; sans
 * quelqu'un pour l'écouter, React garderait la barre de l'ancien régime.
 *
 * ⚠ On observe l'ATTRIBUT plutôt que de refaire la détection : c'est
 * `applyPointerMode()` qui fait autorité, et deux détections indépendantes
 * finiraient par diverger d'une frame — le temps qu'il faut pour que le CSS et
 * le JSX se contredisent à l'écran.
 */
export function usePointerCoarse() {
  const [coarse, setCoarse] = useState(() => isCoarsePointer());

  useEffect(() => {
    const el = document.documentElement;
    // Resynchronisation immédiate : entre le premier rendu et cet effet,
    // `watchPointerMode()` a pu poser un verdict différent de celui qu'on avait
    // deviné (le forçage `?touch=` se lit avant, mais pas le filet des
    // `maxTouchPoints`).
    const sync = () => setCoarse(el.dataset.pointer === 'coarse');
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-pointer'] });
    return () => mo.disconnect();
  }, []);

  return coarse;
}
