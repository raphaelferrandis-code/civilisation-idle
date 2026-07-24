import { useState } from 'react';
import { useDialogModal } from '../../hooks/useDialogModal.js';
import { importSave } from '../../game/core/main.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { tr } from '../../game/core/i18n.js';

// Deux usages du même dialogue :
//   - import (défaut) : on colle un code de sauvegarde ;
//   - LECTURE SEULE (readOnlyText) : repli d'export quand le presse-papiers a
//     échoué. Le texte est affiché, sélectionnable et copiable, là où le
//     `prompt()` natif qu'il remplace volait le focus et tronquait la chaîne.
export default function ImportDialog({ isOpen, onClose, readOnlyText = null }) {
  const dialogRef = useDialogModal(isOpen, onClose);
  const [text, setText] = useState("");
  const readOnly = readOnlyText !== null;

  const handleImport = (e) => {
    e.preventDefault();
    if (readOnly) { handleClose(); return; }
    if (!text.trim()) return;

    // Plus d'alert() : le retour passe par la couche de toasts, déjà branchée
    // sur une région aria-live et traduite, contrairement aux fenêtres système.
    if (importSave(text)) {
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde importée", en: "Save imported" }), kind: "gain" });
      handleClose();
    } else {
      pushOutcomeFloat({ label: tr({ fr: "Code de sauvegarde invalide", en: "Invalid save code" }), kind: "cost" });
    }
  };

  const handleClose = () => {
    setText("");
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(readOnlyText);
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde copiée", en: "Save copied" }), kind: "gain" });
    } catch {
      // Le presse-papiers a déjà échoué une fois : on ne réessaie pas d'annoncer
      // un succès, le texte reste sélectionnable à la main juste au-dessus.
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog import-dialog"
      style={{ display: 'block' }}
      // Pas de `onClose` : useDialogModal s'en charge (cf. OptionsDialog). Le
      // `setText("")` de handleClose n'y perd rien — le composant est démonté
      // par App à la fermeture, son état part avec lui.
    >
      <form onSubmit={handleImport}>
        <h2>
          {readOnly
            ? tr({ fr: "Copier la sauvegarde", en: "Copy the save" })
            : tr({ fr: "Importer une sauvegarde", en: "Import a save" })}
        </h2>
        {readOnly && (
          <p>{tr({
            fr: "Le presse-papiers n'a pas répondu. Sélectionne ce texte et copie-le pour le conserver.",
            en: "The clipboard did not respond. Select this text and copy it to keep it."
          })}</p>
        )}
        <textarea
          id="importText"
          spellCheck="false"
          readOnly={readOnly}
          value={readOnly ? readOnlyText : text}
          onChange={(e) => setText(e.target.value)}
          onFocus={readOnly ? (e) => e.target.select() : undefined}
          placeholder={tr({ fr: "Collez votre code de sauvegarde ici...", en: "Paste your save code here..." })}
          style={{ width: '100%', minHeight: '150px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem', borderRadius: '4px', resize: 'vertical' }}
        />
        <menu style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={handleClose}>{tr({ fr: "Fermer", en: "Close" })}</button>
          {readOnly ? (
            <button type="button" className="confirm-btn" onClick={handleCopy}>{tr({ fr: "Copier", en: "Copy" })}</button>
          ) : (
            <button type="submit" className="confirm-btn">{tr({ fr: "Importer", en: "Import" })}</button>
          )}
        </menu>
      </form>
    </dialog>
  );
}
