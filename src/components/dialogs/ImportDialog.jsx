import { useState, useEffect, useRef } from 'react';
import { importSave } from '../../game/core/main.js';
import { tr } from '../../game/core/i18n.js';

export default function ImportDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleImport = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    const success = importSave(text);
    if (success) {
      alert(tr({ fr: "Sauvegarde importee avec succes !", en: "Save imported successfully!" }));
      handleClose();
    } else {
      alert(tr({ fr: "Echec de l'importation : texte de sauvegarde invalide.", en: "Import failed: invalid save text." }));
    }
  };

  const handleClose = () => {
    setText("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog import-dialog"
      style={{ display: 'block' }}
      onClose={handleClose}
    >
      <form onSubmit={handleImport}>
        <h2>{tr({ fr: "Importer une sauvegarde", en: "Import a save" })}</h2>
        <textarea
          id="importText"
          spellCheck="false"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr({ fr: "Collez votre code de sauvegarde ici...", en: "Paste your save code here..." })}
          style={{ width: '100%', minHeight: '150px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem', borderRadius: '4px', resize: 'vertical' }}
        />
        <menu style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={handleClose}>{tr({ fr: "Annuler", en: "Cancel" })}</button>
          <button type="submit" className="confirm-btn">{tr({ fr: "Importer", en: "Import" })}</button>
        </menu>
      </form>
    </dialog>
  );
}
