import { useEffect, useRef } from 'react';

// Coquille commune des <dialog> modaux (audit G-70/DUP-07) : synchronise
// l'ouverture native (showModal/close) sur la prop `isOpen`, en évitant les
// exceptions (showModal sur un dialogue déjà ouvert, close sur un déjà fermé).
// Renvoie la ref à poser sur le <dialog>. (ChoiceDialog garde sa propre coquille.)
export function useDialogModal(isOpen) {
  const dialogRef = useRef(null);
  // Élément qui avait le focus AVANT l'ouverture (E8). Fermer un dialogue
  // renvoyait le focus au début du document : au clavier, il fallait retraverser
  // toute la barre latérale pour revenir au bouton qu'on venait d'actionner.
  const focusAvantRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (isOpen && !dialog.open) {
      // Capturé AVANT showModal : après, le focus est déjà dans le dialogue.
      focusAvantRef.current = document.activeElement;
      dialog.showModal();
    }
    if (!isOpen && dialog.open) dialog.close();

    // ⚠ LA RESTAURATION VIT DANS LE NETTOYAGE, et c'est la seule place qui
    // marche. App monte ces dialogues CONDITIONNELLEMENT — `{isOpen && <D/>}` —
    // donc `isOpen` ne repasse JAMAIS à false ici : le composant disparaît. Une
    // restauration écrite dans une branche `else` ne s'exécuterait jamais, ce
    // qui était le cas de la première version, vérifié en jeu (le focus
    // retombait sur <body>, soit exactement le défaut à corriger).
    return () => {
      // Fermer AVANT de rendre le focus : tant qu'une modale est ouverte, le
      // navigateur ignore un focus() posé en dehors d'elle.
      if (dialog.open) dialog.close();
      const cible = focusAvantRef.current;
      focusAvantRef.current = null;
      // `isConnected` : le bouton qui a ouvert le dialogue peut avoir été
      // démonté entre-temps (changement de vue, crise). Focaliser un élément
      // détaché ne lève pas, mais renvoie le focus au <body> — mieux vaut alors
      // ne rien faire que reproduire le défaut.
      if (cible && cible.isConnected && typeof cible.focus === "function") {
        try {
          cible.focus({ preventScroll: true });
        } catch {
          cible.focus();
        }
      }
    };
  }, [isOpen]);
  return dialogRef;
}
