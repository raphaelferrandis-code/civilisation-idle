import { useRef, useState } from 'react';
import { useDialogModal } from '../../hooks/useDialogModal.js';
import { importSave, getLastImportRefusal } from '../../game/core/main.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { tr } from '../../game/core/i18n.js';

// Garde-fou du fichier choisi : une sauvegarde pèse quelques centaines de ko.
const IMPORT_FILE_MAX_BYTES = 64 * 1024 * 1024;

// Deux usages du même dialogue :
//   - import (défaut) : on colle un code de sauvegarde, ou on choisit le FICHIER
//     sorti par « Exporter en fichier » (audit 2026-10-05, SAV-14 — restaurer
//     obligeait à copier-coller ~450 ko de texte) ;
//   - LECTURE SEULE (readOnlyText) : repli d'export quand le presse-papiers a
//     échoué. Le texte est affiché, sélectionnable et copiable, là où le
//     `prompt()` natif qu'il remplace volait le focus et tronquait la chaîne.
export default function ImportDialog({ isOpen, onClose, readOnlyText = null }) {
  const dialogRef = useDialogModal(isOpen, onClose);
  const fileRef = useRef(null);
  const [text, setText] = useState("");
  const readOnly = readOnlyText !== null;

  const handleImport = (e) => {
    e.preventDefault();
    if (readOnly) { handleClose(); return; }
    if (!text.trim()) return;
    runImport(text);
  };

  // Le fichier choisi est importé tel quel, par le même chemin que le texte collé
  // (code de l'export ou JSON brut d'une copie de secours, cf. importSave).
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // le même fichier, choisi de nouveau, redéclenche l'import
    if (!file) return;
    let content = "";
    try {
      if (file.size <= IMPORT_FILE_MAX_BYTES) content = await file.text();
    } catch { /* illisible : annoncé juste dessous */ }
    if (!content.trim()) {
      pushOutcomeFloat({ label: tr({ fr: "Fichier illisible", en: "Unreadable file" }), kind: "cost" });
      return;
    }
    runImport(content);
  };

  const runImport = (content) => {
    // Plus d'alert() : le retour passe par la couche de toasts, déjà branchée
    // sur une région aria-live et traduite, contrairement aux fenêtres système.
    if (importSave(content)) {
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde importée", en: "Save imported" }), kind: "gain" });
      handleClose();
    } else if (getLastImportRefusal() === "newer") {
      // Code valide, mais d'une version plus récente du jeu (SAV-6) : il faut
      // mettre le jeu à jour, pas chercher un autre code.
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde d'une version plus récente du jeu", en: "Save from a newer version of the game" }), kind: "cost" });
    } else if (getLastImportRefusal() === "storage") {
      // Code valide, mais plus de place pour poser la partie avant le rechargement (SAV-8).
      pushOutcomeFloat({ label: tr({ fr: "Stockage plein : import impossible", en: "Storage full: cannot import" }), kind: "cost" });
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
      // Pas de `display: block` inline : il neutralisait le display:none natif
      // des dialogues fermés (une frame de flash hors modale à l'ouverture) —
      // useDialogModal gère déjà l'affichage.
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
          style={{ width: '100%', minHeight: '150px', padding: '0.5rem', resize: 'vertical' }}
        />
        <menu style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn-close" onClick={handleClose}>{tr({ fr: "Fermer", en: "Close" })}</button>
          {readOnly ? (
            <button type="button" className="confirm-btn" onClick={handleCopy}>{tr({ fr: "Copier", en: "Copy" })}</button>
          ) : (<>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.json,text/plain,application/json"
              hidden
              onChange={handleFile}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {tr({ fr: "Importer un fichier", en: "Import a file" })}
            </button>
            <button type="submit" className="confirm-btn">{tr({ fr: "Importer", en: "Import" })}</button>
          </>)}
        </menu>
      </form>
    </dialog>
  );
}
