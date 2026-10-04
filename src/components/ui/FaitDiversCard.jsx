import { useEffect, useState } from 'react';
import { onFaitFocus, fdOpened, fdClose } from '../../game/map/faitsDivers/fdPick.js';
import { tr } from '../../game/core/i18n.js';
import '../../styles/faits-divers.css';

// LA RÉPLIQUE D'UN FAIT DIVERS — ce que dit le personnage qu'on vient de cliquer sur
// la carte (docs/PLAN-FAITS-DIVERS.md). Une plaque : qui parle, et sa phrase.
// Quand le clic inscrit un chapitre dans la Chronique, une plume s'y pose — sans un
// mot (règle de DA : aucune phrase d'explication à l'écran ; l'infobulle dit le reste).
// Même place que la fiche d'habitant (en bas à gauche) : l'une remplace l'autre.
export default function FaitDiversCard() {
  const [sheet, setSheet] = useState(() => fdOpened());

  useEffect(() => onFaitFocus((t) => setSheet(t ? fdOpened() : null)), []);

  // Échap ferme la plaque avant d'ouvrir les Options (écouteur en capture).
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      if (document.querySelector('.app[data-contemplation="on"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fdClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sheet]);

  if (!sheet) return null;
  const who = tr(sheet.who);
  const line = tr(sheet.line);
  // Une didascalie « (une bulle) » ne se met pas entre guillemets.
  const stage = line.startsWith('(');
  return (
    <aside className="fait-card" aria-label={who} aria-live="polite">
      <div className="fc-head">
        <strong className="fc-who">{who}</strong>
        {sheet.isNew && (
          <span
            className="fc-ink"
            title={tr({ fr: 'Inscrit dans la Chronique', en: 'Recorded in the Chronicle' })}
            aria-label={tr({ fr: 'Inscrit dans la Chronique', en: 'Recorded in the Chronicle' })}
          >
            <i className="fa-solid fa-feather-pointed" aria-hidden="true"></i>
          </span>
        )}
        <button
          type="button"
          className="btn-close fc-close"
          onClick={fdClose}
          aria-label={tr({ fr: 'Fermer (Échap)', en: 'Close (Esc)' })}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      {sheet.sub && <p className="fc-sub">{tr(sheet.sub)}</p>}
      <p className={`fc-line${stage ? ' is-stage' : ''}`}>
        {stage ? line : `${tr({ fr: '« ', en: '“' })}${line}${tr({ fr: ' »', en: '”' })}`}
      </p>
    </aside>
  );
}
