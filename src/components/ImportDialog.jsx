import React, { useState, useEffect, useRef } from 'react';
import { importSave } from '../game/core/main.js';

export default function ImportDialog({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setText("");
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
      alert("Sauvegarde importée avec succès !");
      onClose();
    } else {
      alert("Échec de l'importation : texte de sauvegarde invalide.");
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="event-dialog import-dialog"
      style={{ display: 'block' }}
      onClose={onClose}
    >
      <form onSubmit={handleImport}>
        <h2>Importer une sauvegarde</h2>
        <textarea
          id="importText"
          spellCheck="false"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Collez votre code de sauvegarde ici..."
          style={{ width: '100%', minHeight: '150px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem', borderRadius: '4px', resize: 'vertical' }}
        />
        <menu style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>Annuler</button>
          <button type="submit" className="confirm-btn">Importer</button>
        </menu>
      </form>
    </dialog>
  );
}
