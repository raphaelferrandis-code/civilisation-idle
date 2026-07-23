import { useEffect, useRef } from 'react';

// Coquille commune des <dialog> modaux (audit G-70/DUP-07) : synchronise
// l'ouverture native (showModal/close) sur la prop `isOpen`, en évitant les
// exceptions (showModal sur un dialogue déjà ouvert, close sur un déjà fermé).
// Renvoie la ref à poser sur le <dialog>. (ChoiceDialog garde sa propre coquille.)
export function useDialogModal(isOpen, onClose) {
  const dialogRef = useRef(null);
  // Gardé dans un ref : les appelants passent une lambda (`() => setOpen(false)`),
  // dont l'identité change à chaque rendu. La mettre en dépendance de l'effet le
  // relancerait sans cesse — donc fermer puis rouvrir la fenêtre en boucle.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Élément qui avait le focus AVANT l'ouverture (E8). Fermer un dialogue
  // renvoyait le focus au début du document : au clavier, il fallait retraverser
  // toute la barre latérale pour revenir au bouton qu'on venait d'actionner.
  const focusAvantRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    // ⚠ LE NAVIGATEUR PEUT FERMER UNE <dialog> TOUT SEUL (Échap, close() natif).
    // Sans resynchroniser l'état React, `isOpen` resterait à true : le composant
    // reste monté, la fenêtre fermée — donc invisible — et un nouveau clic ne
    // change plus rien (même valeur d'état → pas d'effet → jamais rouverte). Le
    // bouton paraît DÉFINITIVEMENT mort jusqu'au rechargement de la page.
    // La propriété React `onClose` ne suffit pas ici (l'évènement `close` ne
    // remonte pas) : c'est pour ça que ChoiceDialog écoute déjà en natif.
    const handleNativeClose = () => { onCloseRef.current?.(); };
    dialog.addEventListener("close", handleNativeClose);
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
      // Écouteur retiré AVANT le close() : sinon la fermeture de nettoyage
      // rappellerait onClose alors que l'appelant est déjà en train de fermer.
      dialog.removeEventListener("close", handleNativeClose);
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
