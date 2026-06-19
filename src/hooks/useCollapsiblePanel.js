import { useState } from 'react';

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

  const toggle = () => setOpen((o) => {
    const next = !o;
    try {
      if (storageKey) localStorage.setItem(`hud:${storageKey}`, next ? '1' : '0');
    } catch {
      // localStorage indisponible : on garde quand même l'état en mémoire.
    }
    return next;
  });

  return [open, toggle];
}
