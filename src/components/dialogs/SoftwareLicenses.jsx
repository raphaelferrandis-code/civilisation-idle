import { useState } from 'react';
import { tr } from '../../game/core/i18n.js';
import { loadLicenseTexts } from './licenseTexts.js';

// Ligne « Licences logicielles » de l'onglet Crédits (audit 2026-10-05,
// STEAM-5) : les notices MIT / OFL que ces licences imposent avec chaque copie.
// ⚠ Ne pas retirer : c'est ce qui rend la livraison conforme. Le champ en
// lecture seule reprend le style des textarea du jeu (base.css).
export default function SoftwareLicenses() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && text === null) {
      loadLicenseTexts().then((t) => setText(t), () => setText(''));
    }
  };

  return (
    <>
      <div className="options-row">
        <div>
          <span>{tr({ fr: "Licences logicielles", en: "Software licenses" })}</span>
          <small>
            {tr({
              fr: "React, break_infinity.js, Font Awesome et les quatre polices : notices de copyright et textes des licences (MIT, SIL Open Font 1.1, CC BY 4.0).",
              en: "React, break_infinity.js, Font Awesome and the four typefaces: copyright notices and license texts (MIT, SIL Open Font 1.1, CC BY 4.0)."
            })}
          </small>
        </div>
        <button type="button" aria-expanded={open} onClick={toggle}>
          {open ? tr({ fr: "Masquer", en: "Hide" }) : tr({ fr: "Afficher", en: "Show" })}
        </button>
      </div>
      {open && (
        <textarea
          readOnly
          aria-label={tr({ fr: "Textes des licences", en: "License texts" })}
          value={text === null ? "…" : (text || tr({ fr: "Textes absents de cette version.", en: "Texts missing from this build." }))}
        />
      )}
    </>
  );
}
