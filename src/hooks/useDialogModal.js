import { useEffect, useRef } from 'react';

// Coquille commune des <dialog> modaux (audit G-70/DUP-07) : synchronise
// l'ouverture native (showModal/close) sur la prop `isOpen`, en évitant les
// exceptions (showModal sur un dialogue déjà ouvert, close sur un déjà fermé).
// Renvoie la ref à poser sur le <dialog>. (ChoiceDialog garde sa propre coquille.)
export function useDialogModal(isOpen) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);
  return dialogRef;
}
