import { useCallback, useState } from 'react';

/**
 * État ouvert/replié d'un encart, mémorisé en localStorage (clé `hud:<storageKey>`,
 * indépendante de la sauvegarde du jeu) : il survit aux remontages (changement
 * d'onglet) et aux rechargements. Partagé par les encarts pliables du HUD Cité
 * (Régulation des tensions, Mythes, boutique de bâtiments…).
 */
export function useCollapsiblePanel(storageKey, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(`hud:${storageKey}`);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });

  const persist = useCallback((next) => {
    try {
      if (storageKey) localStorage.setItem(`hud:${storageKey}`, next ? '1' : '0');
    } catch {
      // localStorage indisponible : on garde quand même l'état en mémoire.
    }
    return next;
  }, [storageKey]);

  const toggle = useCallback(() => setOpen((o) => persist(!o)), [persist]);

  // Ouverture/fermeture PILOTÉE (et non basculée) : sert à déplier d'autorité un
  // encart qu'il serait dangereux de laisser fermé — la Régulation quand la crise
  // s'ouvre. Mémorisée comme un clic : le joueur retrouve l'état qu'il voit.
  // ⚠ Stable (useCallback) : les appelants la mettent en dépendance d'effet, une
  // identité qui change à chaque rendu y relancerait l'effet en boucle.
  const set = useCallback((v) => setOpen(() => persist(!!v)), [persist]);

  return [open, toggle, set];
}
