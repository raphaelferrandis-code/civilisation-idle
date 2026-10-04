import { useEffect, useState } from 'react';
import { fdChronicle, onFaitsDivers } from '../../game/core/faitsDivers.js';
import { EPOCHS } from '../../game/data/eraThemes.js';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

// LES FAITS DIVERS DANS LA CHRONIQUE (docs/PLAN-FAITS-DIVERS.md).
//
// Décisions de Raph (2026-10-04) : AUCUN indice — rien sur le lieu ni le moment
// d'un chapitre à venir, rien sur le nombre d'histoires ou de chapitres qui restent.
// Le panneau n'existe même pas tant que le joueur n'a rien vu : c'est la carte qui
// lui apprend qu'il y a des histoires, pas la Chronique.
// Même grammaire que le reste de la Bibliothèque : un chapitre = son titre ; son
// récit passe dans l'infobulle (aucune phrase à l'écran), comme les âges traversés.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const ageOf = (band) => tr((EPOCHS[Math.max(0, Math.min(EPOCHS.length - 1, band | 0))] || EPOCHS[0]).label);
// Le temps de jeu à vie, à la minute (même horloge que les frises du Registre).
function fmtAt(sec) {
  const m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600) % 24, j = Math.floor(sec / 86400);
  const pad = (n) => String(n).padStart(2, '0');
  if (j > 0) return `${j}j ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

export default function FaitsDiversChronique() {
  // La mémoire des faits divers change par mutation en place : le re-rendu suit son
  // compteur de révision (l'abonnement), pas un sélecteur d'état.
  const [, setRev] = useState(0);
  useEffect(() => onFaitsDivers(() => setRev((r) => r + 1)), []);
  const { stories, curios } = fdChronicle();
  if (!stories.length && !curios.length) return null;

  return (
    <div className="panel chronique-faits">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: 'Faits divers', en: 'Local Tales' })}</h2>
        </div>
      </div>
      {stories.map((s) => (
        <div className="chronicle-reg-block" key={s.id}>
          <div className="chronicle-bilan-head">
            <h3>{tr(s.title)}</h3>
            {s.done && (
              <span className="chronicle-reg-count" {...tipProps(tr(s.title), tr(s.trace))}>✦</span>
            )}
          </div>
          <ul className="chronicle-reg-list">
            {s.chapters.map((c, i) => (
              <li key={c.ch.id} className="chronicle-reg-row" tabIndex={0} {...tipProps(tr(c.ch.title), tr(c.ch.chronicle))}>
                <span className="chronicle-reg-badge">{ROMAN[i] || i + 1}</span>
                <span className="chronicle-reg-name">{tr(c.ch.title)}<em>{ageOf(c.band)}</em></span>
                <span className="chronicle-reg-meta">{fmtAt(c.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {curios.length > 0 && (
        <div className="chronicle-reg-block">
          <div className="chronicle-bilan-head">
            <h3>{tr({ fr: 'Curiosités', en: 'Curiosities' })}</h3>
          </div>
          <ul className="chronicle-reg-list">
            {curios.map(({ g, at, band }) => (
              <li key={g.id} className="chronicle-reg-row" tabIndex={0} {...tipProps(tr(g.title), tr(g.chronicle))}>
                <span className="chronicle-reg-badge">·</span>
                <span className="chronicle-reg-name">{tr(g.title)}<em>{ageOf(band)}</em></span>
                <span className="chronicle-reg-meta">{fmtAt(at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
